import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { DATA_DIR, openDb } from './db.js';
import { storageStatus } from './storage.js';
import { createApp } from './app.js';
import { seedDemo } from './seed.js';
import { runReminders } from './notify.js';

const db = openDb();
const dist = path.resolve('dist');

// Build id written by `npm run build` (see vite.config.js); used for the "new version" banner.
let version = 'dev';
try {
  version = JSON.parse(fs.readFileSync(path.join(dist, 'version.json'), 'utf8')).version;
} catch {
  /* not built yet */
}

const app = createApp(db, { version });

const storage = storageStatus(process.env.DATA_DIR || DATA_DIR);
console.log(`Data folder: ${storage.dir} (${storage.label})`);
if (storage.persistent === false) {
  console.warn('WARNING: the data folder is not on a persistent disk. Attach a disk and set DATA_DIR to its mount path, or all data will be lost on the next deploy.');
}

// Serve the built web app and fall back to index.html for client-side routes.
if (fs.existsSync(dist)) {
  app.use(express.static(dist, {
    index: false,
    maxAge: '1y',
    // Hashed assets can be cached forever; everything else must be re-checked so updates show up.
    setHeaders: (res, file) => {
      if (!file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('cache-control', 'no-cache');
    },
  }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.set('cache-control', 'no-cache').sendFile(path.join(dist, 'index.html')));
}

// On a fresh hosted database, optionally load the demo squad so there's something to try.
if (process.env.SEED_DEMO === 'true' && (await seedDemo(db))) console.log('Loaded demo data');

// Daily check-in reminders: checked every minute against each athlete's local time.
setInterval(() => {
  try {
    runReminders(db, app.locals.notify);
  } catch (e) {
    console.error('Reminder run failed', e);
  }
}, 60_000).unref();

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Training app listening on http://localhost:${port} (build ${version})`));

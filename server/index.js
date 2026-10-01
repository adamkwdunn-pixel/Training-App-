import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { seedDemo } from './seed.js';

const db = openDb();
const app = createApp(db);

// Serve the built web app (npm run build) and fall back to index.html for client-side routes.
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// On a fresh hosted database, optionally load the demo squad so there's something to try.
if (process.env.SEED_DEMO === 'true' && (await seedDemo(db))) console.log('Loaded demo data');

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Training app listening on http://localhost:${port}`));

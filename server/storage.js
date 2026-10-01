// Is the data folder on a permanent disk? On hosts like Render, anything outside an attached
// disk is wiped on every deploy or restart — this lets the app warn the coach instead of losing data silently.
import fs from 'node:fs';
import path from 'node:path';

export function storageStatus(dataDir) {
  const dir = path.resolve(dataDir);
  const hosted = !!(process.env.RENDER || process.env.RENDER_SERVICE_ID);
  if (!hosted) return { dir, hosted, persistent: null, label: 'Local folder' };
  let persistent = false;
  try {
    // A disk shows up as its own mount point containing the data folder (anything but "/").
    const mounts = fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n').map((l) => l.split(' ')[4]).filter(Boolean);
    persistent = mounts.some((m) => m !== '/' && (dir === m || dir.startsWith(`${m}/`)) && !m.startsWith('/proc') && !m.startsWith('/sys') && !m.startsWith('/dev'));
  } catch {
    try {
      persistent = fs.statSync(dir).dev !== fs.statSync('/').dev;
    } catch {
      persistent = false;
    }
  }
  return {
    dir, hosted, persistent,
    label: persistent ? 'Permanent disk' : 'TEMPORARY — wiped on every update or restart',
    data_dir_set: !!process.env.DATA_DIR,
  };
}

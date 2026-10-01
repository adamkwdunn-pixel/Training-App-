import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coach','athlete')),
  coach_id INTEGER REFERENCES users(id),
  invite_code TEXT UNIQUE,
  position TEXT,
  bodyweight REAL,
  load_increment REAL NOT NULL DEFAULT 2.5,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'strength',   -- strength | power | speed | conditioning | mobility | other
  metric TEXT NOT NULL DEFAULT 'load',          -- load | time | distance | height | reps | velocity
  demo_url TEXT,
  cues TEXT
);

CREATE TABLE IF NOT EXISTS progression_rules (
  id INTEGER PRIMARY KEY,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  config TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  weeks INTEGER NOT NULL DEFAULT 4,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS program_days (
  id INTEGER PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  day INTEGER NOT NULL,
  title TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id INTEGER PRIMARY KEY,
  day_id INTEGER NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  position INTEGER NOT NULL DEFAULT 0,
  block TEXT,                 -- e.g. "A1", "Speed", "Warm-up"
  sets INTEGER,
  reps TEXT,
  load_type TEXT NOT NULL DEFAULT 'none',  -- percent | rir | rpe | fixed | bodyweight | none
  percent REAL,
  rir REAL,                   -- target RIR (also used as the target for % work)
  rpe REAL,
  fixed_load REAL,
  target TEXT,                -- free text, e.g. "30 m flying", "< 4.1 s"
  target_value REAL,          -- numeric target for rules (e.g. seconds)
  rest_seconds INTEGER,
  tempo TEXT,
  notes TEXT,
  progression TEXT NOT NULL DEFAULT 'inherit',  -- inherit (use the assignment's rule) | rule | none
  rule_id INTEGER REFERENCES progression_rules(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  rule_id INTEGER REFERENCES progression_rules(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-athlete, per-exercise numbers the rules move: max (1RM / training max) and a load adjustment.
CREATE TABLE IF NOT EXISTS athlete_exercise_state (
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  max REAL,
  load_offset REAL NOT NULL DEFAULT 0,
  success_streak INTEGER NOT NULL DEFAULT 0,
  fail_streak INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (athlete_id, exercise_id)
);

CREATE TABLE IF NOT EXISTS workout_logs (
  id INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id INTEGER REFERENCES assignments(id) ON DELETE SET NULL,
  day_id INTEGER REFERENCES program_days(id) ON DELETE SET NULL,
  title TEXT,
  performed_on TEXT NOT NULL,
  session_rpe REAL,
  notes TEXT,
  coach_seen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS set_logs (
  id INTEGER PRIMARY KEY,
  workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  set_number INTEGER NOT NULL,
  target_load REAL,
  weight REAL,
  reps INTEGER,
  rir REAL,
  time_seconds REAL,
  result REAL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS progression_events (
  id INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  workout_log_id INTEGER REFERENCES workout_logs(id) ON DELETE CASCADE,
  rule_name TEXT,
  matched TEXT,
  summary TEXT NOT NULL,
  flagged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
  workout_log_id INTEGER REFERENCES workout_logs(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | reviewed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Feedback threads: attached to a workout, a video, or the athlete in general.
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('general','workout','video')),
  target_id INTEGER,
  body TEXT NOT NULL,
  read_by_recipient INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_logs_athlete ON workout_logs(athlete_id, performed_on);
CREATE INDEX IF NOT EXISTS idx_sets_log ON set_logs(workout_log_id);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(athlete_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_days_program ON program_days(program_id, week, day);
CREATE INDEX IF NOT EXISTS idx_rx_day ON prescriptions(day_id, position);
`;

export function openDb(file = process.env.DB_FILE || path.join(DATA_DIR, 'training.db')) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/** Run fn inside a transaction. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

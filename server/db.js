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
  target_type TEXT NOT NULL CHECK (target_type IN ('general','workout','video','injury')),
  target_id INTEGER,
  body TEXT NOT NULL,
  read_by_recipient INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- nutrition ----------
CREATE TABLE IF NOT EXISTS nutrition_profiles (
  athlete_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  activity REAL NOT NULL DEFAULT 1.55,
  goal TEXT NOT NULL DEFAULT 'maintain',      -- maintain | gain | lose
  rate REAL NOT NULL DEFAULT 0.25,            -- kg per week for gain / lose
  bmr_equation TEXT NOT NULL DEFAULT 'mifflin', -- mifflin | katch
  macro_mode TEXT NOT NULL DEFAULT 'per_kg',  -- per_kg | percent (carbs always fill the remainder)
  protein_g_per_kg REAL NOT NULL DEFAULT 2.0,
  fat_g_per_kg REAL NOT NULL DEFAULT 1.0,
  protein_pct REAL NOT NULL DEFAULT 30,
  fat_pct REAL NOT NULL DEFAULT 25,
  kcal_override REAL,                         -- coach can pin a calorie target
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bodyweight_logs (
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_on TEXT NOT NULL,
  weight REAL NOT NULL,
  PRIMARY KEY (athlete_id, measured_on)
);

CREATE TABLE IF NOT EXISTS body_measurements (
  id INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_on TEXT NOT NULL,
  method TEXT NOT NULL,                       -- navy | jp3 | jp7 | other
  inputs TEXT NOT NULL DEFAULT '{}',          -- JSON: skinfolds (mm) or circumferences (cm)
  bodyweight REAL,
  body_fat_pct REAL NOT NULL,
  sum_mm REAL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- recovery ----------
CREATE TABLE IF NOT EXISTS readiness (
  id INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  sleep_hours REAL,
  sleep_quality INTEGER,
  energy INTEGER,
  soreness INTEGER,
  stress INTEGER,
  mood INTEGER,
  score INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (athlete_id, day)
);

CREATE TABLE IF NOT EXISTS injuries (
  id INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area TEXT NOT NULL,
  side TEXT,                                  -- left | right | both | n/a
  description TEXT,
  pain INTEGER,                               -- 0-10
  status TEXT NOT NULL DEFAULT 'new',         -- new | monitoring | rehab | resolved
  availability TEXT NOT NULL DEFAULT 'modified', -- full | modified | unavailable
  reported_on TEXT NOT NULL,
  resolved_on TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS protocols (
  id INTEGER PRIMARY KEY,
  coach_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'mobility',  -- mobility | prehab | rehab | recovery
  description TEXT,
  items TEXT NOT NULL DEFAULT '[]'            -- JSON [{ name, dose, notes, video_url }]
);

CREATE TABLE IF NOT EXISTS protocol_assignments (
  id INTEGER PRIMARY KEY,
  protocol_id INTEGER NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  frequency TEXT,
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS protocol_completions (
  assignment_id INTEGER NOT NULL REFERENCES protocol_assignments(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  PRIMARY KEY (assignment_id, day)
);

-- ---------- testing ----------
CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY,
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  tested_on TEXT NOT NULL,
  weight REAL NOT NULL,
  reps INTEGER NOT NULL DEFAULT 1,
  e1rm REAL,
  bodyweight REAL,
  video_id INTEGER REFERENCES videos(id) ON DELETE SET NULL,
  notes TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- notifications ----------
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  muted TEXT NOT NULL DEFAULT '[]',         -- JSON list of notification types turned off
  reminder_time TEXT NOT NULL DEFAULT '08:00',
  timezone TEXT,
  last_reminder_on TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications ON notifications(user_id, read, id);
CREATE INDEX IF NOT EXISTS idx_bodycomp ON body_measurements(athlete_id, measured_on);
CREATE INDEX IF NOT EXISTS idx_readiness ON readiness(athlete_id, day);
CREATE INDEX IF NOT EXISTS idx_tests ON test_results(athlete_id, exercise_id, tested_on);
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
  migrate(db);
  return db;
}

// Bring databases created by earlier versions up to date.
function migrate(db) {
  const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  for (const [col, type] of [['sex', 'TEXT'], ['birth_date', 'TEXT'], ['height_cm', 'REAL'], ['must_change_password', 'INTEGER NOT NULL DEFAULT 0'], ['linked_user_id', 'INTEGER']]) {
    if (!cols.has(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
  }
  // Programs gained a default progression rule.
  if (!db.prepare('PRAGMA table_info(programs)').all().some((c) => c.name === 'rule_id')) db.exec('ALTER TABLE programs ADD COLUMN rule_id INTEGER');
  const np = new Set(db.prepare('PRAGMA table_info(nutrition_profiles)').all().map((c) => c.name));
  for (const [col, def] of [['bmr_equation', "TEXT NOT NULL DEFAULT 'mifflin'"], ['macro_mode', "TEXT NOT NULL DEFAULT 'per_kg'"],
    ['fat_g_per_kg', 'REAL NOT NULL DEFAULT 1.0'], ['protein_pct', 'REAL NOT NULL DEFAULT 30']]) {
    if (!np.has(col)) db.exec(`ALTER TABLE nutrition_profiles ADD COLUMN ${col} ${def}`);
  }
  // Comments gained the 'injury' thread type; SQLite can't alter a CHECK, so rebuild the table.
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'comments'").get()?.sql || '';
  if (!sql.includes("'injury'")) {
    tx(db, () => {
      db.exec('ALTER TABLE comments RENAME TO comments_old');
      db.exec(SCHEMA);
      db.exec('INSERT INTO comments SELECT * FROM comments_old; DROP TABLE comments_old;');
    });
    db.exec(SCHEMA);
  }
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

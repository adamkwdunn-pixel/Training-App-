import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DATA_DIR, UPLOAD_DIR, tx } from './db.js';
import { storageStatus } from './storage.js';
import { sleepDebt, DEBT_WINDOW_DAYS } from '../shared/sleep.js';
import { ageFrom, weeklyRate, withTrend } from '../shared/nutrition.js';
import { composition } from '../shared/bodyfat.js';
import { authenticate, hashPassword, verifyPassword, issueToken, newInviteCode, publicUser } from './auth.js';
import { targetLoad, estimate1RM } from './lib/loads.js';
import { computeMetrics, applyRule, METRICS, OPS, ACTIONS, PRESET_RULES } from './lib/progression.js';
import { registerTesting, ensureMainLifts } from './routes/testing.js';
import { registerNutrition } from './routes/nutrition.js';
import { registerRecovery, seedProtocols } from './routes/recovery.js';
import { createNotifier, registerNotifications, webPushSender } from './notify.js';
import { createMailer, loginEmail, tempPassword } from './mail.js';
import { createFoodEstimator } from './lib/food-ai.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const str = (v) => (v == null || v === '' ? null : String(v));
const today = () => new Date().toISOString().slice(0, 10);

const LOAD_TYPES = ['percent', 'rir', 'rpe', 'fixed', 'bodyweight', 'none'];
const CATEGORIES = ['strength', 'power', 'speed', 'conditioning', 'mobility', 'other'];
const EXERCISE_METRICS = ['load', 'time', 'distance', 'height', 'reps', 'velocity'];
const COMMENT_TYPES = ['general', 'workout', 'video', 'injury'];

export function createApp(db, { uploadDir = UPLOAD_DIR, maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 300), push, version = 'dev', mailer = createMailer(), estimator = createFoodEstimator() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render's proxy: lets req.protocol report https
  app.use(express.json({ limit: '2mb' }));
  const storage = storageStatus(process.env.DATA_DIR || DATA_DIR);
  const startedAt = new Date().toISOString();
  app.get('/api/health', (_req, res) => res.set('cache-control', 'no-store').json({
    ok: true, version, started_at: startedAt,
    storage: storage.persistent === null ? 'local' : storage.persistent ? 'permanent disk' : 'TEMPORARY - data is lost on every update or restart',
  }));
  // The web app compares this with its own build id and offers a refresh when they differ.
  app.get('/api/version', (_req, res) => res.set('cache-control', 'no-store').json({ version }));
  app.use('/api', authenticate(db));

  const q = (sql) => db.prepare(sql);
  // push: a custom sender (tests), null to disable, or undefined for real Web Push.
  const notify = createNotifier(db, push === undefined ? webPushSender(db) : push);
  app.locals.notify = notify;
  const first = (name) => String(name).split(' ')[0];
  const clip = (t, n = 140) => (t && t.length > n ? `${t.slice(0, n - 1)}…` : t);

  // ---------- access helpers ----------
  const requireUser = (req) => req.user || fail(401, 'Please sign in');
  const requireCoach = (req) => {
    const u = requireUser(req);
    if (u.role !== 'coach') fail(403, 'Coach only');
    return u;
  };
  const coachIdOf = (u) => (u.role === 'coach' ? u.id : u.coach_id);

  /** Returns the athlete row if the current user may see/act on it. */
  const athleteFor = (req, athleteId) => {
    const u = requireUser(req);
    const a = q("SELECT * FROM users WHERE id = ? AND role = 'athlete'").get(Number(athleteId));
    if (!a) fail(404, 'Athlete not found');
    if (u.id === a.id || (u.role === 'coach' && a.coach_id === u.id)) return a;
    fail(403, 'Not your athlete');
  };

  const ownedBy = (table, id, coachId, what) => {
    const row = q(`SELECT * FROM ${table} WHERE id = ?`).get(Number(id));
    if (!row || row.coach_id !== coachId) fail(404, `${what} not found`);
    return row;
  };
  const programForCoach = (req, id) => ownedBy('programs', id, requireCoach(req).id, 'Program');
  const dayForCoach = (req, dayId) => {
    const day = q('SELECT * FROM program_days WHERE id = ?').get(Number(dayId)) || fail(404, 'Day not found');
    programForCoach(req, day.program_id);
    return day;
  };

  // ---------- auth ----------
  app.post('/api/auth/register', (req, res) => {
    const { name, email, password, role, invite_code, coach_key } = req.body || {};
    if (!name || !email || !password) fail(400, 'Name, email and password are required');
    if (String(password).length < 8) fail(400, 'Password must be at least 8 characters');
    if (q('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'That email is already registered');

    let coachId = null;
    let finalRole = 'athlete';
    if (role === 'coach') {
      const hasCoach = q("SELECT 1 FROM users WHERE role = 'coach'").get();
      const key = process.env.COACH_SIGNUP_KEY;
      // The first account can always become the head coach; after that a signup key is needed.
      if (hasCoach && (!key || coach_key !== key)) fail(403, 'Coach sign-up needs the coach key from the head coach');
      finalRole = 'coach';
    } else {
      const coach = q("SELECT id FROM users WHERE role = 'coach' AND invite_code = ?").get(String(invite_code || '').trim().toUpperCase());
      if (!coach) fail(400, 'Invalid team code — ask your coach for it');
      coachId = coach.id;
    }

    const info = q(
      'INSERT INTO users (name, email, password_hash, role, coach_id, invite_code) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(String(name).trim(), String(email).trim(), hashPassword(String(password)), finalRole, coachId, finalRole === 'coach' ? newInviteCode() : null);
    const user = q('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    if (finalRole === 'coach') seedCoachDefaults(db, user.id);
    else notify(coachId, { type: 'join', title: `${user.name} joined your squad`, body: 'Assign them a program to get started.', link: `/athletes/${user.id}?tab=program` });
    res.status(201).json({ token: issueToken(db, user.id), user: publicUser(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const user = q('SELECT * FROM users WHERE email = ?').get(String(email || '').trim());
    if (!user || !verifyPassword(String(password || ''), user.password_hash)) fail(401, 'Wrong email or password');
    res.json({ token: issueToken(db, user.id), user: publicUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (req.token) q('DELETE FROM auth_tokens WHERE token = ?').run(req.token);
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) => {
    const u = requireUser(req);
    const coach = u.coach_id ? q('SELECT id, name, email FROM users WHERE id = ?').get(u.coach_id) : null;
    // Coaches get a health summary so problems with hosting show up in the app, not as lost data.
    const system = u.role === 'coach' ? {
      version, started_at: startedAt, storage, email_configured: mailer.configured, ai_configured: !!estimator,
      push_keys: !!q("SELECT 1 FROM app_settings WHERE key = 'vapid'").get() || !!process.env.VAPID_PUBLIC_KEY,
    } : undefined;
    res.json({ user: publicUser(u), coach, system });
  });

  app.patch('/api/me', (req, res) => {
    const u = requireUser(req);
    const b = req.body || {};
    if (b.new_password) {
      if (!verifyPassword(String(b.current_password || ''), u.password_hash)) fail(400, 'Current password is wrong');
      if (String(b.new_password).length < 8) fail(400, 'Password must be at least 8 characters');
      q('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPassword(String(b.new_password)), u.id);
    }
    q('UPDATE users SET name = COALESCE(?, name), position = ?, bodyweight = ? WHERE id = ?').run(
      str(b.name), str(b.position ?? u.position), num(b.bodyweight ?? u.bodyweight), u.id,
    );
    res.json({ user: publicUser(q('SELECT * FROM users WHERE id = ?').get(u.id)) });
  });

  // ---------- coach ⇄ own athlete profile ----------
  // The coach can train too: a separate athlete account in their own squad, linked both ways,
  // so they can flip between views without logging out.
  app.post('/api/me/athlete-profile', (req, res) => {
    const coach = requireCoach(req);
    if (coach.linked_user_id && q('SELECT 1 FROM users WHERE id = ?').get(coach.linked_user_id)) fail(409, 'You already have an athlete profile');
    const [local, domain] = String(coach.email).split('@');
    let email = `${local}+athlete@${domain}`;
    for (let n = 2; q('SELECT 1 FROM users WHERE email = ?').get(email); n++) email = `${local}+athlete${n}@${domain}`;
    const id = tx(db, () => {
      const athleteId = Number(q(`INSERT INTO users (name, email, password_hash, role, coach_id, linked_user_id, sex, birth_date, height_cm, bodyweight)
        VALUES (?, ?, ?, 'athlete', ?, ?, ?, ?, ?, ?)`).run(
        coach.name, email, hashPassword(crypto.randomBytes(24).toString('base64url')), coach.id, coach.id,
        coach.sex, coach.birth_date, coach.height_cm, coach.bodyweight,
      ).lastInsertRowid);
      q('UPDATE users SET linked_user_id = ? WHERE id = ?').run(athleteId, coach.id);
      return athleteId;
    });
    res.status(201).json({ id, email });
  });

  app.post('/api/me/switch', (req, res) => {
    const u = requireUser(req);
    const other = u.linked_user_id ? q('SELECT * FROM users WHERE id = ?').get(u.linked_user_id) : null;
    if (!other || other.linked_user_id !== u.id) fail(404, 'No linked profile to switch to');
    res.json({ token: issueToken(db, other.id), user: publicUser(other) });
  });

  app.post('/api/me/invite-code', (req, res) => {
    const u = requireCoach(req);
    const code = newInviteCode();
    q('UPDATE users SET invite_code = ? WHERE id = ?').run(code, u.id);
    res.json({ invite_code: code });
  });

  // ---------- athletes (coach) ----------
  app.get('/api/athletes', (req, res) => {
    const u = requireCoach(req);
    const rows = q(`
      SELECT u.id, u.name, u.email, u.position, u.bodyweight,
        (SELECT MAX(performed_on) FROM workout_logs w WHERE w.athlete_id = u.id) AS last_session,
        (SELECT COUNT(*) FROM workout_logs w WHERE w.athlete_id = u.id AND w.performed_on >= date('now','-7 days')) AS sessions_7d,
        (SELECT COUNT(*) FROM workout_logs w WHERE w.athlete_id = u.id AND w.coach_seen = 0) AS unseen_logs,
        (SELECT COUNT(*) FROM videos v WHERE v.athlete_id = u.id AND v.status = 'pending') AS pending_videos,
        (SELECT COUNT(*) FROM progression_events e WHERE e.athlete_id = u.id AND e.flagged = 1) AS flags,
        (SELECT COUNT(*) FROM comments c WHERE c.athlete_id = u.id AND c.author_id = u.id AND c.read_by_recipient = 0) AS unread_messages,
        (SELECT p.name FROM assignments a JOIN programs p ON p.id = a.program_id
           WHERE a.athlete_id = u.id AND a.active = 1 ORDER BY a.start_date DESC LIMIT 1) AS program
      FROM users u WHERE u.coach_id = ? AND u.role = 'athlete' ORDER BY u.name`).all(u.id);
    for (const r of rows) r.is_me = r.id === u.linked_user_id;
    res.json({ athletes: rows, invite_code: u.invite_code, has_athlete_profile: rows.some((r) => r.is_me), email_configured: mailer.configured });
  });

  const appUrl = (req) => (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

  /** Email an athlete their login details. Never throws: the coach always gets the details back to share by hand. */
  async function sendLogin(req, coach, athlete, password, reset) {
    const login = { url: appUrl(req), email: athlete.email, password };
    if (!mailer.configured) return { login, email_sent: false, email_error: 'Email isn’t set up on the server yet — share these details yourself.' };
    try {
      const m = loginEmail({ athleteName: athlete.name, coachName: coach.name, ...login, reset });
      await mailer.send({ to: athlete.email, replyTo: coach.email, ...m });
      return { login, email_sent: true };
    } catch (e) {
      console.warn('Login email failed:', e.message);
      return { login, email_sent: false, email_error: `The email couldn’t be sent (${e.message}). Share these details yourself.` };
    }
  }

  app.post('/api/athletes', async (req, res) => {
    const coach = requireCoach(req);
    const { name, email, position } = req.body || {};
    if (!name || !email) fail(400, 'Name and email are required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) fail(400, 'That doesn’t look like an email address');
    if (q('SELECT 1 FROM users WHERE email = ?').get(String(email).trim())) fail(409, 'That email is already registered');
    const password = req.body.password ? String(req.body.password) : tempPassword(crypto.randomBytes);
    if (password.length < 8) fail(400, 'Password must be at least 8 characters');
    const info = q("INSERT INTO users (name, email, password_hash, role, coach_id, position, must_change_password) VALUES (?, ?, ?, 'athlete', ?, ?, 1)").run(
      String(name).trim(), String(email).trim(), hashPassword(password), coach.id, str(position),
    );
    const athlete = q('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    const sent = req.body.send_email === false ? { login: { url: appUrl(req), email: athlete.email, password }, email_sent: false } : await sendLogin(req, coach, athlete, password, false);
    res.status(201).json({ id: athlete.id, ...sent });
  });

  // Reset an athlete's password to a new temporary one and send it to them.
  app.post('/api/athletes/:id/send-login', async (req, res) => {
    const coach = requireCoach(req);
    const a = athleteFor(req, req.params.id);
    if (a.linked_user_id === coach.id) fail(400, 'That’s your own athlete profile — use “Switch to athlete view” instead');
    const password = tempPassword(crypto.randomBytes);
    q('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hashPassword(password), a.id);
    q('DELETE FROM auth_tokens WHERE user_id = ?').run(a.id); // signs them out everywhere
    res.json(await sendLogin(req, coach, a, password, true));
  });

  app.get('/api/athletes/:id', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const states = q(`
      SELECT s.*, e.name AS exercise_name, e.metric, e.category FROM athlete_exercise_state s
      JOIN exercises e ON e.id = s.exercise_id WHERE s.athlete_id = ? ORDER BY e.name`).all(a.id);
    const assignments = q(`
      SELECT a.*, p.name AS program_name, r.name AS rule_name FROM assignments a
      JOIN programs p ON p.id = a.program_id LEFT JOIN progression_rules r ON r.id = a.rule_id
      WHERE a.athlete_id = ? ORDER BY a.active DESC, a.start_date DESC`).all(a.id);
    const events = q(`
      SELECT ev.*, e.name AS exercise_name FROM progression_events ev JOIN exercises e ON e.id = ev.exercise_id
      WHERE ev.athlete_id = ? ORDER BY ev.id DESC LIMIT 30`).all(a.id);
    const athlete = { ...publicUser(a), ...(req.user.role === 'coach' ? { notes: a.notes } : {}) };
    res.json({ athlete, states, assignments, events, snapshot: snapshotOf(a, str(req.query.today) || today()) });
  });

  /** Key numbers for the top of an athlete's page. */
  function snapshotOf(a, day) {
    const weights = withTrend(q('SELECT measured_on AS date, weight FROM bodyweight_logs WHERE athlete_id = ? ORDER BY measured_on').all(a.id));
    const bf = q('SELECT * FROM body_measurements WHERE athlete_id = ? ORDER BY measured_on DESC, id DESC LIMIT 1').get(a.id);
    const ready = q("SELECT AVG(score) AS avg, COUNT(*) AS n FROM readiness WHERE athlete_id = ? AND day > date(?, '-7 days') AND day <= ?").get(a.id, day, day);
    const nights = q(`SELECT day, sleep_hours FROM readiness WHERE athlete_id = ? AND day > date(?, '-${DEBT_WINDOW_DAYS} days') AND day <= ?`).all(a.id, day, day);
    const sessions = q("SELECT COUNT(*) AS n, MAX(performed_on) AS last FROM workout_logs WHERE athlete_id = ? AND performed_on > date(?, '-7 days')").get(a.id, day);
    const lastSession = q('SELECT MAX(performed_on) AS d FROM workout_logs WHERE athlete_id = ?').get(a.id).d;
    const injuries = q("SELECT area, side, availability FROM injuries WHERE athlete_id = ? AND status != 'resolved'").all(a.id);
    const program = q(`SELECT p.name FROM assignments s JOIN programs p ON p.id = s.program_id
      WHERE s.athlete_id = ? AND s.active = 1 ORDER BY s.start_date DESC LIMIT 1`).get(a.id)?.name ?? null;
    return {
      age: ageFrom(a.birth_date),
      bodyweight: weights.at(-1)?.weight ?? a.bodyweight ?? null,
      bodyweight_trend: weights.at(-1)?.trend ?? null,
      bodyweight_rate: weeklyRate(weights, 28),
      body_fat_pct: bf?.body_fat_pct ?? null,
      body_fat_on: bf?.measured_on ?? null,
      lean_mass: bf ? composition(a.bodyweight || bf.bodyweight, bf.body_fat_pct).lean_mass : null,
      readiness_7d: ready.avg != null ? Math.round(ready.avg) : null,
      checkins_7d: ready.n,
      sleep_debt: sleepDebt(nights, day),
      sessions_7d: sessions.n,
      last_session: lastSession,
      injuries,
      program,
    };
  }

  // Coach edits an athlete's details. Only the fields sent are changed.
  app.patch('/api/athletes/:id', (req, res) => {
    requireCoach(req);
    const a = athleteFor(req, req.params.id);
    const b = req.body || {};
    const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
    let email = a.email;
    if (has('email')) {
      email = String(b.email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'That doesn’t look like an email address');
      if (email.toLowerCase() !== a.email.toLowerCase() && q('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'Another account already uses that email');
    }
    if (has('name') && !str(b.name)) fail(400, 'Name can’t be empty');
    const height = has('height_cm') ? num(b.height_cm) : a.height_cm;
    if (height != null && (height < 120 || height > 230)) fail(400, 'Height should be in cm (120–230)');
    const weight = has('bodyweight') ? num(b.bodyweight) : null;
    if (weight != null && (weight < 30 || weight > 250)) fail(400, 'Bodyweight should be in kg (30–250)');
    tx(db, () => {
      q(`UPDATE users SET name = ?, email = ?, position = ?, sex = ?, birth_date = ?, height_cm = ?, load_increment = ?, notes = ? WHERE id = ?`).run(
        has('name') ? String(b.name).trim() : a.name,
        email,
        has('position') ? str(b.position) : a.position,
        has('sex') ? (['male', 'female'].includes(b.sex) ? b.sex : null) : a.sex,
        has('birth_date') ? str(b.birth_date) : a.birth_date,
        height,
        num(b.load_increment) || a.load_increment,
        has('notes') ? str(b.notes) : a.notes,
        a.id,
      );
      // A changed bodyweight is recorded as today's weigh-in so trends stay consistent.
      if (weight != null && weight !== a.bodyweight) {
        q(`INSERT INTO bodyweight_logs (athlete_id, measured_on, weight) VALUES (?, ?, ?)
           ON CONFLICT (athlete_id, measured_on) DO UPDATE SET weight = excluded.weight`).run(a.id, str(b.today) || today(), weight);
        q('UPDATE users SET bodyweight = ? WHERE id = ?').run(weight, a.id);
      }
    });
    const fresh = q('SELECT * FROM users WHERE id = ?').get(a.id);
    res.json({ athlete: { ...publicUser(fresh), notes: fresh.notes } });
  });

  app.delete('/api/athletes/:id', (req, res) => {
    requireCoach(req);
    const a = athleteFor(req, req.params.id);
    // Removes the athlete from the squad; their account and history stay.
    q('UPDATE users SET coach_id = NULL WHERE id = ?').run(a.id);
    q('UPDATE assignments SET active = 0 WHERE athlete_id = ?').run(a.id);
    res.json({ ok: true });
  });

  // Coach (or the athlete after a test) sets a max / load adjustment for an exercise.
  app.put('/api/athletes/:id/state/:exerciseId', (req, res) => {
    const u = requireUser(req);
    const a = athleteFor(req, req.params.id);
    const ex = ownedBy('exercises', req.params.exerciseId, a.coach_id, 'Exercise');
    const b = req.body || {};
    const cur = getState(a.id, ex.id);
    const max = b.max === undefined ? cur.max : num(b.max);
    const offset = u.role === 'coach' && b.load_offset !== undefined ? num(b.load_offset) || 0 : cur.load_offset;
    saveState(a.id, ex.id, { ...cur, max, load_offset: offset });
    const parts = [];
    if (max !== cur.max) parts.push(cur.max == null ? `Max set to ${max} kg` : `Max ${cur.max} → ${max ?? '—'} kg`);
    if (offset !== cur.load_offset) parts.push(`Load adjustment ${cur.load_offset} → ${offset} kg`);
    if (parts.length) {
      q('INSERT INTO progression_events (athlete_id, exercise_id, rule_name, matched, summary) VALUES (?, ?, ?, ?, ?)').run(
        a.id, ex.id, u.role === 'coach' ? 'Coach edit' : 'Athlete edit', 'manual', parts.join(', '),
      );
    }
    res.json({ state: getState(a.id, ex.id) });
  });

  app.post('/api/events/:id/resolve', (req, res) => {
    const coach = requireCoach(req);
    const ev = q('SELECT ev.*, u.coach_id FROM progression_events ev JOIN users u ON u.id = ev.athlete_id WHERE ev.id = ?').get(Number(req.params.id));
    if (!ev || ev.coach_id !== coach.id) fail(404, 'Event not found');
    q('UPDATE progression_events SET flagged = 0 WHERE id = ?').run(ev.id);
    res.json({ ok: true });
  });

  function getState(athleteId, exerciseId) {
    return (
      q('SELECT * FROM athlete_exercise_state WHERE athlete_id = ? AND exercise_id = ?').get(athleteId, exerciseId) || {
        athlete_id: athleteId, exercise_id: exerciseId, max: null, load_offset: 0, success_streak: 0, fail_streak: 0, session_count: 0,
      }
    );
  }
  function saveState(athleteId, exerciseId, s) {
    q(`INSERT INTO athlete_exercise_state (athlete_id, exercise_id, max, load_offset, success_streak, fail_streak, session_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (athlete_id, exercise_id) DO UPDATE SET max = excluded.max, load_offset = excluded.load_offset,
         success_streak = excluded.success_streak, fail_streak = excluded.fail_streak, session_count = excluded.session_count,
         updated_at = excluded.updated_at`).run(
      athleteId, exerciseId, s.max ?? null, s.load_offset || 0, s.success_streak || 0, s.fail_streak || 0, s.session_count || 0,
    );
  }

  // ---------- exercises ----------
  app.get('/api/exercises', (req, res) => {
    const u = requireUser(req);
    res.json({ exercises: q('SELECT * FROM exercises WHERE coach_id = ? ORDER BY category, name').all(coachIdOf(u)) });
  });
  const exerciseFields = (b) => {
    if (!b.name) fail(400, 'Exercise name is required');
    return [
      String(b.name).trim(),
      CATEGORIES.includes(b.category) ? b.category : 'strength',
      EXERCISE_METRICS.includes(b.metric) ? b.metric : 'load',
      str(b.demo_url),
      str(b.cues),
    ];
  };
  app.post('/api/exercises', (req, res) => {
    const coach = requireCoach(req);
    const info = q('INSERT INTO exercises (name, category, metric, demo_url, cues, coach_id) VALUES (?, ?, ?, ?, ?, ?)').run(...exerciseFields(req.body || {}), coach.id);
    res.status(201).json({ exercise: q('SELECT * FROM exercises WHERE id = ?').get(info.lastInsertRowid) });
  });
  app.put('/api/exercises/:id', (req, res) => {
    const coach = requireCoach(req);
    const ex = ownedBy('exercises', req.params.id, coach.id, 'Exercise');
    q('UPDATE exercises SET name = ?, category = ?, metric = ?, demo_url = ?, cues = ? WHERE id = ?').run(...exerciseFields(req.body || {}), ex.id);
    res.json({ exercise: q('SELECT * FROM exercises WHERE id = ?').get(ex.id) });
  });
  app.delete('/api/exercises/:id', (req, res) => {
    const coach = requireCoach(req);
    const ex = ownedBy('exercises', req.params.id, coach.id, 'Exercise');
    const used = q('SELECT 1 FROM prescriptions WHERE exercise_id = ? UNION SELECT 1 FROM set_logs WHERE exercise_id = ?').get(ex.id, ex.id);
    if (used) fail(409, 'This exercise is used in a program or log, so it can’t be deleted');
    q('DELETE FROM exercises WHERE id = ?').run(ex.id);
    res.json({ ok: true });
  });

  // ---------- progression rules ----------
  app.get('/api/rules/meta', (_req, res) => res.json({ metrics: METRICS, ops: OPS, actions: ACTIONS, presets: PRESET_RULES }));
  app.get('/api/rules', (req, res) => {
    const coach = requireCoach(req);
    ensureRulePresets(db, coach.id);
    const rules = q('SELECT * FROM progression_rules WHERE coach_id = ? ORDER BY name').all(coach.id);
    res.json({ rules: rules.map((r) => ({ ...r, config: JSON.parse(r.config) })) });
  });
  const ruleFields = (b) => {
    if (!b.name) fail(400, 'Rule name is required');
    const config = b.config || {};
    if (!Array.isArray(config.clauses)) fail(400, 'Rule needs a list of clauses');
    for (const c of config.clauses) {
      for (const w of c.when || []) {
        if (!(w.metric in METRICS)) fail(400, `Unknown metric: ${w.metric}`);
        if (!OPS.includes(w.op)) fail(400, `Unknown operator: ${w.op}`);
      }
      for (const a of c.then || []) if (!(a.action in ACTIONS)) fail(400, `Unknown action: ${a.action}`);
    }
    return [String(b.name).trim(), str(b.description), JSON.stringify(config)];
  };
  app.post('/api/rules', (req, res) => {
    const coach = requireCoach(req);
    const info = q('INSERT INTO progression_rules (name, description, config, coach_id) VALUES (?, ?, ?, ?)').run(...ruleFields(req.body || {}), coach.id);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });
  app.put('/api/rules/:id', (req, res) => {
    const coach = requireCoach(req);
    const r = ownedBy('progression_rules', req.params.id, coach.id, 'Rule');
    q('UPDATE progression_rules SET name = ?, description = ?, config = ? WHERE id = ?').run(...ruleFields(req.body || {}), r.id);
    res.json({ ok: true });
  });
  app.delete('/api/rules/:id', (req, res) => {
    const coach = requireCoach(req);
    const r = ownedBy('progression_rules', req.params.id, coach.id, 'Rule');
    q('DELETE FROM progression_rules WHERE id = ?').run(r.id);
    res.json({ ok: true });
  });

  // ---------- programs ----------
  app.get('/api/programs', (req, res) => {
    const coach = requireCoach(req);
    res.json({
      programs: q(`SELECT p.*, (SELECT COUNT(*) FROM program_days d WHERE d.program_id = p.id) AS day_count,
        (SELECT COUNT(*) FROM assignments a WHERE a.program_id = p.id AND a.active = 1) AS athlete_count
        FROM programs p WHERE coach_id = ? ORDER BY p.created_at DESC`).all(coach.id),
    });
  });

  const loadProgram = (id) => {
    const program = q('SELECT * FROM programs WHERE id = ?').get(id);
    const days = q('SELECT * FROM program_days WHERE program_id = ? ORDER BY week, day, id').all(id);
    const rxs = q(`SELECT r.*, e.name AS exercise_name, e.category, e.metric, e.demo_url, e.cues
      FROM prescriptions r JOIN exercises e ON e.id = r.exercise_id
      WHERE r.day_id IN (SELECT id FROM program_days WHERE program_id = ?) ORDER BY r.position, r.id`).all(id);
    for (const d of days) d.prescriptions = rxs.filter((r) => r.day_id === d.id);
    const assignments = q(`SELECT a.*, u.name AS athlete_name FROM assignments a JOIN users u ON u.id = a.athlete_id
      WHERE a.program_id = ? ORDER BY a.active DESC, u.name`).all(id);
    return { ...program, days, assignments };
  };

  app.post('/api/programs', (req, res) => {
    const coach = requireCoach(req);
    const b = req.body || {};
    if (!b.name) fail(400, 'Program name is required');
    const weeks = Math.min(52, Math.max(1, num(b.weeks) || 4));
    const daysPerWeek = Math.min(7, Math.max(0, num(b.days_per_week) ?? 3));
    const id = tx(db, () => {
      const pid = Number(q('INSERT INTO programs (coach_id, name, description, weeks) VALUES (?, ?, ?, ?)').run(coach.id, String(b.name).trim(), str(b.description), weeks).lastInsertRowid);
      for (let w = 1; w <= weeks; w++) for (let d = 1; d <= daysPerWeek; d++) {
        q('INSERT INTO program_days (program_id, week, day, title) VALUES (?, ?, ?, ?)').run(pid, w, d, `Session ${d}`);
      }
      return pid;
    });
    res.status(201).json({ program: loadProgram(id) });
  });

  app.get('/api/programs/:id', (req, res) => {
    const p = programForCoach(req, req.params.id);
    res.json({ program: loadProgram(p.id) });
  });

  app.put('/api/programs/:id', (req, res) => {
    const p = programForCoach(req, req.params.id);
    const b = req.body || {};
    const ruleId = b.rule_id === undefined ? p.rule_id : num(b.rule_id);
    if (ruleId) ownedBy('progression_rules', ruleId, p.coach_id, 'Rule');
    q('UPDATE programs SET name = COALESCE(?, name), description = ?, weeks = COALESCE(?, weeks), rule_id = ? WHERE id = ?').run(
      str(b.name), str(b.description ?? p.description), num(b.weeks), ruleId, p.id,
    );
    res.json({ program: loadProgram(p.id) });
  });

  app.delete('/api/programs/:id', (req, res) => {
    const p = programForCoach(req, req.params.id);
    q('DELETE FROM programs WHERE id = ?').run(p.id);
    res.json({ ok: true });
  });

  const copyDay = (src, programId, week, day) => {
    const newId = Number(q('INSERT INTO program_days (program_id, week, day, title, notes) VALUES (?, ?, ?, ?, ?)').run(programId, week, day, src.title, src.notes).lastInsertRowid);
    for (const r of q('SELECT * FROM prescriptions WHERE day_id = ? ORDER BY position, id').all(src.id)) {
      insertRx(newId, r);
    }
    return newId;
  };

  app.post('/api/programs/:id/duplicate', (req, res) => {
    const coach = requireCoach(req);
    const p = programForCoach(req, req.params.id);
    const name = str(req.body?.name) || `${p.name} (copy)`;
    const id = tx(db, () => {
      const pid = Number(q('INSERT INTO programs (coach_id, name, description, weeks) VALUES (?, ?, ?, ?)').run(coach.id, name, p.description, p.weeks).lastInsertRowid);
      for (const d of q('SELECT * FROM program_days WHERE program_id = ? ORDER BY week, day, id').all(p.id)) copyDay(d, pid, d.week, d.day);
      return pid;
    });
    res.status(201).json({ program: loadProgram(id) });
  });

  // Duplicate a week: the copy goes straight after it and later weeks move down one.
  app.post('/api/programs/:id/weeks/:week/duplicate', (req, res) => {
    const p = programForCoach(req, req.params.id);
    const w = num(req.params.week);
    if (!w || w > Math.max(p.weeks, 1)) fail(400, 'No such week');
    tx(db, () => {
      q('UPDATE program_days SET week = week + 1 WHERE program_id = ? AND week > ?').run(p.id, w);
      for (const d of q('SELECT * FROM program_days WHERE program_id = ? AND week = ? ORDER BY day, id').all(p.id, w)) copyDay(d, p.id, w + 1, d.day);
      q('UPDATE programs SET weeks = weeks + 1 WHERE id = ?').run(p.id);
    });
    res.json({ program: loadProgram(p.id) });
  });

  // Remove a week and its sessions; later weeks move up one. Logged sessions are kept.
  app.delete('/api/programs/:id/weeks/:week', (req, res) => {
    const p = programForCoach(req, req.params.id);
    const w = num(req.params.week);
    if (!w || w > p.weeks) fail(400, 'No such week');
    if (p.weeks <= 1) fail(400, 'A program needs at least one week');
    tx(db, () => {
      q('DELETE FROM program_days WHERE program_id = ? AND week = ?').run(p.id, w);
      q('UPDATE program_days SET week = week - 1 WHERE program_id = ? AND week > ?').run(p.id, w);
      q('UPDATE programs SET weeks = weeks - 1 WHERE id = ?').run(p.id);
    });
    res.json({ program: loadProgram(p.id) });
  });

  // Copy every session in one week to another week (replacing what's there).
  app.post('/api/programs/:id/copy-week', (req, res) => {
    const p = programForCoach(req, req.params.id);
    const from = num(req.body?.from);
    const to = num(req.body?.to);
    if (!from || !to || from === to) fail(400, 'Choose two different weeks');
    tx(db, () => {
      q('DELETE FROM program_days WHERE program_id = ? AND week = ?').run(p.id, to);
      for (const d of q('SELECT * FROM program_days WHERE program_id = ? AND week = ? ORDER BY day, id').all(p.id, from)) copyDay(d, p.id, to, d.day);
      if (to > p.weeks) q('UPDATE programs SET weeks = ? WHERE id = ?').run(to, p.id);
    });
    res.json({ program: loadProgram(p.id) });
  });

  app.post('/api/programs/:id/days', (req, res) => {
    const p = programForCoach(req, req.params.id);
    const b = req.body || {};
    const week = num(b.week) || 1;
    const day = num(b.day) || (q('SELECT MAX(day) AS m FROM program_days WHERE program_id = ? AND week = ?').get(p.id, week).m || 0) + 1;
    const info = q('INSERT INTO program_days (program_id, week, day, title) VALUES (?, ?, ?, ?)').run(p.id, week, day, str(b.title) || `Session ${day}`);
    if (week > p.weeks) q('UPDATE programs SET weeks = ? WHERE id = ?').run(week, p.id);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  app.post('/api/days/:id/duplicate', (req, res) => {
    const d = dayForCoach(req, req.params.id);
    const week = num(req.body?.week) || d.week;
    const day = num(req.body?.day) || (q('SELECT MAX(day) AS m FROM program_days WHERE program_id = ? AND week = ?').get(d.program_id, week).m || 0) + 1;
    const id = tx(db, () => copyDay(d, d.program_id, week, day));
    res.status(201).json({ id });
  });

  app.delete('/api/days/:id', (req, res) => {
    const d = dayForCoach(req, req.params.id);
    q('DELETE FROM program_days WHERE id = ?').run(d.id);
    res.json({ ok: true });
  });

  function rxValues(r, coachId) {
    if (coachId != null) ownedBy('exercises', r.exercise_id, coachId, 'Exercise');
    const progression = ['inherit', 'rule', 'none'].includes(r.progression) ? r.progression : 'inherit';
    return {
      exercise_id: Number(r.exercise_id),
      block: str(r.block),
      sets: num(r.sets),
      reps: str(r.reps),
      load_type: LOAD_TYPES.includes(r.load_type) ? r.load_type : 'none',
      percent: num(r.percent),
      rir: num(r.rir),
      rpe: num(r.rpe),
      fixed_load: num(r.fixed_load),
      target: str(r.target),
      target_value: num(r.target_value),
      rest_seconds: num(r.rest_seconds),
      tempo: str(r.tempo),
      notes: str(r.notes),
      progression,
      rule_id: progression === 'rule' ? num(r.rule_id) : null,
    };
  }
  function insertRx(dayId, r, position = r.position ?? 0, coachId = null) {
    const v = rxValues(r, coachId);
    q(`INSERT INTO prescriptions (day_id, position, exercise_id, block, sets, reps, load_type, percent, rir, rpe, fixed_load,
        target, target_value, rest_seconds, tempo, notes, progression, rule_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      dayId, position, v.exercise_id, v.block, v.sets, v.reps, v.load_type, v.percent, v.rir, v.rpe, v.fixed_load,
      v.target, v.target_value, v.rest_seconds, v.tempo, v.notes, v.progression, v.rule_id,
    );
  }

  // Save a whole session at once: title, notes and the ordered list of prescriptions.
  app.put('/api/days/:id', (req, res) => {
    const coach = requireCoach(req);
    const d = dayForCoach(req, req.params.id);
    const b = req.body || {};
    tx(db, () => {
      q('UPDATE program_days SET title = ?, notes = ?, week = COALESCE(?, week), day = COALESCE(?, day) WHERE id = ?').run(str(b.title), str(b.notes), num(b.week), num(b.day), d.id);
      if (Array.isArray(b.prescriptions)) {
        const keep = new Set();
        b.prescriptions.forEach((r, i) => {
          const existing = r.id ? q('SELECT id FROM prescriptions WHERE id = ? AND day_id = ?').get(Number(r.id), d.id) : null;
          if (existing) {
            const v = rxValues(r, coach.id);
            q(`UPDATE prescriptions SET position = ?, exercise_id = ?, block = ?, sets = ?, reps = ?, load_type = ?, percent = ?, rir = ?,
                rpe = ?, fixed_load = ?, target = ?, target_value = ?, rest_seconds = ?, tempo = ?, notes = ?, progression = ?, rule_id = ? WHERE id = ?`).run(
              i, v.exercise_id, v.block, v.sets, v.reps, v.load_type, v.percent, v.rir, v.rpe, v.fixed_load, v.target,
              v.target_value, v.rest_seconds, v.tempo, v.notes, v.progression, v.rule_id, existing.id,
            );
            keep.add(existing.id);
          } else {
            insertRx(d.id, r, i, coach.id);
            keep.add(Number(q('SELECT last_insert_rowid() AS id').get().id));
          }
        });
        for (const r of q('SELECT id FROM prescriptions WHERE day_id = ?').all(d.id)) {
          if (!keep.has(r.id)) q('DELETE FROM prescriptions WHERE id = ?').run(r.id);
        }
      }
    });
    res.json({ program: loadProgram(d.program_id) });
  });

  // ---------- assignments ----------
  app.post('/api/assignments', (req, res) => {
    const coach = requireCoach(req);
    const b = req.body || {};
    const p = programForCoach(req, b.program_id);
    const ids = Array.isArray(b.athlete_ids) ? b.athlete_ids : [b.athlete_id];
    const ruleId = num(b.rule_id);
    if (ruleId) ownedBy('progression_rules', ruleId, coach.id, 'Rule');
    tx(db, () => {
      for (const aid of ids) {
        const a = athleteFor(req, aid);
        if (b.replace_active) q('UPDATE assignments SET active = 0 WHERE athlete_id = ?').run(a.id);
        q('INSERT INTO assignments (program_id, athlete_id, start_date, rule_id) VALUES (?, ?, ?, ?)').run(p.id, a.id, str(b.start_date) || today(), ruleId);
        notify(a.id, { type: 'program', title: `New program: ${p.name}`, body: `${first(coach.name)} has assigned you a new program.`, link: '/program', actorId: coach.id });
      }
    });
    res.status(201).json({ program: loadProgram(p.id) });
  });

  const assignmentForCoach = (req, id) => {
    const coach = requireCoach(req);
    const a = q('SELECT a.*, p.coach_id FROM assignments a JOIN programs p ON p.id = a.program_id WHERE a.id = ?').get(Number(id));
    if (!a || a.coach_id !== coach.id) fail(404, 'Assignment not found');
    return a;
  };
  app.patch('/api/assignments/:id', (req, res) => {
    const coach = requireCoach(req);
    const a = assignmentForCoach(req, req.params.id);
    const b = req.body || {};
    const ruleId = b.rule_id === undefined ? a.rule_id : num(b.rule_id);
    if (ruleId) ownedBy('progression_rules', ruleId, coach.id, 'Rule');
    q('UPDATE assignments SET active = ?, start_date = ?, rule_id = ? WHERE id = ?').run(
      b.active === undefined ? a.active : b.active ? 1 : 0, str(b.start_date) || a.start_date, ruleId, a.id,
    );
    res.json({ ok: true });
  });
  app.delete('/api/assignments/:id', (req, res) => {
    const a = assignmentForCoach(req, req.params.id);
    q('DELETE FROM assignments WHERE id = ?').run(a.id);
    res.json({ ok: true });
  });

  // ---------- athlete plan & session targets ----------
  function dayWithTargets(athlete, day) {
    const rxs = q(`SELECT r.*, e.name AS exercise_name, e.category, e.metric, e.demo_url, e.cues
      FROM prescriptions r JOIN exercises e ON e.id = r.exercise_id WHERE r.day_id = ? ORDER BY r.position, r.id`).all(day.id);
    for (const r of rxs) {
      const state = getState(athlete.id, r.exercise_id);
      const t = r.load_type === 'bodyweight' ? { load: null, basis: 'bodyweight' } : targetLoad(r, state, athlete.load_increment);
      r.target_load = t.load;
      r.load_basis = t.basis;
      r.current_max = state.max;
      const last = q(`SELECT s.weight, s.reps, s.rir, s.time_seconds, s.result, w.performed_on FROM set_logs s
        JOIN workout_logs w ON w.id = s.workout_log_id WHERE w.athlete_id = ? AND s.exercise_id = ?
        ORDER BY w.performed_on DESC, w.id DESC, s.set_number LIMIT 12`).all(athlete.id, r.exercise_id);
      const lastDate = last[0]?.performed_on;
      r.last_time = last.filter((s) => s.performed_on === lastDate);
    }
    return { ...day, prescriptions: rxs };
  }

  app.get('/api/athletes/:id/plan', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const assignments = q(`SELECT a.*, p.name AS program_name, p.description, p.weeks FROM assignments a
      JOIN programs p ON p.id = a.program_id WHERE a.athlete_id = ? AND a.active = 1 ORDER BY a.start_date DESC`).all(a.id);
    for (const asg of assignments) {
      const days = q(`SELECT d.*, (SELECT COUNT(*) FROM prescriptions r WHERE r.day_id = d.id) AS exercise_count,
          (SELECT w.id FROM workout_logs w WHERE w.assignment_id = ? AND w.day_id = d.id ORDER BY w.id DESC LIMIT 1) AS log_id,
          (SELECT w.performed_on FROM workout_logs w WHERE w.assignment_id = ? AND w.day_id = d.id ORDER BY w.id DESC LIMIT 1) AS done_on
        FROM program_days d WHERE d.program_id = ? ORDER BY d.week, d.day, d.id`).all(asg.id, asg.id, asg.program_id);
      asg.days = days;
      const next = days.find((d) => !d.log_id && d.exercise_count > 0);
      asg.next_day = next ? dayWithTargets(a, next) : null;
      asg.completed = days.filter((d) => d.log_id).length;
    }
    res.json({ athlete: publicUser(a), assignments });
  });

  app.get('/api/athletes/:id/days/:dayId', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const day = q('SELECT * FROM program_days WHERE id = ?').get(Number(req.params.dayId)) || fail(404, 'Session not found');
    const asg = q('SELECT * FROM assignments WHERE athlete_id = ? AND program_id = ? ORDER BY active DESC, id DESC').get(a.id, day.program_id);
    if (!asg && req.user.role !== 'coach') fail(403, 'This session isn’t in your program');
    if (req.user.role === 'coach') programForCoach(req, day.program_id);
    res.json({ day: dayWithTargets(a, day), assignment_id: asg?.id ?? null });
  });

  // ---------- workout logs ----------
  app.post('/api/logs', (req, res) => {
    const u = requireUser(req);
    const b = req.body || {};
    const athlete = athleteFor(req, b.athlete_id ?? u.id);
    const sets = Array.isArray(b.sets) ? b.sets : [];
    if (!sets.length) fail(400, 'Log at least one set');

    let assignment = null;
    let day = null;
    if (b.assignment_id) {
      assignment = q('SELECT * FROM assignments WHERE id = ? AND athlete_id = ?').get(Number(b.assignment_id), athlete.id) || fail(400, 'Unknown program');
      if (b.day_id) {
        day = q('SELECT * FROM program_days WHERE id = ? AND program_id = ?').get(Number(b.day_id), assignment.program_id) || fail(400, 'Unknown session');
      }
    }
    const coachId = athlete.coach_id;
    const programRule = assignment ? q('SELECT rule_id FROM programs WHERE id = ?').get(assignment.program_id)?.rule_id ?? null : null;

    const result = tx(db, () => {
      const logId = Number(q(`INSERT INTO workout_logs (athlete_id, assignment_id, day_id, title, performed_on, session_rpe, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        athlete.id, assignment?.id ?? null, day?.id ?? null, str(b.title) || day?.title || 'Training session',
        str(b.performed_on) || today(), num(b.session_rpe), str(b.notes),
      ).lastInsertRowid);

      // Group sets by prescription (or by exercise for extra work) so each gets its own rule pass.
      const groups = new Map();
      sets.forEach((s, i) => {
        const rx = s.prescription_id && day ? q('SELECT * FROM prescriptions WHERE id = ? AND day_id = ?').get(Number(s.prescription_id), day.id) : null;
        const exerciseId = rx ? rx.exercise_id : Number(s.exercise_id);
        if (!rx) ownedBy('exercises', exerciseId, coachId, 'Exercise');
        q(`INSERT INTO set_logs (workout_log_id, prescription_id, exercise_id, set_number, target_load, weight, reps, rir, time_seconds, result, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          logId, rx?.id ?? null, exerciseId, num(s.set_number) || i + 1, num(s.target_load), num(s.weight), num(s.reps),
          num(s.rir), num(s.time_seconds), num(s.result), str(s.notes),
        );
        const key = rx ? `rx${rx.id}` : `ex${exerciseId}`;
        if (!groups.has(key)) groups.set(key, { rx, exerciseId, sets: [] });
        groups.get(key).sets.push(s);
      });

      const events = [];
      for (const g of groups.values()) {
        const ex = q('SELECT * FROM exercises WHERE id = ?').get(g.exerciseId);
        const rx = g.rx ? { ...g.rx, metric: ex.metric } : { sets: g.sets.length, reps: null, load_type: 'none', metric: ex.metric };
        const state = getState(athlete.id, g.exerciseId);
        const metrics = computeMetrics(rx, g.sets.map((s) => ({
          weight: num(s.weight), reps: num(s.reps), rir: num(s.rir), time_seconds: num(s.time_seconds), result: num(s.result),
        })), state);

        let ruleId = null;
        if (g.rx?.progression === 'rule') ruleId = g.rx.rule_id;
        // Order of precedence: exercise override → athlete's assignment → program default.
        else if (g.rx?.progression !== 'none' && g.rx) ruleId = assignment?.rule_id ?? programRule;
        const rule = ruleId ? q('SELECT * FROM progression_rules WHERE id = ?').get(ruleId) : null;

        if (rule) {
          const lastLoad = g.sets.map((s) => num(s.target_load)).find((v) => v) || null;
          const out = applyRule(JSON.parse(rule.config), metrics, state, { lastLoad });
          saveState(athlete.id, g.exerciseId, out.state);
          if (out.changes.length || out.flags.length) {
            const summary = [...out.changes, ...out.flags.map((f) => `⚑ ${f}`)].join(' · ');
            q(`INSERT INTO progression_events (athlete_id, exercise_id, workout_log_id, rule_name, matched, summary, flagged)
               VALUES (?, ?, ?, ?, ?, ?, ?)`).run(athlete.id, g.exerciseId, logId, rule.name, out.matched, summary, out.flags.length ? 1 : 0);
            events.push({ exercise: ex.name, rule: rule.name, matched: out.matched, summary });
          }
        } else {
          saveState(athlete.id, g.exerciseId, { ...state, success_streak: metrics.success_streak, fail_streak: metrics.fail_streak, session_count: metrics.session_count });
        }
      }
      return { id: logId, events };
    });

    const log = q('SELECT title, session_rpe FROM workout_logs WHERE id = ?').get(result.id);
    const link = `/logs/${result.id}`;
    const changes = result.events.map((e) => `${e.exercise}: ${e.summary}`);
    notify(athlete.coach_id, {
      type: 'session', title: `${athlete.name} completed ${log.title}`, actorId: u.id, link,
      body: [`${sets.length} sets`, log.session_rpe != null && `session RPE ${log.session_rpe}`, clip(b.notes, 80) && `“${clip(b.notes, 80)}”`].filter(Boolean).join(' · '),
    });
    for (const e of result.events.filter((x) => x.summary.includes('⚑'))) {
      notify(athlete.coach_id, { type: 'flag', title: `⚑ ${athlete.name} — ${e.exercise}`, body: e.summary, link, actorId: u.id });
    }
    // The athlete always gets their own summary, even though they did the logging.
    notify(athlete.id, {
      type: 'session', title: 'Session complete 💪', link,
      body: changes.length ? clip(`Program updated — ${changes.join(' · ')}`, 180) : `${log.title} logged. Nice work.`,
    });
    res.status(201).json(result);
  });

  app.get('/api/logs', (req, res) => {
    const u = requireUser(req);
    const athleteId = req.query.athlete_id ?? (u.role === 'athlete' ? u.id : null);
    let rows;
    if (athleteId) {
      const a = athleteFor(req, athleteId);
      rows = q(`SELECT w.*, u.name AS athlete_name, (SELECT COUNT(*) FROM set_logs s WHERE s.workout_log_id = w.id) AS set_count,
          (SELECT COUNT(*) FROM comments c WHERE c.target_type = 'workout' AND c.target_id = w.id) AS comment_count
        FROM workout_logs w JOIN users u ON u.id = w.athlete_id WHERE w.athlete_id = ? ORDER BY w.performed_on DESC, w.id DESC LIMIT 100`).all(a.id);
    } else {
      requireCoach(req);
      rows = q(`SELECT w.*, u.name AS athlete_name, (SELECT COUNT(*) FROM set_logs s WHERE s.workout_log_id = w.id) AS set_count,
          (SELECT COUNT(*) FROM comments c WHERE c.target_type = 'workout' AND c.target_id = w.id) AS comment_count
        FROM workout_logs w JOIN users u ON u.id = w.athlete_id WHERE u.coach_id = ? ORDER BY w.performed_on DESC, w.id DESC LIMIT 100`).all(u.id);
    }
    res.json({ logs: rows });
  });

  const logFor = (req, id) => {
    const log = q('SELECT * FROM workout_logs WHERE id = ?').get(Number(id)) || fail(404, 'Workout not found');
    athleteFor(req, log.athlete_id);
    return log;
  };

  app.get('/api/logs/:id', (req, res) => {
    const log = logFor(req, req.params.id);
    const sets = q(`SELECT s.*, e.name AS exercise_name, e.metric, r.reps AS rx_reps, r.sets AS rx_sets, r.load_type, r.percent, r.rir AS rx_rir, r.rpe AS rx_rpe, r.target AS rx_target
      FROM set_logs s JOIN exercises e ON e.id = s.exercise_id LEFT JOIN prescriptions r ON r.id = s.prescription_id
      WHERE s.workout_log_id = ? ORDER BY s.id`).all(log.id);
    for (const s of sets) s.e1rm = s.weight && s.reps ? Math.round(estimate1RM(s.weight, s.reps, s.rir ?? 0) * 10) / 10 : null;
    const events = q(`SELECT ev.*, e.name AS exercise_name FROM progression_events ev JOIN exercises e ON e.id = ev.exercise_id
      WHERE ev.workout_log_id = ? ORDER BY ev.id`).all(log.id);
    const videos = q(`SELECT v.*, e.name AS exercise_name FROM videos v LEFT JOIN exercises e ON e.id = v.exercise_id
      WHERE v.workout_log_id = ? ORDER BY v.id`).all(log.id);
    const athlete = q('SELECT id, name FROM users WHERE id = ?').get(log.athlete_id);
    if (req.user.role === 'coach' && !log.coach_seen) q('UPDATE workout_logs SET coach_seen = 1 WHERE id = ?').run(log.id);
    res.json({ log, athlete, sets, events, videos });
  });

  app.delete('/api/logs/:id', (req, res) => {
    const log = logFor(req, req.params.id);
    q("DELETE FROM comments WHERE target_type = 'workout' AND target_id = ?").run(log.id);
    q('DELETE FROM workout_logs WHERE id = ?').run(log.id);
    res.json({ ok: true, note: 'Progression changes already applied are kept — adjust maxes manually if needed.' });
  });

  // Exercise history for progress charts.
  app.get('/api/athletes/:id/history', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const exerciseId = num(req.query.exercise_id);
    const logged = q(`SELECT DISTINCT e.id, e.name, e.metric FROM set_logs s JOIN workout_logs w ON w.id = s.workout_log_id
      JOIN exercises e ON e.id = s.exercise_id WHERE w.athlete_id = ? ORDER BY e.name`).all(a.id);
    let points = [];
    if (exerciseId) {
      const rows = q(`SELECT w.performed_on, s.weight, s.reps, s.rir, s.time_seconds, s.result FROM set_logs s
        JOIN workout_logs w ON w.id = s.workout_log_id WHERE w.athlete_id = ? AND s.exercise_id = ? ORDER BY w.performed_on, w.id`).all(a.id, exerciseId);
      const byDate = new Map();
      for (const r of rows) {
        const p = byDate.get(r.performed_on) || { date: r.performed_on, top_weight: null, e1rm: null, best_time: null, best_result: null, volume: 0 };
        if (r.weight) p.top_weight = Math.max(p.top_weight ?? 0, r.weight);
        if (r.weight && r.reps) {
          p.e1rm = Math.max(p.e1rm ?? 0, Math.round(estimate1RM(r.weight, r.reps, r.rir ?? 0) * 10) / 10);
          p.volume += r.weight * r.reps;
        }
        if (r.time_seconds) p.best_time = p.best_time == null ? r.time_seconds : Math.min(p.best_time, r.time_seconds);
        if (r.result) p.best_result = Math.max(p.best_result ?? r.result, r.result);
        byDate.set(r.performed_on, p);
      }
      points = [...byDate.values()];
    }
    res.json({ exercises: logged, points });
  });

  // ---------- videos ----------
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`),
    }),
    limits: { fileSize: maxUploadMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, /^(video|image)\//.test(file.mimetype)),
  });

  app.post('/api/videos', (req, _res, next) => next(req.user ? undefined : new HttpError(401, 'Please sign in')), upload.single('file'), (req, res) => {
    if (!req.file) fail(400, 'Attach a video file');
    try {
      const u = requireUser(req);
      const athlete = athleteFor(req, req.body.athlete_id ?? u.id);
      const exerciseId = num(req.body.exercise_id);
      if (exerciseId) ownedBy('exercises', exerciseId, athlete.coach_id, 'Exercise');
      const logId = num(req.body.workout_log_id);
      if (req.body.test_id && !q('SELECT 1 FROM test_results WHERE id = ? AND athlete_id = ?').get(num(req.body.test_id), athlete.id)) fail(400, 'Unknown test');
      if (logId && !q('SELECT 1 FROM workout_logs WHERE id = ? AND athlete_id = ?').get(logId, athlete.id)) fail(400, 'Unknown workout');
      const info = q('INSERT INTO videos (athlete_id, exercise_id, workout_log_id, filename, mime, size, note) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        athlete.id, exerciseId, logId, req.file.filename, req.file.mimetype, req.file.size, str(req.body.note),
      );
      const videoId = Number(info.lastInsertRowid);
      const testId = num(req.body.test_id);
      if (testId) q('UPDATE test_results SET video_id = ? WHERE id = ? AND athlete_id = ?').run(videoId, testId, athlete.id);
      const exName = exerciseId ? q('SELECT name FROM exercises WHERE id = ?').get(exerciseId).name : 'General';
      notify(athlete.coach_id, {
        type: 'form_check', actorId: u.id, link: `/videos/${videoId}`,
        title: `${athlete.name} sent ${testId ? 'a max-lift video' : 'a form check'}`,
        body: [exName, clip(str(req.body.note), 100) && `“${clip(str(req.body.note), 100)}”`].filter(Boolean).join(' · '),
      });
      res.status(201).json({ id: videoId });
    } catch (e) {
      fs.rm(req.file.path, () => {});
      throw e;
    }
  });

  app.get('/api/videos', (req, res) => {
    const u = requireUser(req);
    const status = ['pending', 'reviewed'].includes(req.query.status) ? req.query.status : null;
    const base = `SELECT v.*, e.name AS exercise_name, u.name AS athlete_name,
      (SELECT COUNT(*) FROM comments c WHERE c.target_type = 'video' AND c.target_id = v.id) AS comment_count
      FROM videos v JOIN users u ON u.id = v.athlete_id LEFT JOIN exercises e ON e.id = v.exercise_id`;
    let rows;
    if (req.query.athlete_id || u.role === 'athlete') {
      const a = athleteFor(req, req.query.athlete_id ?? u.id);
      rows = q(`${base} WHERE v.athlete_id = ? AND (? IS NULL OR v.status = ?) ORDER BY v.id DESC`).all(a.id, status, status);
    } else {
      rows = q(`${base} WHERE u.coach_id = ? AND (? IS NULL OR v.status = ?) ORDER BY v.id DESC LIMIT 200`).all(u.id, status, status);
    }
    res.json({ videos: rows });
  });

  const videoFor = (req, id) => {
    const v = q('SELECT * FROM videos WHERE id = ?').get(Number(id)) || fail(404, 'Video not found');
    athleteFor(req, v.athlete_id);
    return v;
  };

  app.get('/api/videos/:id', (req, res) => {
    const v = videoFor(req, req.params.id);
    const meta = q(`SELECT v.*, e.name AS exercise_name, e.cues, u.name AS athlete_name,
        (SELECT t.weight || ' kg × ' || t.reps FROM test_results t WHERE t.video_id = v.id) AS test_label
      FROM videos v JOIN users u ON u.id = v.athlete_id
      LEFT JOIN exercises e ON e.id = v.exercise_id WHERE v.id = ?`).get(v.id);
    res.json({ video: meta });
  });

  app.get('/api/videos/:id/file', (req, res) => {
    const v = videoFor(req, req.params.id);
    res.type(v.mime || 'video/mp4');
    res.sendFile(path.join(uploadDir, path.basename(v.filename)));
  });

  app.patch('/api/videos/:id', (req, res) => {
    requireCoach(req);
    const v = videoFor(req, req.params.id);
    const status = req.body?.status === 'pending' ? 'pending' : 'reviewed';
    q('UPDATE videos SET status = ? WHERE id = ?').run(status, v.id);
    res.json({ ok: true });
  });

  app.delete('/api/videos/:id', (req, res) => {
    const v = videoFor(req, req.params.id);
    q('DELETE FROM videos WHERE id = ?').run(v.id);
    q("DELETE FROM comments WHERE target_type = 'video' AND target_id = ?").run(v.id);
    fs.rm(path.join(uploadDir, path.basename(v.filename)), () => {});
    res.json({ ok: true });
  });

  // ---------- feedback / comments ----------
  app.get('/api/comments', (req, res) => {
    const u = requireUser(req);
    const a = athleteFor(req, req.query.athlete_id ?? u.id);
    const type = COMMENT_TYPES.includes(req.query.target_type) ? req.query.target_type : null;
    const targetId = num(req.query.target_id);
    const rows = q(`SELECT c.*, u.name AS author_name, u.role AS author_role FROM comments c JOIN users u ON u.id = c.author_id
      WHERE c.athlete_id = ? AND (? IS NULL OR c.target_type = ?) AND (? IS NULL OR c.target_id = ?) ORDER BY c.id`).all(a.id, type, type, targetId, targetId);
    // Opening a thread marks the other person's messages as read.
    const unreadIds = rows.filter((c) => c.author_id !== u.id && !c.read_by_recipient).map((c) => c.id);
    for (const id of unreadIds) q('UPDATE comments SET read_by_recipient = 1 WHERE id = ?').run(id);
    res.json({ comments: rows });
  });

  app.post('/api/comments', (req, res) => {
    const u = requireUser(req);
    const b = req.body || {};
    const a = athleteFor(req, b.athlete_id ?? u.id);
    if (!b.body || !String(b.body).trim()) fail(400, 'Write a message first');
    const type = COMMENT_TYPES.includes(b.target_type) ? b.target_type : 'general';
    const targetId = type === 'general' ? null : num(b.target_id);
    if (type === 'workout' && !q('SELECT 1 FROM workout_logs WHERE id = ? AND athlete_id = ?').get(targetId, a.id)) fail(400, 'Unknown workout');
    if (type === 'video' && !q('SELECT 1 FROM videos WHERE id = ? AND athlete_id = ?').get(targetId, a.id)) fail(400, 'Unknown video');
    if (type === 'injury' && !q('SELECT 1 FROM injuries WHERE id = ? AND athlete_id = ?').get(targetId, a.id)) fail(400, 'Unknown injury');
    const info = q('INSERT INTO comments (athlete_id, author_id, target_type, target_id, body) VALUES (?, ?, ?, ?, ?)').run(a.id, u.id, type, targetId, String(b.body).trim());
    if (type === 'video' && u.role === 'coach') q("UPDATE videos SET status = 'reviewed' WHERE id = ?").run(targetId);

    const text = clip(String(b.body).trim());
    if (u.role === 'coach') {
      const what = { video: 'your form check', workout: 'your session', injury: 'your injury report' }[type];
      const link = { video: `/videos/${targetId}`, workout: `/logs/${targetId}`, injury: '/recovery/injuries', general: '/messages' }[type];
      notify(a.id, { type: 'comment', title: what ? `${first(u.name)} commented on ${what}` : `Message from ${first(u.name)}`, body: text, link, actorId: u.id });
    } else {
      const what = { video: 'their form check', workout: 'their session', injury: 'their injury' }[type];
      const link = { video: `/videos/${targetId}`, workout: `/logs/${targetId}`, injury: `/athletes/${a.id}?tab=recovery`, general: `/athletes/${a.id}?tab=messages` }[type];
      notify(a.coach_id, { type: 'message', title: what ? `${a.name} replied on ${what}` : `Message from ${a.name}`, body: text, link, actorId: u.id });
    }
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  // ---------- inbox / dashboard ----------
  app.get('/api/inbox', (req, res) => {
    const u = requireUser(req);
    if (u.role === 'coach') {
      res.json({
        logs: q(`SELECT w.*, u.name AS athlete_name FROM workout_logs w JOIN users u ON u.id = w.athlete_id
          WHERE u.coach_id = ? AND w.coach_seen = 0 ORDER BY w.id DESC LIMIT 50`).all(u.id),
        videos: q(`SELECT v.*, u.name AS athlete_name, e.name AS exercise_name FROM videos v JOIN users u ON u.id = v.athlete_id
          LEFT JOIN exercises e ON e.id = v.exercise_id WHERE u.coach_id = ? AND v.status = 'pending' ORDER BY v.id DESC LIMIT 50`).all(u.id),
        flags: q(`SELECT ev.*, u.name AS athlete_name, e.name AS exercise_name FROM progression_events ev JOIN users u ON u.id = ev.athlete_id
          JOIN exercises e ON e.id = ev.exercise_id WHERE u.coach_id = ? AND ev.flagged = 1 ORDER BY ev.id DESC LIMIT 50`).all(u.id),
        messages: q(`SELECT c.*, u.name AS athlete_name FROM comments c JOIN users u ON u.id = c.athlete_id
          WHERE u.coach_id = ? AND c.author_id = c.athlete_id AND c.read_by_recipient = 0 ORDER BY c.id DESC LIMIT 50`).all(u.id),
        injuries: q(`SELECT i.*, u.name AS athlete_name FROM injuries i JOIN users u ON u.id = i.athlete_id
          WHERE u.coach_id = ? AND i.status = 'new' ORDER BY i.id DESC`).all(u.id),
        low_readiness: q(`SELECT r.*, u.name AS athlete_name FROM readiness r JOIN users u ON u.id = r.athlete_id
          WHERE u.coach_id = ? AND r.day = ? AND r.score < 60 ORDER BY r.score`).all(u.id, str(req.query.today) || today()),
      });
    } else {
      res.json({
        feedback: q(`SELECT c.*, au.name AS author_name FROM comments c JOIN users au ON au.id = c.author_id
          WHERE c.athlete_id = ? AND c.author_id != ? ORDER BY c.id DESC LIMIT 30`).all(u.id, u.id),
        events: q(`SELECT ev.*, e.name AS exercise_name FROM progression_events ev JOIN exercises e ON e.id = ev.exercise_id
          WHERE ev.athlete_id = ? ORDER BY ev.id DESC LIMIT 15`).all(u.id),
      });
    }
  });

  // ---------- nutrition, recovery, testing ----------
  const ctx = { db, q, fail, num, str, today, tx, requireUser, requireCoach, athleteFor, ownedBy, getState, saveState, notify, first, clip, estimator };
  registerNotifications(app, ctx);
  registerNutrition(app, ctx);
  registerRecovery(app, ctx);
  registerTesting(app, ctx);

  // ---------- errors ----------
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `Video is too large (max ${maxUploadMb} MB)` : err.message });
    }
    const status = err.status || 500;
    // Our own errors carry a message meant for the user (including 503 "not set up" ones); hide anything unexpected.
    const expose = err instanceof HttpError || status < 500;
    if (!expose) console.error(err);
    res.status(status).json({ error: expose ? err.message : 'Something went wrong' });
  });

  return app;
}

// Give a new coach a starter exercise library and the preset progression rules.
export function seedCoachDefaults(db, coachId) {
  const ex = db.prepare('INSERT INTO exercises (coach_id, name, category, metric, cues) VALUES (?, ?, ?, ?, ?)');
  const starter = [
    ['Back Squat', 'strength', 'load', 'Brace, sit between the hips, drive the floor away'],
    ['Front Squat', 'strength', 'load', 'Elbows high, stay tall'],
    ['Trap Bar Deadlift', 'strength', 'load', 'Push the floor, hips and shoulders rise together'],
    ['Romanian Deadlift', 'strength', 'load', 'Soft knees, hips back, flat back'],
    ['Bench Press', 'strength', 'load', 'Shoulder blades pinned, bar to lower chest'],
    ['Weighted Pull-up', 'strength', 'load', 'Full hang to chin over bar'],
    ['Overhead Press', 'strength', 'load', 'Squeeze glutes, head through at the top'],
    ['Bent-over Row', 'strength', 'load', 'Flat back, pull to the belly'],
    ['Nordic Hamstring Curl', 'strength', 'reps', 'Fight the descent all the way down'],
    ['Copenhagen Plank', 'strength', 'time', 'Straight line head to heel'],
    ['Power Clean', 'power', 'load', 'Push with the legs, fast elbows'],
    ['Hang Power Clean', 'power', 'load', 'Hips through, catch high'],
    ['Box Jump', 'power', 'height', 'Arm swing, land soft and quiet'],
    ['Countermovement Jump', 'power', 'height', 'Fast dip, explode up'],
    ['Broad Jump', 'power', 'distance', 'Stick the landing'],
    ['Med Ball Rotational Throw', 'power', 'reps', 'Load the back hip, throw through the wall'],
    ['10 m Acceleration', 'speed', 'time', 'Push, low heel recovery, drive the arms'],
    ['30 m Sprint', 'speed', 'time', 'Rise gradually, relax the face and hands'],
    ['Flying 20 m', 'speed', 'time', 'Build over 20 m, hold top speed through the gates'],
    ['Sled Push', 'speed', 'load', 'Long lever, strong pushes'],
    ['505 Agility', 'speed', 'time', 'Low hips into the turn'],
    ['Bronco', 'conditioning', 'time', '1200 m: 20-40-60 m shuttles x5'],
    ['Repeated Sprint (6 x 40 m)', 'conditioning', 'time', 'Every 30 s, aim for minimal drop-off'],
  ];
  for (const [name, cat, metric, cues] of starter) ex.run(coachId, name, cat, metric, cues);
  const rule = db.prepare('INSERT INTO progression_rules (coach_id, name, description, config) VALUES (?, ?, ?, ?)');
  for (const r of PRESET_RULES) rule.run(coachId, r.name, r.description, JSON.stringify(r.config));
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(`rule_presets:${coachId}`, String(PRESETS_VERSION));
  ensureMainLifts(db, coachId);
  seedProtocols(db, coachId);
}

// Bump when PRESET_RULES gains a model, so existing coaches get it once (without restoring ones they deleted).
const PRESETS_VERSION = 2;
const ADDED_IN = { 2: ['Double progression (rep range)'] };

export function ensureRulePresets(db, coachId) {
  const key = `rule_presets:${coachId}`;
  const have = Number(db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value || 1);
  if (have >= PRESETS_VERSION) return;
  const exists = db.prepare('SELECT 1 FROM progression_rules WHERE coach_id = ? AND name = ?');
  const ins = db.prepare('INSERT INTO progression_rules (coach_id, name, description, config) VALUES (?, ?, ?, ?)');
  for (let v = have + 1; v <= PRESETS_VERSION; v++) {
    for (const name of ADDED_IN[v] || []) {
      const r = PRESET_RULES.find((x) => x.name === name);
      if (r && !exists.get(coachId, name)) ins.run(coachId, r.name, r.description, JSON.stringify(r.config));
    }
  }
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, String(PRESETS_VERSION));
}

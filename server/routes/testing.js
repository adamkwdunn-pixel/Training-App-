import { estimate1RM } from '../lib/loads.js';

// The main lifts every athlete is tested on, in display order.
export const MAIN_LIFTS = [
  { name: 'Back Squat', cues: 'Brace, sit between the hips, drive the floor away' },
  { name: 'Bench Press', cues: 'Shoulder blades pinned, bar to lower chest' },
  { name: 'Deadlift', cues: 'Bar over mid-foot, push the floor, lock out with the glutes' },
  { name: 'Power Clean', cues: 'Push with the legs, fast elbows', category: 'power' },
  { name: 'Overhead Press', cues: 'Squeeze glutes, head through at the top' },
  { name: 'Weighted Chin-up', cues: 'Full hang to chin over bar, supinated grip' },
];

/** Make sure the coach's library has every main lift; returns them in order. */
export function ensureMainLifts(db, coachId) {
  const find = db.prepare('SELECT * FROM exercises WHERE coach_id = ? AND name = ? COLLATE NOCASE');
  const add = db.prepare("INSERT INTO exercises (coach_id, name, category, metric, cues) VALUES (?, ?, ?, 'load', ?)");
  return MAIN_LIFTS.map((l) => {
    let ex = find.get(coachId, l.name);
    if (!ex) {
      add.run(coachId, l.name, l.category || 'strength', l.cues);
      ex = find.get(coachId, l.name);
    }
    return ex;
  });
}

const e1rmOf = (weight, reps) => (Number(reps) === 1 ? Number(weight) : Math.round(estimate1RM(Number(weight), Number(reps), 0) * 10) / 10);

export function registerTesting(app, { db, q, fail, num, str, today, requireUser, requireCoach, athleteFor, ownedBy, getState, saveState }) {
  const withVideo = `SELECT t.*, v.status AS video_status, u.name AS created_by_name FROM test_results t
    LEFT JOIN videos v ON v.id = t.video_id LEFT JOIN users u ON u.id = t.created_by`;

  app.get('/api/athletes/:id/tests', (req, res) => {
    const a = athleteFor(req, req.params.id);
    if (!a.coach_id) return res.json({ lifts: [], other: [], bodyweight: a.bodyweight });
    const lifts = ensureMainLifts(db, a.coach_id);
    const all = q(`${withVideo} WHERE t.athlete_id = ? ORDER BY t.tested_on DESC, t.id DESC`).all(a.id);
    const summarise = (ex) => {
      const history = all.filter((t) => t.exercise_id === ex.id);
      const best = history.reduce((b, t) => (!b || t.e1rm > b.e1rm ? t : b), null);
      const lastVideo = history.find((t) => t.video_id) || null;
      return { exercise: ex, latest: history[0] || null, best, last_video: lastVideo, history, max: getState(a.id, ex.id).max };
    };
    const mainIds = new Set(lifts.map((l) => l.id));
    const otherIds = [...new Set(all.map((t) => t.exercise_id).filter((id) => !mainIds.has(id)))];
    const other = otherIds.map((id) => summarise(q('SELECT * FROM exercises WHERE id = ?').get(id)));
    res.json({ lifts: lifts.map(summarise), other, bodyweight: a.bodyweight });
  });

  app.post('/api/athletes/:id/tests', (req, res) => {
    const u = requireUser(req);
    const a = athleteFor(req, req.params.id);
    const b = req.body || {};
    const ex = ownedBy('exercises', b.exercise_id, a.coach_id, 'Exercise');
    const weight = num(b.weight);
    const reps = Math.round(num(b.reps) || 1);
    if (!weight || weight <= 0) fail(400, 'Enter the weight lifted');
    if (reps < 1 || reps > 20) fail(400, 'Reps must be between 1 and 20');
    const e1rm = e1rmOf(weight, reps);
    const testedOn = str(b.tested_on) || today();
    const info = q(`INSERT INTO test_results (athlete_id, exercise_id, tested_on, weight, reps, e1rm, bodyweight, notes, verified, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(a.id, ex.id, testedOn, weight, reps, e1rm, a.bodyweight ?? null, str(b.notes), u.role === 'coach' ? 1 : 0, u.id);

    // Feed the result into programming: the tested max becomes the max % / RIR loads are based on.
    if (b.update_max !== false) {
      const cur = getState(a.id, ex.id);
      saveState(a.id, ex.id, { ...cur, max: e1rm, load_offset: 0 });
      q('INSERT INTO progression_events (athlete_id, exercise_id, rule_name, matched, summary) VALUES (?, ?, ?, ?, ?)').run(
        a.id, ex.id, 'Testing', 'test', `Tested ${weight} kg × ${reps} → max ${cur.max ?? '—'} → ${e1rm} kg${cur.load_offset ? ', load adjustment reset' : ''}`,
      );
    }
    res.status(201).json({ id: Number(info.lastInsertRowid), e1rm });
  });

  const testFor = (req, id) => {
    const t = q('SELECT * FROM test_results WHERE id = ?').get(Number(id)) || fail(404, 'Test not found');
    athleteFor(req, t.athlete_id);
    return t;
  };
  app.patch('/api/tests/:id', (req, res) => {
    requireCoach(req);
    const t = testFor(req, req.params.id);
    q('UPDATE test_results SET verified = ? WHERE id = ?').run(req.body?.verified ? 1 : 0, t.id);
    res.json({ ok: true });
  });
  app.delete('/api/tests/:id', (req, res) => {
    const t = testFor(req, req.params.id);
    q('DELETE FROM test_results WHERE id = ?').run(t.id);
    res.json({ ok: true });
  });

  // Squad board: every athlete's best e1RM on each main lift.
  app.get('/api/testing/squad', (req, res) => {
    const coach = requireCoach(req);
    const lifts = ensureMainLifts(db, coach.id);
    const athletes = q("SELECT id, name, position, bodyweight FROM users WHERE coach_id = ? AND role = 'athlete' ORDER BY name").all(coach.id);
    const best = q(`SELECT t.*, (SELECT COUNT(*) FROM test_results x WHERE x.athlete_id = t.athlete_id AND x.exercise_id = t.exercise_id) AS n
      FROM test_results t WHERE t.athlete_id = ? AND t.exercise_id = ? ORDER BY t.e1rm DESC, t.tested_on DESC LIMIT 1`);
    const rows = athletes.map((a) => ({
      ...a,
      results: Object.fromEntries(lifts.map((l) => [l.id, best.get(a.id, l.id) || null])),
    }));
    res.json({ lifts, athletes: rows });
  });
}

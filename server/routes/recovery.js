import { AVAILABILITY, INJURY_STATUS, READINESS_ITEMS, readinessScore } from '../lib/recovery.js';

export const PROTOCOL_CATEGORIES = ['mobility', 'prehab', 'rehab', 'recovery'];

export const PRESET_PROTOCOLS = [
  {
    name: 'Daily mobility (10 min)', category: 'mobility', description: 'Morning or post-session. Move slowly, breathe out into each position.',
    items: [
      { name: '90/90 hip switches', dose: '2 × 8 each side' },
      { name: 'World’s greatest stretch', dose: '2 × 5 each side' },
      { name: 'Couch stretch', dose: '2 × 45 s each side' },
      { name: 'Thoracic open books', dose: '2 × 8 each side' },
      { name: 'Deep squat hold', dose: '2 × 45 s' },
    ],
  },
  {
    name: 'Hamstring prehab', category: 'prehab', description: 'In-season 2× per week, not within 48 h of a match.',
    items: [
      { name: 'Nordic hamstring curl', dose: '3 × 5', notes: 'Slow the descent all the way' },
      { name: 'Single-leg RDL', dose: '3 × 8 each side' },
      { name: 'Isometric hamstring bridge (long lever)', dose: '3 × 30 s each side' },
    ],
  },
  {
    name: 'Groin / adductor prehab', category: 'prehab', description: 'Copenhagen progression — move up a level when all reps are pain-free.',
    items: [
      { name: 'Adductor squeeze (ball between knees)', dose: '3 × 10 s hold' },
      { name: 'Copenhagen plank (short lever → long lever)', dose: '3 × 20-30 s each side' },
      { name: 'Lateral lunge', dose: '2 × 8 each side' },
    ],
  },
  {
    name: 'Shoulder prehab (contact)', category: 'prehab', description: 'Before upper-body sessions and contact training.',
    items: [
      { name: 'Band external rotation', dose: '2 × 15 each side' },
      { name: 'Prone Y-T-W raises', dose: '2 × 8 each' },
      { name: 'Bottoms-up kettlebell carry', dose: '2 × 20 m each side' },
      { name: 'Push-up plus', dose: '2 × 12' },
    ],
  },
  {
    name: 'Ankle sprain rehab — phase 1', category: 'rehab', description: 'Days 3-14. Pain no higher than 3/10 during or after.',
    items: [
      { name: 'Ankle alphabet', dose: '2 × each direction' },
      { name: 'Banded ankle eversion / inversion', dose: '3 × 15' },
      { name: 'Double → single-leg calf raise', dose: '3 × 12' },
      { name: 'Single-leg balance (eyes open → closed)', dose: '3 × 30 s' },
    ],
  },
  {
    name: 'Post-match recovery', category: 'recovery', description: 'Day after a match.',
    items: [
      { name: 'Easy bike or pool session', dose: '20 min, conversational pace' },
      { name: 'Foam roll quads, glutes, calves', dose: '60 s each' },
      { name: 'Contrast shower or cold water', dose: '3 rounds 1 min cold / 2 min warm' },
      { name: 'Sleep target', dose: '8-9 h' },
    ],
  },
];

export function seedProtocols(db, coachId) {
  const ins = db.prepare('INSERT INTO protocols (coach_id, name, category, description, items) VALUES (?, ?, ?, ?, ?)');
  for (const p of PRESET_PROTOCOLS) ins.run(coachId, p.name, p.category, p.description, JSON.stringify(p.items));
}

export function registerRecovery(app, { db, q, fail, num, str, today, requireUser, requireCoach, athleteFor, ownedBy, tx, notify, first }) {
  const int15 = (v) => {
    const n = num(v);
    return n != null && n >= 1 && n <= 5 ? Math.round(n) : null;
  };

  app.get('/api/recovery/meta', (_req, res) => res.json({ items: READINESS_ITEMS, statuses: INJURY_STATUS, availability: AVAILABILITY, categories: PROTOCOL_CATEGORIES }));

  // ---------- readiness ----------
  app.get('/api/athletes/:id/readiness', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const days = Math.min(120, num(req.query.days) || 28);
    const rows = q(`SELECT * FROM readiness WHERE athlete_id = ? AND day > date('now', ?) ORDER BY day`).all(a.id, `-${days} days`);
    const day = str(req.query.today) || today(); // the athlete's local date
    res.json({ entries: rows, today: rows.find((r) => r.day === day) || null });
  });

  app.post('/api/athletes/:id/readiness', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const b = req.body || {};
    const vals = Object.fromEntries(Object.keys(READINESS_ITEMS).map((k) => [k, int15(b[k])]));
    if (Object.values(vals).some((v) => v == null)) fail(400, 'Answer every question (1-5)');
    const sleepHours = num(b.sleep_hours);
    const score = readinessScore({ ...vals, sleep_hours: sleepHours });
    const day = str(b.day) || today();
    const isNew = !q('SELECT 1 FROM readiness WHERE athlete_id = ? AND day = ?').get(a.id, day);
    q(`INSERT INTO readiness (athlete_id, day, sleep_hours, sleep_quality, energy, soreness, stress, mood, score, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (athlete_id, day) DO UPDATE SET sleep_hours = excluded.sleep_hours, sleep_quality = excluded.sleep_quality,
         energy = excluded.energy, soreness = excluded.soreness, stress = excluded.stress, mood = excluded.mood,
         score = excluded.score, notes = excluded.notes`).run(
      a.id, day, sleepHours, vals.sleep_quality, vals.energy, vals.soreness, vals.stress, vals.mood, score, str(b.notes),
    );
    // Only the first check-in of the day notifies; later edits don't.
    if (isNew) {
      notify(a.coach_id, {
        type: 'checkin', title: `${score < 50 ? '⚠️ ' : ''}${a.name} checked in: ${score}/100`, link: `/athletes/${a.id}?tab=recovery`, actorId: req.user.id,
        body: [sleepHours != null && `${sleepHours} h sleep`, `soreness ${vals.soreness}/5`, `energy ${vals.energy}/5`, str(b.notes) && `“${str(b.notes)}”`].filter(Boolean).join(' · '),
      });
    }
    res.status(201).json({ score });
  });

  // ---------- injuries ----------
  app.get('/api/athletes/:id/injuries', (req, res) => {
    const a = athleteFor(req, req.params.id);
    res.json({
      injuries: q(`SELECT i.*, (SELECT COUNT(*) FROM comments c WHERE c.target_type = 'injury' AND c.target_id = i.id) AS comment_count
        FROM injuries i WHERE athlete_id = ? ORDER BY (status = 'resolved'), reported_on DESC, id DESC`).all(a.id),
    });
  });

  const injuryFields = (b, cur = {}) => ({
    area: str(b.area) ?? cur.area,
    side: ['left', 'right', 'both', 'n/a'].includes(b.side) ? b.side : cur.side ?? null,
    description: b.description === undefined ? cur.description ?? null : str(b.description),
    pain: b.pain === undefined ? cur.pain ?? null : Math.max(0, Math.min(10, Math.round(num(b.pain) ?? 0))),
    availability: Object.keys(AVAILABILITY).includes(b.availability) ? b.availability : cur.availability || 'modified',
  });

  app.post('/api/athletes/:id/injuries', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const f = injuryFields(req.body || {});
    if (!f.area) fail(400, 'Which body area is injured?');
    const info = q(`INSERT INTO injuries (athlete_id, area, side, description, pain, availability, reported_on)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(a.id, f.area, f.side, f.description, f.pain, f.availability, str(req.body?.reported_on) || today());
    notify(a.coach_id, {
      type: 'injury', title: `🚑 ${a.name} reported an injury`, link: `/athletes/${a.id}?tab=recovery`, actorId: req.user.id,
      body: `${f.area}${f.side && f.side !== 'n/a' ? ` (${f.side})` : ''} · pain ${f.pain ?? '—'}/10 · ${AVAILABILITY[f.availability].toLowerCase()}`,
    });
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  const injuryFor = (req, id) => {
    const i = q('SELECT * FROM injuries WHERE id = ?').get(Number(id)) || fail(404, 'Injury not found');
    athleteFor(req, i.athlete_id);
    return i;
  };
  app.get('/api/injuries/:id', (req, res) => res.json({ injury: injuryFor(req, req.params.id) }));
  app.patch('/api/injuries/:id', (req, res) => {
    const u = requireUser(req);
    const i = injuryFor(req, req.params.id);
    const b = req.body || {};
    const f = injuryFields(b, i);
    let status = i.status;
    if (INJURY_STATUS.includes(b.status)) {
      // Athletes can mark it resolved; the coach manages the in-between stages.
      if (u.role === 'coach' || b.status === 'resolved') status = b.status;
    }
    q(`UPDATE injuries SET area = ?, side = ?, description = ?, pain = ?, availability = ?, status = ?,
       resolved_on = ?, updated_at = datetime('now') WHERE id = ?`).run(
      f.area, f.side, f.description, f.pain, status === 'resolved' ? 'full' : f.availability, status,
      status === 'resolved' ? i.resolved_on || today() : null, i.id,
    );
    const next = q('SELECT * FROM injuries WHERE id = ?').get(i.id);
    // Notify on meaningful changes only (status / availability), not every pain-slider nudge.
    if (next.status !== i.status || next.availability !== i.availability) {
      const athlete = q('SELECT * FROM users WHERE id = ?').get(i.athlete_id);
      const label = { new: 'New', monitoring: 'Monitoring', rehab: 'Rehab', resolved: 'Resolved' }[next.status];
      const what = `${next.area}: ${label} · ${AVAILABILITY[next.availability].toLowerCase()}`;
      if (u.role === 'coach') notify(athlete.id, { type: 'comment', title: `${first(u.name)} updated your injury`, body: what, link: '/recovery/injuries', actorId: u.id });
      else notify(athlete.coach_id, { type: 'injury', title: next.status === 'resolved' ? `${athlete.name} is back to full training` : `${athlete.name} updated an injury`, body: what, link: `/athletes/${athlete.id}?tab=recovery`, actorId: u.id });
    }
    res.json({ injury: next });
  });
  app.delete('/api/injuries/:id', (req, res) => {
    requireCoach(req);
    const i = injuryFor(req, req.params.id);
    q('DELETE FROM injuries WHERE id = ?').run(i.id);
    q("DELETE FROM comments WHERE target_type = 'injury' AND target_id = ?").run(i.id);
    res.json({ ok: true });
  });

  // ---------- protocols ----------
  const parse = (p) => ({ ...p, items: JSON.parse(p.items || '[]') });
  app.get('/api/protocols', (req, res) => {
    const coach = requireCoach(req);
    const rows = q(`SELECT p.*, (SELECT COUNT(*) FROM protocol_assignments a WHERE a.protocol_id = p.id AND a.active = 1) AS athlete_count
      FROM protocols p WHERE coach_id = ? ORDER BY category, name`).all(coach.id);
    res.json({ protocols: rows.map(parse) });
  });
  const protocolFields = (b) => {
    if (!str(b.name)) fail(400, 'Protocol name is required');
    const items = (Array.isArray(b.items) ? b.items : [])
      .filter((i) => str(i?.name))
      .map((i) => ({ name: String(i.name).trim(), dose: str(i.dose), notes: str(i.notes), video_url: str(i.video_url) }));
    return [String(b.name).trim(), PROTOCOL_CATEGORIES.includes(b.category) ? b.category : 'mobility', str(b.description), JSON.stringify(items)];
  };
  app.post('/api/protocols', (req, res) => {
    const coach = requireCoach(req);
    const info = q('INSERT INTO protocols (name, category, description, items, coach_id) VALUES (?, ?, ?, ?, ?)').run(...protocolFields(req.body || {}), coach.id);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });
  app.get('/api/protocols/:id', (req, res) => {
    const coach = requireCoach(req);
    const p = ownedBy('protocols', req.params.id, coach.id, 'Protocol');
    const assignments = q(`SELECT a.*, u.name AS athlete_name FROM protocol_assignments a JOIN users u ON u.id = a.athlete_id
      WHERE a.protocol_id = ? AND a.active = 1 ORDER BY u.name`).all(p.id);
    res.json({ protocol: parse(p), assignments });
  });
  app.put('/api/protocols/:id', (req, res) => {
    const coach = requireCoach(req);
    const p = ownedBy('protocols', req.params.id, coach.id, 'Protocol');
    q('UPDATE protocols SET name = ?, category = ?, description = ?, items = ? WHERE id = ?').run(...protocolFields(req.body || {}), p.id);
    res.json({ ok: true });
  });
  app.delete('/api/protocols/:id', (req, res) => {
    const coach = requireCoach(req);
    const p = ownedBy('protocols', req.params.id, coach.id, 'Protocol');
    q('DELETE FROM protocols WHERE id = ?').run(p.id);
    res.json({ ok: true });
  });
  app.post('/api/protocols/:id/assign', (req, res) => {
    const coach = requireCoach(req);
    const p = ownedBy('protocols', req.params.id, coach.id, 'Protocol');
    const ids = Array.isArray(req.body?.athlete_ids) ? req.body.athlete_ids : [];
    if (!ids.length) fail(400, 'Choose at least one athlete');
    tx(db, () => {
      for (const aid of ids) {
        const a = athleteFor(req, aid);
        q('UPDATE protocol_assignments SET active = 0 WHERE protocol_id = ? AND athlete_id = ?').run(p.id, a.id);
        q('INSERT INTO protocol_assignments (protocol_id, athlete_id, frequency, note) VALUES (?, ?, ?, ?)').run(p.id, a.id, str(req.body.frequency), str(req.body.note));
        notify(a.id, { type: 'program', title: `New protocol: ${p.name}`, body: [str(req.body.frequency), str(req.body.note)].filter(Boolean).join(' · ') || null, link: '/recovery/protocols', actorId: coach.id });
      }
    });
    res.status(201).json({ ok: true });
  });

  const assignmentFor = (req, id) => {
    const a = q('SELECT * FROM protocol_assignments WHERE id = ?').get(Number(id)) || fail(404, 'Not found');
    athleteFor(req, a.athlete_id);
    return a;
  };
  app.patch('/api/protocol-assignments/:id', (req, res) => {
    requireCoach(req);
    const a = assignmentFor(req, req.params.id);
    q('UPDATE protocol_assignments SET active = ?, frequency = COALESCE(?, frequency), note = COALESCE(?, note) WHERE id = ?').run(
      req.body?.active === undefined ? a.active : req.body.active ? 1 : 0, str(req.body?.frequency), str(req.body?.note), a.id,
    );
    res.json({ ok: true });
  });
  app.post('/api/protocol-assignments/:id/complete', (req, res) => {
    const a = assignmentFor(req, req.params.id);
    const day = str(req.body?.day) || today();
    if (req.body?.done === false) q('DELETE FROM protocol_completions WHERE assignment_id = ? AND day = ?').run(a.id, day);
    else q('INSERT OR IGNORE INTO protocol_completions (assignment_id, day) VALUES (?, ?)').run(a.id, day);
    res.json({ ok: true });
  });

  app.get('/api/athletes/:id/protocols', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const rows = q(`SELECT pa.*, p.name, p.category, p.description, p.items,
        (SELECT COUNT(*) FROM protocol_completions c WHERE c.assignment_id = pa.id AND c.day = ?) AS done_today,
        (SELECT COUNT(*) FROM protocol_completions c WHERE c.assignment_id = pa.id AND c.day > date('now', '-7 days')) AS done_7d
      FROM protocol_assignments pa JOIN protocols p ON p.id = pa.protocol_id
      WHERE pa.athlete_id = ? AND pa.active = 1 ORDER BY p.category, p.name`).all(str(req.query.today) || today(), a.id);
    res.json({ protocols: rows.map(parse) });
  });

  // ---------- squad board ----------
  app.get('/api/recovery/squad', (req, res) => {
    const coach = requireCoach(req);
    const athletes = q("SELECT id, name, position FROM users WHERE coach_id = ? AND role = 'athlete' ORDER BY name").all(coach.id);
    const latest = q('SELECT * FROM readiness WHERE athlete_id = ? ORDER BY day DESC LIMIT 1');
    const avg = q("SELECT AVG(score) AS s, COUNT(*) AS n FROM readiness WHERE athlete_id = ? AND day > date('now', '-7 days')");
    const inj = q("SELECT * FROM injuries WHERE athlete_id = ? AND status != 'resolved' ORDER BY reported_on DESC");
    const day = str(req.query.today) || today();
    res.json({
      today: day,
      athletes: athletes.map((a) => {
        const w = avg.get(a.id);
        return { ...a, latest: latest.get(a.id) || null, avg_7d: w.s != null ? Math.round(w.s) : null, checkins_7d: w.n, injuries: inj.all(a.id) };
      }),
    });
  });
}

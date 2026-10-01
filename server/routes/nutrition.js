import { ACTIVITY_LEVELS, GOALS, ageFrom, nutritionTargets, parseMfpCsv } from '../lib/nutrition.js';

export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Pre-training', 'Post-training'];

export function registerNutrition(app, { db, q, fail, num, str, today, requireUser, requireCoach, athleteFor, tx }) {
  const profileOf = (a) => {
    const np = q('SELECT * FROM nutrition_profiles WHERE athlete_id = ?').get(a.id) || {
      activity: 1.55, goal: 'maintain', rate: 0.25, protein_g_per_kg: 2.0, fat_pct: 25, kcal_override: null,
    };
    return {
      ...np,
      sex: a.sex, birth_date: a.birth_date, height_cm: a.height_cm, weight: a.bodyweight, age: ageFrom(a.birth_date),
    };
  };
  const targetsOf = (p) => nutritionTargets({ ...p, height: p.height_cm });
  const sum = (rows) => rows.reduce((t, r) => ({
    kcal: t.kcal + r.kcal, protein: t.protein + r.protein, carbs: t.carbs + r.carbs, fat: t.fat + r.fat,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });

  app.get('/api/nutrition/meta', (_req, res) => res.json({ activity: ACTIVITY_LEVELS, goals: GOALS, meals: MEALS }));

  app.get('/api/athletes/:id/nutrition', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const date = str(req.query.date) || today();
    const profile = profileOf(a);
    const entries = q('SELECT * FROM food_entries WHERE athlete_id = ? AND eaten_on = ? ORDER BY id').all(a.id, date);
    const week = q(`SELECT eaten_on AS date, SUM(kcal) AS kcal, SUM(protein) AS protein, SUM(carbs) AS carbs, SUM(fat) AS fat
      FROM food_entries WHERE athlete_id = ? AND eaten_on > date(?, '-14 days') AND eaten_on <= ? GROUP BY eaten_on ORDER BY eaten_on`).all(a.id, date, date);
    const recent = q(`SELECT name, quantity, kcal, protein, carbs, fat, MAX(id) AS last FROM food_entries
      WHERE athlete_id = ? AND source = 'manual' GROUP BY name, quantity ORDER BY last DESC LIMIT 20`).all(a.id);
    const weights = q('SELECT measured_on AS date, weight FROM bodyweight_logs WHERE athlete_id = ? ORDER BY measured_on DESC LIMIT 90').all(a.id).reverse();
    res.json({ date, profile, targets: targetsOf(profile), entries, totals: sum(entries), week, recent, weights });
  });

  app.put('/api/athletes/:id/nutrition/profile', (req, res) => {
    const u = requireUser(req);
    const a = athleteFor(req, req.params.id);
    const b = req.body || {};
    const cur = profileOf(a);
    const sex = ['male', 'female'].includes(b.sex) ? b.sex : cur.sex;
    tx(db, () => {
      q('UPDATE users SET sex = ?, birth_date = ?, height_cm = ? WHERE id = ?').run(
        sex ?? null, b.birth_date === undefined ? cur.birth_date ?? null : str(b.birth_date), b.height_cm === undefined ? cur.height_cm ?? null : num(b.height_cm), a.id,
      );
      if (num(b.weight)) logWeight(a.id, today(), num(b.weight));
      const goal = Object.keys(GOALS).includes(b.goal) ? b.goal : cur.goal;
      // Only the coach can pin a calorie target; athletes keep whatever the coach set.
      const override = u.role === 'coach' && b.kcal_override !== undefined ? num(b.kcal_override) : cur.kcal_override ?? null;
      q(`INSERT INTO nutrition_profiles (athlete_id, activity, goal, rate, protein_g_per_kg, fat_pct, kcal_override, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT (athlete_id) DO UPDATE SET activity = excluded.activity, goal = excluded.goal, rate = excluded.rate,
           protein_g_per_kg = excluded.protein_g_per_kg, fat_pct = excluded.fat_pct, kcal_override = excluded.kcal_override, updated_at = excluded.updated_at`).run(
        a.id, num(b.activity) || cur.activity, goal, Math.min(1.5, Math.abs(num(b.rate) ?? cur.rate)),
        num(b.protein_g_per_kg) || cur.protein_g_per_kg, Math.min(50, Math.max(10, num(b.fat_pct) || cur.fat_pct)), override,
      );
    });
    const fresh = profileOf(q('SELECT * FROM users WHERE id = ?').get(a.id));
    res.json({ profile: fresh, targets: targetsOf(fresh) });
  });

  function logWeight(athleteId, date, weight) {
    q(`INSERT INTO bodyweight_logs (athlete_id, measured_on, weight) VALUES (?, ?, ?)
       ON CONFLICT (athlete_id, measured_on) DO UPDATE SET weight = excluded.weight`).run(athleteId, date, weight);
    // Keep the profile bodyweight at the most recent weigh-in.
    const latest = q('SELECT weight FROM bodyweight_logs WHERE athlete_id = ? ORDER BY measured_on DESC LIMIT 1').get(athleteId);
    q('UPDATE users SET bodyweight = ? WHERE id = ?').run(latest.weight, athleteId);
  }

  app.post('/api/athletes/:id/bodyweight', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const w = num(req.body?.weight);
    if (!w || w < 30 || w > 250) fail(400, 'Enter a bodyweight in kg');
    logWeight(a.id, str(req.body?.measured_on) || today(), w);
    res.status(201).json({ ok: true });
  });

  app.post('/api/athletes/:id/food', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const b = req.body || {};
    if (!str(b.name)) fail(400, 'What did you eat?');
    const vals = ['kcal', 'protein', 'carbs', 'fat'].map((k) => Math.max(0, num(b[k]) || 0));
    // Fill in calories from macros if only macros were entered.
    if (!vals[0] && (vals[1] || vals[2] || vals[3])) vals[0] = Math.round(vals[1] * 4 + vals[2] * 4 + vals[3] * 9);
    const info = q('INSERT INTO food_entries (athlete_id, eaten_on, meal, name, quantity, kcal, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      a.id, str(b.eaten_on) || today(), MEALS.includes(b.meal) ? b.meal : 'Snacks', String(b.name).trim(), str(b.quantity), ...vals,
    );
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  app.delete('/api/food/:id', (req, res) => {
    const f = q('SELECT * FROM food_entries WHERE id = ?').get(Number(req.params.id)) || fail(404, 'Entry not found');
    athleteFor(req, f.athlete_id);
    q('DELETE FROM food_entries WHERE id = ?').run(f.id);
    res.json({ ok: true });
  });

  // MyFitnessPal has no public API, so athletes import its CSV export instead.
  // Re-importing replaces earlier MFP rows for the same days, so it never double counts.
  app.post('/api/athletes/:id/food/import-mfp', (req, res) => {
    const a = athleteFor(req, req.params.id);
    let rows;
    try {
      rows = parseMfpCsv(req.body?.csv || '');
    } catch (e) {
      fail(400, e.message);
    }
    const days = [...new Set(rows.map((r) => r.eaten_on))];
    tx(db, () => {
      for (const d of days) q("DELETE FROM food_entries WHERE athlete_id = ? AND eaten_on = ? AND source = 'mfp'").run(a.id, d);
      for (const r of rows) {
        q("INSERT INTO food_entries (athlete_id, eaten_on, meal, name, kcal, protein, carbs, fat, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'mfp')").run(
          a.id, r.eaten_on, MEALS.find((m) => m.toLowerCase() === r.meal.toLowerCase()) || r.meal, `MyFitnessPal — ${r.meal}`,
          r.kcal, r.protein, r.carbs, r.fat,
        );
      }
    });
    res.json({ imported: rows.length, days: days.length, from: days.sort()[0], to: days.sort().at(-1) });
  });

  // Squad overview for the coach: targets vs last 7 days' logged intake.
  app.get('/api/nutrition/squad', (req, res) => {
    const coach = requireCoach(req);
    const athletes = q("SELECT * FROM users WHERE coach_id = ? AND role = 'athlete' ORDER BY name").all(coach.id);
    const week = q(`SELECT COUNT(*) AS days, AVG(k) AS kcal, AVG(p) AS protein FROM (
      SELECT eaten_on, SUM(kcal) AS k, SUM(protein) AS p FROM food_entries
      WHERE athlete_id = ? AND eaten_on > date('now', '-7 days') GROUP BY eaten_on)`);
    const trend = q(`SELECT weight, measured_on FROM bodyweight_logs WHERE athlete_id = ? AND measured_on >= date('now', '-28 days') ORDER BY measured_on`);
    res.json({
      athletes: athletes.map((a) => {
        const p = profileOf(a);
        const w = week.get(a.id);
        const t = trend.all(a.id);
        return {
          id: a.id, name: a.name, position: a.position, goal: p.goal, rate: p.rate, bodyweight: a.bodyweight,
          targets: targetsOf(p), days_logged: w.days, avg_kcal: w.kcal ? Math.round(w.kcal) : null, avg_protein: w.protein ? Math.round(w.protein) : null,
          weight_change_28d: t.length > 1 ? Math.round((t.at(-1).weight - t[0].weight) * 10) / 10 : null,
        };
      }),
    });
  });
}

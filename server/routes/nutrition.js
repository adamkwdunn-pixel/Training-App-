import {
  ACTIVITY_LEVELS, BMR_EQUATIONS, DEFAULT_PROFILE, GOALS, MACRO_MODES, ageFrom, nutritionTargets, weeklyRate, withTrend,
} from '../../shared/nutrition.js';
import { METHODS, composition, jacksonPollock, navyBodyFat, sitesFor } from '../../shared/bodyfat.js';

export function registerNutrition(app, { db, q, fail, num, str, today, requireUser, requireCoach, athleteFor, tx }) {
  const latestBodyFat = (athleteId) => q('SELECT * FROM body_measurements WHERE athlete_id = ? ORDER BY measured_on DESC, id DESC LIMIT 1').get(athleteId);

  const profileOf = (a) => {
    const np = q('SELECT * FROM nutrition_profiles WHERE athlete_id = ?').get(a.id) || DEFAULT_PROFILE;
    const bf = latestBodyFat(a.id);
    return {
      ...DEFAULT_PROFILE, ...np,
      sex: a.sex, birth_date: a.birth_date, height_cm: a.height_cm, weight: a.bodyweight, age: ageFrom(a.birth_date),
      body_fat_pct: bf?.body_fat_pct ?? null, body_fat_on: bf?.measured_on ?? null,
      lean_mass: bf ? composition(a.bodyweight || bf.bodyweight, bf.body_fat_pct).lean_mass : null,
    };
  };
  const targetsOf = (p) => nutritionTargets({ ...p, height: p.height_cm });
  const weightsOf = (id) => withTrend(q('SELECT measured_on AS date, weight FROM bodyweight_logs WHERE athlete_id = ? ORDER BY measured_on').all(id));

  app.get('/api/nutrition/meta', (_req, res) => res.json({ activity: ACTIVITY_LEVELS, goals: GOALS, equations: BMR_EQUATIONS, macro_modes: MACRO_MODES, methods: METHODS }));

  app.get('/api/athletes/:id/nutrition', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const profile = profileOf(a);
    const weights = weightsOf(a.id);
    res.json({ profile, targets: targetsOf(profile), weights, rate_28d: weeklyRate(weights, 28) });
  });

  app.put('/api/athletes/:id/nutrition/profile', (req, res) => {
    const u = requireUser(req);
    const a = athleteFor(req, req.params.id);
    const b = req.body || {};
    const cur = profileOf(a);
    const pick = (k, ok) => (b[k] !== undefined && ok(b[k]) ? b[k] : cur[k]);
    const clamp = (k, lo, hi) => {
      const v = num(b[k]);
      return v == null ? cur[k] : Math.min(hi, Math.max(lo, v));
    };
    tx(db, () => {
      q('UPDATE users SET sex = ?, birth_date = ?, height_cm = ? WHERE id = ?').run(
        pick('sex', (v) => ['male', 'female'].includes(v)) ?? null,
        b.birth_date === undefined ? cur.birth_date ?? null : str(b.birth_date),
        b.height_cm === undefined ? cur.height_cm ?? null : num(b.height_cm),
        a.id,
      );
      if (num(b.weight) && num(b.weight) !== cur.weight) logWeight(a.id, today(), num(b.weight));
      // Only the coach can pin a calorie target; athletes keep whatever the coach set.
      const override = u.role === 'coach' && b.kcal_override !== undefined ? num(b.kcal_override) : cur.kcal_override ?? null;
      const v = {
        activity: clamp('activity', 1.1, 2.2),
        goal: pick('goal', (x) => x in GOALS),
        rate: clamp('rate', 0, 1.5),
        bmr_equation: pick('bmr_equation', (x) => x in BMR_EQUATIONS),
        macro_mode: pick('macro_mode', (x) => x in MACRO_MODES),
        protein_g_per_kg: clamp('protein_g_per_kg', 0.8, 4),
        fat_g_per_kg: clamp('fat_g_per_kg', 0.3, 3),
        protein_pct: clamp('protein_pct', 5, 60),
        fat_pct: clamp('fat_pct', 5, 60),
      };
      if (v.protein_pct + v.fat_pct > 95) fail(400, 'Protein + fat can’t be more than 95% of calories');
      q(`INSERT INTO nutrition_profiles (athlete_id, activity, goal, rate, bmr_equation, macro_mode, protein_g_per_kg, fat_g_per_kg,
           protein_pct, fat_pct, kcal_override, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT (athlete_id) DO UPDATE SET activity = excluded.activity, goal = excluded.goal, rate = excluded.rate,
           bmr_equation = excluded.bmr_equation, macro_mode = excluded.macro_mode, protein_g_per_kg = excluded.protein_g_per_kg,
           fat_g_per_kg = excluded.fat_g_per_kg, protein_pct = excluded.protein_pct, fat_pct = excluded.fat_pct,
           kcal_override = excluded.kcal_override, updated_at = excluded.updated_at`).run(
        a.id, v.activity, v.goal, v.rate, v.bmr_equation, v.macro_mode, v.protein_g_per_kg, v.fat_g_per_kg, v.protein_pct, v.fat_pct, override,
      );
    });
    const fresh = profileOf(q('SELECT * FROM users WHERE id = ?').get(a.id));
    res.json({ profile: fresh, targets: targetsOf(fresh) });
  });

  // ---------- bodyweight ----------
  function logWeight(athleteId, date, weight) {
    q(`INSERT INTO bodyweight_logs (athlete_id, measured_on, weight) VALUES (?, ?, ?)
       ON CONFLICT (athlete_id, measured_on) DO UPDATE SET weight = excluded.weight`).run(athleteId, date, weight);
    syncBodyweight(athleteId);
  }
  // Keep the profile bodyweight at the most recent weigh-in.
  function syncBodyweight(athleteId) {
    const latest = q('SELECT weight FROM bodyweight_logs WHERE athlete_id = ? ORDER BY measured_on DESC LIMIT 1').get(athleteId);
    if (latest) q('UPDATE users SET bodyweight = ? WHERE id = ?').run(latest.weight, athleteId);
  }

  app.post('/api/athletes/:id/bodyweight', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const w = num(req.body?.weight);
    if (!w || w < 30 || w > 250) fail(400, 'Enter a bodyweight in kg');
    logWeight(a.id, str(req.body?.measured_on) || today(), w);
    res.status(201).json({ ok: true });
  });

  app.delete('/api/athletes/:id/bodyweight/:date', (req, res) => {
    const a = athleteFor(req, req.params.id);
    q('DELETE FROM bodyweight_logs WHERE athlete_id = ? AND measured_on = ?').run(a.id, req.params.date);
    syncBodyweight(a.id);
    res.json({ ok: true });
  });

  // ---------- body composition ----------
  app.get('/api/athletes/:id/bodycomp', (req, res) => {
    const a = athleteFor(req, req.params.id);
    const rows = q(`SELECT m.*, u.name AS created_by_name FROM body_measurements m LEFT JOIN users u ON u.id = m.created_by
      WHERE m.athlete_id = ? ORDER BY m.measured_on, m.id`).all(a.id);
    res.json({
      measurements: rows.map((m) => ({ ...m, inputs: JSON.parse(m.inputs), ...composition(m.bodyweight, m.body_fat_pct) })),
      profile: { sex: a.sex, age: ageFrom(a.birth_date), height_cm: a.height_cm, weight: a.bodyweight },
    });
  });

  app.post('/api/athletes/:id/bodycomp', (req, res) => {
    const u = requireUser(req);
    const a = athleteFor(req, req.params.id);
    const b = req.body || {};
    const method = b.method in METHODS ? b.method : fail(400, 'Choose a method');
    const measuredOn = str(b.measured_on) || today();
    const age = ageFrom(a.birth_date, new Date(`${measuredOn}T12:00:00`));
    // Use the weigh-in from that day (or the closest before it) so lean mass is right for back-dated entries.
    const weight = num(b.weight)
      || q('SELECT weight FROM bodyweight_logs WHERE athlete_id = ? AND measured_on <= ? ORDER BY measured_on DESC LIMIT 1').get(a.id, measuredOn)?.weight
      || a.bodyweight;
    let pct;
    let sum = null;
    let inputs = {};
    if (method === 'navy') {
      if (!a.sex || !a.height_cm) fail(400, 'Add sex and height in Nutrition → Targets first');
      inputs = { neck: num(b.neck), waist: num(b.waist), ...(a.sex === 'female' ? { hip: num(b.hip) } : {}) };
      pct = navyBodyFat({ sex: a.sex, height: a.height_cm, ...inputs });
      if (pct == null) fail(400, a.sex === 'female' ? 'Enter neck, waist and hip (waist + hip must be more than neck)' : 'Enter neck and waist (waist must be bigger than neck)');
    } else if (method === 'jp3' || method === 'jp7') {
      if (!a.sex || age == null) fail(400, 'Add sex and date of birth in Nutrition → Targets first');
      const keys = sitesFor(method, a.sex);
      inputs = Object.fromEntries(keys.map((k) => [k, num(b.sites?.[k])]));
      const out = jacksonPollock({ method, sex: a.sex, age, sites: inputs });
      if (!out) fail(400, `Enter all ${keys.length} skinfolds in mm`);
      pct = out.pct;
      sum = out.sum;
      inputs.density = out.density;
    } else {
      pct = num(b.body_fat_pct);
      inputs = { source: str(b.source) };
    }
    if (pct == null || pct < 2 || pct > 60) fail(400, 'That gives an unrealistic body fat % — check the measurements');
    if (num(b.weight)) logWeight(a.id, measuredOn, num(b.weight));
    const info = q(`INSERT INTO body_measurements (athlete_id, measured_on, method, inputs, bodyweight, body_fat_pct, sum_mm, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(a.id, measuredOn, method, JSON.stringify(inputs), weight ?? null, pct, sum, str(b.notes), u.id);
    res.status(201).json({ id: Number(info.lastInsertRowid), body_fat_pct: pct, sum_mm: sum, ...composition(weight, pct) });
  });

  app.delete('/api/bodycomp/:id', (req, res) => {
    const m = q('SELECT * FROM body_measurements WHERE id = ?').get(Number(req.params.id)) || fail(404, 'Measurement not found');
    athleteFor(req, m.athlete_id);
    q('DELETE FROM body_measurements WHERE id = ?').run(m.id);
    res.json({ ok: true });
  });

  // ---------- squad overview ----------
  app.get('/api/nutrition/squad', (req, res) => {
    const coach = requireCoach(req);
    const athletes = q("SELECT * FROM users WHERE coach_id = ? AND role = 'athlete' ORDER BY name").all(coach.id);
    res.json({
      athletes: athletes.map((a) => {
        const p = profileOf(a);
        const weights = weightsOf(a.id);
        return {
          id: a.id, name: a.name, position: a.position, goal: p.goal, rate: p.rate, bodyweight: a.bodyweight,
          last_weigh_in: weights.at(-1)?.date ?? null, trend: weights.at(-1)?.trend ?? null, rate_28d: weeklyRate(weights, 28),
          body_fat_pct: p.body_fat_pct, body_fat_on: p.body_fat_on, lean_mass: p.lean_mass, targets: targetsOf(p),
        };
      }),
    });
  });
}

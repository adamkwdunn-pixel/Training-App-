import test from 'node:test';
import assert from 'node:assert/strict';
import { mifflinStJeor, katchMcArdle, nutritionTargets, ageFrom, withTrend, weeklyRate } from '../shared/nutrition.js';
import { navyBodyFat, jacksonPollock, siri, composition, sitesFor } from '../shared/bodyfat.js';
import { readinessScore } from '../server/lib/recovery.js';

const base = { weight: 100, height: 185, age: 25, sex: 'male', activity: 1.55 };

test('Mifflin-St Jeor and Katch-McArdle match hand calculation', () => {
  // 100 kg, 185 cm, 25 y male: 1000 + 1156.25 - 125 + 5
  assert.equal(mifflinStJeor(base), 2036.25);
  assert.equal(mifflinStJeor({ weight: 70, height: 170, age: 30, sex: 'female' }), 700 + 1062.5 - 150 - 161);
  assert.equal(mifflinStJeor({ weight: 70, height: 170, sex: 'female' }), null);
  assert.equal(katchMcArdle(85), 370 + 21.6 * 85);
});

test('goal adjusts calories from maintenance', () => {
  const maintain = nutritionTargets({ ...base, goal: 'maintain' });
  assert.equal(maintain.kcal, Math.round(2036.25 * 1.55));
  assert.equal(nutritionTargets({ ...base, goal: 'lose', rate: 0.5 }).adjust, -550);
  assert.equal(nutritionTargets({ ...base, goal: 'gain', rate: 0.25 }).adjust, 275);
  assert.equal(nutritionTargets({ ...base, goal: 'lose', rate: 0.5, kcal_override: 3000 }).kcal, 3000);
  assert.deepEqual(nutritionTargets({ weight: 100 }).missing, ['height', 'date of birth', 'sex']);
});

test('macros per kg: carbs fill the remainder', () => {
  const t = nutritionTargets({ ...base, macro_mode: 'per_kg', protein_g_per_kg: 2.2, fat_g_per_kg: 0.9 });
  assert.equal(t.protein, 220);
  assert.equal(t.fat, 90);
  assert.ok(Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.kcal) < 6);
  assert.equal(t.per_kg.protein, 2.2);
  assert.equal(t.pct.protein + t.pct.fat + t.pct.carbs, 100);
});

test('macros as % of calories', () => {
  const t = nutritionTargets({ ...base, macro_mode: 'percent', protein_pct: 30, fat_pct: 25, kcal_override: 3000 });
  assert.equal(t.protein, 225);
  assert.equal(t.fat, Math.round(750 / 9));
  assert.equal(t.carbs, Math.round(1350 / 4));
});

test('impossible macros are flagged, not negative', () => {
  const t = nutritionTargets({ ...base, protein_g_per_kg: 4, fat_g_per_kg: 3, kcal_override: 2000 });
  assert.equal(t.carbs, 0);
  assert.equal(t.warnings.length, 1);
});

test('Katch-McArdle uses lean mass when chosen', () => {
  const t = nutritionTargets({ ...base, bmr_equation: 'katch', lean_mass: 85 });
  assert.equal(t.equation, 'katch');
  assert.equal(t.bmr, Math.round(370 + 21.6 * 85));
  const fallback = nutritionTargets({ ...base, bmr_equation: 'katch' });
  assert.equal(fallback.equation, 'mifflin');
  assert.equal(fallback.warnings.length, 1);
});

test('age, weight trend and weekly rate', () => {
  assert.equal(ageFrom('2000-06-15', new Date('2026-06-14T12:00:00')), 25);
  const days = Array.from({ length: 29 }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), weight: 100 - i * (0.5 / 7) }));
  assert.equal(weeklyRate(days), -0.5);
  const t = withTrend([{ date: '2026-01-01', weight: 100 }, { date: '2026-01-02', weight: 102 }, { date: '2026-01-20', weight: 90 }]);
  assert.deepEqual(t.map((x) => x.trend), [100, 101, 90]);
});

test('US Navy body fat', () => {
  // Male 180 cm, neck 40, waist 85: 495 / (1.0324 − 0.19077·log10(45) + 0.15456·log10(180)) − 450
  const expected = 495 / (1.0324 - 0.19077 * Math.log10(45) + 0.15456 * Math.log10(180)) - 450;
  assert.equal(navyBodyFat({ sex: 'male', height: 180, neck: 40, waist: 85 }), Math.round(expected * 10) / 10);
  const f = navyBodyFat({ sex: 'female', height: 165, neck: 32, waist: 70, hip: 95 });
  assert.ok(f > 20 && f < 30);
  assert.equal(navyBodyFat({ sex: 'female', height: 165, neck: 32, waist: 70 }), null); // hip required
  assert.equal(navyBodyFat({ sex: 'male', height: 180, neck: 45, waist: 40 }), null);
});

test('Jackson-Pollock skinfolds + Siri', () => {
  assert.deepEqual(sitesFor('jp3', 'male'), ['chest', 'abdominal', 'thigh']);
  assert.deepEqual(sitesFor('jp3', 'female'), ['triceps', 'suprailiac', 'thigh']);
  const m = jacksonPollock({ method: 'jp3', sex: 'male', age: 25, sites: { chest: 10, abdominal: 20, thigh: 15 } });
  const S = 45;
  const d = 1.10938 - 0.0008267 * S + 0.0000016 * S * S - 0.0002574 * 25;
  assert.equal(m.sum, 45);
  assert.equal(m.pct, Math.round(siri(d) * 10) / 10);
  const seven = jacksonPollock({ method: 'jp7', sex: 'male', age: 25, sites: { chest: 8, midaxillary: 10, triceps: 9, subscapular: 12, abdominal: 18, suprailiac: 12, thigh: 11 } });
  assert.equal(seven.sum, 80);
  assert.ok(seven.pct > 8 && seven.pct < 15);
  assert.equal(jacksonPollock({ method: 'jp3', sex: 'male', age: 25, sites: { chest: 10 } }), null);
  assert.deepEqual(composition(100, 15), { fat_mass: 15, lean_mass: 85 });
});

test('readiness score', () => {
  // Soreness and stress read naturally: 1 = none / relaxed, 5 = very sore / very stressed.
  const best = { sleep_quality: 5, energy: 5, soreness: 1, stress: 1, mood: 5 };
  const worst = { sleep_quality: 1, energy: 1, soreness: 5, stress: 5, mood: 1 };
  assert.equal(readinessScore(best), 100);
  assert.equal(readinessScore(worst), 0);
  assert.equal(readinessScore({ sleep_quality: 3, energy: 3, soreness: 3, stress: 3, mood: 3 }), 50);
  assert.equal(readinessScore({ ...best, sleep_hours: 5 }), 90);
  assert.ok(readinessScore({ ...best, soreness: 5 }) < readinessScore(best)); // very sore lowers readiness
});

test('old check-ins are converted once to the new soreness/stress scale', async () => {
  const { openDb } = await import('../server/db.js');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'db-')), 't.db');
  let db = openDb(file);
  db.exec("INSERT INTO users (id, name, email, password_hash, role) VALUES (1, 'A', 'a@x.com', 'x', 'athlete')");
  db.exec("INSERT INTO readiness (athlete_id, day, soreness, stress) VALUES (1, '2026-01-01', 5, 4)");
  db.exec("DELETE FROM app_settings WHERE key = 'readiness_scale_v2'"); // as if written by the old version
  db.close();
  db = openDb(file);
  assert.deepEqual({ ...db.prepare('SELECT soreness, stress FROM readiness').get() }, { soreness: 1, stress: 2 });
  db.close();
  db = openDb(file); // runs only once
  assert.deepEqual({ ...db.prepare('SELECT soreness, stress FROM readiness').get() }, { soreness: 1, stress: 2 });
  db.close();
});

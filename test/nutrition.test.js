import test from 'node:test';
import assert from 'node:assert/strict';
import { mifflinStJeor, nutritionTargets, parseMfpCsv, ageFrom } from '../server/lib/nutrition.js';
import { readinessScore } from '../server/lib/recovery.js';

test('Mifflin-St Jeor matches hand calculation', () => {
  // 100 kg, 185 cm, 25 y male: 1000 + 1156.25 - 125 + 5
  assert.equal(mifflinStJeor({ weight: 100, height: 185, age: 25, sex: 'male' }), 2036.25);
  assert.equal(mifflinStJeor({ weight: 70, height: 170, age: 30, sex: 'female' }), 700 + 1062.5 - 150 - 161);
  assert.equal(mifflinStJeor({ weight: 70, height: 170, sex: 'female' }), null);
});

test('targets apply activity and goal', () => {
  const base = { weight: 100, height: 185, age: 25, sex: 'male', activity: 1.55, protein_g_per_kg: 2, fat_pct: 25 };
  const maintain = nutritionTargets({ ...base, goal: 'maintain' });
  assert.equal(maintain.kcal, Math.round(2036.25 * 1.55));
  const lose = nutritionTargets({ ...base, goal: 'lose', rate: 0.5 });
  assert.equal(lose.adjust, -550);
  assert.equal(lose.kcal, Math.round(2036.25 * 1.55 - 550));
  const gain = nutritionTargets({ ...base, goal: 'gain', rate: 0.25 });
  assert.equal(gain.adjust, 275);
  assert.equal(maintain.protein, 200);
  assert.equal(maintain.fat, Math.round((maintain.kcal * 0.25) / 9));
  // Macro calories add back up to the target.
  assert.ok(Math.abs(maintain.protein * 4 + maintain.carbs * 4 + maintain.fat * 9 - maintain.kcal) < 10);
  assert.deepEqual(nutritionTargets({ weight: 100 }).missing, ['height', 'date of birth', 'sex']);
  assert.equal(nutritionTargets({ ...base, goal: 'lose', rate: 0.5, kcal_override: 3000 }).kcal, 3000);
});

test('age from birth date', () => {
  assert.equal(ageFrom('2000-06-15', new Date('2026-06-14T12:00:00')), 25);
  assert.equal(ageFrom('2000-06-15', new Date('2026-06-15T12:00:00')), 26);
});

test('MyFitnessPal CSV import', () => {
  const csv = 'Date,Meal,Calories,Fat (g),Saturated Fat,Carbohydrates (g),Fiber,Protein (g),Note\n'
    + '2026-09-28,Breakfast,820,25.5,8,95,6,48,\n'
    + '"2026-09-28","Lunch","1,050",30,10,120,8,70,"chicken, rice"\n'
    + '09/29/2026,Dinner,900,20,5,100,5,65,\n';
  const rows = parseMfpCsv(csv);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], { eaten_on: '2026-09-28', meal: 'Lunch', kcal: 1050, protein: 70, carbs: 120, fat: 30 });
  assert.equal(rows[2].eaten_on, '2026-09-29');
  assert.throws(() => parseMfpCsv('foo,bar\n1,2'), /Date and Calories/);
});

test('readiness score', () => {
  const all = (v) => ({ sleep_quality: v, energy: v, soreness: v, stress: v, mood: v });
  assert.equal(readinessScore(all(5)), 100);
  assert.equal(readinessScore(all(1)), 0);
  assert.equal(readinessScore(all(3)), 50);
  assert.equal(readinessScore({ ...all(5), sleep_hours: 5 }), 90);
});

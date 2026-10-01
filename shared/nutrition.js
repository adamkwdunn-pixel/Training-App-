// Energy and macro targets. Pure functions shared by the server and the web app,
// so the numbers an athlete sees while adjusting sliders match what gets saved.

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Sedentary (rest / off-season)' },
  { value: 1.375, label: 'Light — 1-3 sessions a week' },
  { value: 1.55, label: 'Moderate — 3-5 sessions a week' },
  { value: 1.725, label: 'High — daily training' },
  { value: 1.9, label: 'Very high — double sessions / pre-season' },
];

export const GOALS = { lose: 'Lose weight', maintain: 'Maintain weight', gain: 'Gain weight' };
export const BMR_EQUATIONS = {
  mifflin: 'Mifflin-St Jeor',
  katch: 'Katch-McArdle (uses lean mass)',
};
export const MACRO_MODES = { per_kg: 'Grams per kg bodyweight', percent: '% of calories' };
export const KCAL_PER_KG = 7700; // approx. energy in 1 kg of body mass

export const DEFAULT_PROFILE = {
  activity: 1.55, goal: 'maintain', rate: 0.25, bmr_equation: 'mifflin', macro_mode: 'per_kg',
  protein_g_per_kg: 2.0, fat_g_per_kg: 1.0, protein_pct: 30, fat_pct: 25, kcal_override: null,
};

export function ageFrom(birthDate, on = new Date()) {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  let age = on.getFullYear() - b.getFullYear();
  const m = on.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < b.getDate())) age--;
  return age;
}

/** Mifflin-St Jeor resting energy: 10·kg + 6.25·cm − 5·age + 5 (male) / −161 (female). */
export function mifflinStJeor({ weight, height, age, sex }) {
  if (!weight || !height || age == null || !sex) return null;
  return 10 * weight + 6.25 * height - 5 * age + (sex === 'female' ? -161 : 5);
}

/** Katch-McArdle resting energy from lean body mass: 370 + 21.6·LBM(kg). */
export function katchMcArdle(leanMass) {
  return leanMass ? 370 + 21.6 * leanMass : null;
}

/**
 * Daily targets.
 * p: { weight, height, age, sex, lean_mass, activity, goal, rate, bmr_equation,
 *      macro_mode, protein_g_per_kg, fat_g_per_kg, protein_pct, fat_pct, kcal_override }
 * Carbohydrate always fills whatever calories protein and fat leave.
 */
export function nutritionTargets(input) {
  const p = { ...DEFAULT_PROFILE, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v != null && v !== '')) };
  const missing = [];
  if (!p.weight) missing.push('bodyweight');
  const useKatch = p.bmr_equation === 'katch' && p.lean_mass;
  if (!useKatch) {
    if (!p.height) missing.push('height');
    if (p.age == null) missing.push('date of birth');
    if (!p.sex) missing.push('sex');
  }
  const bmr = useKatch ? katchMcArdle(p.lean_mass) : mifflinStJeor(p);
  const warnings = [];
  if (p.bmr_equation === 'katch' && !p.lean_mass) warnings.push('Katch-McArdle needs a body fat measurement — using Mifflin-St Jeor until one is logged.');
  if (bmr == null && !p.kcal_override) return { missing, warnings };

  const activity = Number(p.activity);
  const tdee = bmr != null ? bmr * activity : null;
  const rate = Math.abs(Number(p.rate) || 0);
  const adjust = p.goal === 'gain' ? (rate * KCAL_PER_KG) / 7 : p.goal === 'lose' ? -(rate * KCAL_PER_KG) / 7 : 0;
  const kcal = p.kcal_override ? Number(p.kcal_override) : tdee + adjust;
  const w = Number(p.weight) || null;

  let protein;
  let fat;
  if (p.macro_mode === 'percent') {
    protein = (kcal * Number(p.protein_pct)) / 100 / 4;
    fat = (kcal * Number(p.fat_pct)) / 100 / 9;
  } else {
    protein = w ? Number(p.protein_g_per_kg) * w : null;
    fat = w ? Number(p.fat_g_per_kg) * w : null;
  }
  let carbs = protein != null && fat != null ? (kcal - protein * 4 - fat * 9) / 4 : null;
  if (carbs != null && carbs < 0) {
    warnings.push('Protein and fat already exceed the calorie target — lower one of them.');
    carbs = 0;
  }

  const r = (n) => (n == null ? null : Math.round(n));
  const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
  const pct = (g, k) => (g == null || !kcal ? null : Math.round(((g * k) / kcal) * 100));
  return {
    equation: useKatch ? 'katch' : 'mifflin',
    bmr: r(bmr), tdee: r(tdee), adjust: r(adjust), kcal: r(kcal),
    protein: r(protein), fat: r(fat), carbs: r(carbs),
    per_kg: w ? { protein: r1(protein / w), fat: r1(fat / w), carbs: r1(carbs / w) } : null,
    pct: { protein: pct(protein, 4), fat: pct(fat, 9), carbs: pct(carbs, 4) },
    overridden: !!p.kcal_override, missing, warnings,
  };
}

/** Rolling mean of the previous `days` calendar days (inclusive) for each weigh-in. */
export function withTrend(weights, days = 7) {
  return weights.map((w, i) => {
    const end = new Date(`${w.date}T00:00:00`).getTime();
    const window = weights.slice(0, i + 1).filter((x) => end - new Date(`${x.date}T00:00:00`).getTime() < days * 864e5);
    return { ...w, trend: Math.round((window.reduce((s, x) => s + x.weight, 0) / window.length) * 10) / 10 };
  });
}

/** Average weekly change (kg/week) over the last `days`, by least-squares slope. */
export function weeklyRate(weights, days = 28) {
  if (weights.length < 2) return null;
  const lastT = new Date(`${weights.at(-1).date}T00:00:00`).getTime();
  const pts = weights
    .map((w) => ({ x: (new Date(`${w.date}T00:00:00`).getTime() - lastT) / 864e5, y: w.weight }))
    .filter((p) => p.x > -days);
  if (pts.length < 2) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const den = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (!den) return null;
  const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / den;
  return Math.round(slope * 7 * 100) / 100;
}

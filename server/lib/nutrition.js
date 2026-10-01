// Energy targets (Mifflin-St Jeor) and MyFitnessPal CSV import.

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Sedentary (rest / off-season)' },
  { value: 1.375, label: 'Light — 1-3 sessions a week' },
  { value: 1.55, label: 'Moderate — 3-5 sessions a week' },
  { value: 1.725, label: 'High — daily training' },
  { value: 1.9, label: 'Very high — double sessions / pre-season' },
];

export const GOALS = { maintain: 'Maintain weight', gain: 'Gain weight', lose: 'Lose weight' };
const KCAL_PER_KG = 7700; // approx. energy in 1 kg of body mass

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

/**
 * Daily targets from a nutrition profile.
 * profile: { weight, height, age, sex, activity, goal, rate (kg/week), protein_g_per_kg, fat_pct, kcal_override }
 */
export function nutritionTargets(p) {
  const bmr = mifflinStJeor(p);
  const missing = [];
  if (!p.weight) missing.push('bodyweight');
  if (!p.height) missing.push('height');
  if (p.age == null) missing.push('date of birth');
  if (!p.sex) missing.push('sex');
  if (bmr == null && !p.kcal_override) return { missing };

  const activity = Number(p.activity) || 1.55;
  const tdee = bmr != null ? bmr * activity : null;
  const rate = Math.abs(Number(p.rate) || 0);
  const adjust = p.goal === 'gain' ? (rate * KCAL_PER_KG) / 7 : p.goal === 'lose' ? -(rate * KCAL_PER_KG) / 7 : 0;
  const kcal = p.kcal_override ? Number(p.kcal_override) : tdee + adjust;

  const protein = p.weight ? (Number(p.protein_g_per_kg) || 2) * p.weight : null;
  const fat = (kcal * ((Number(p.fat_pct) || 25) / 100)) / 9;
  const carbs = protein != null ? Math.max(0, (kcal - protein * 4 - fat * 9) / 4) : null;
  const r = (n) => (n == null ? null : Math.round(n));
  return { bmr: r(bmr), tdee: r(tdee), adjust: r(adjust), kcal: r(kcal), protein: r(protein), fat: r(fat), carbs: r(carbs), overridden: !!p.kcal_override, missing };
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v !== '')) rows.push(row);
  return rows;
}

/**
 * Parse a MyFitnessPal "Nutrition Summary" export (one row per meal per day).
 * Returns [{ eaten_on, meal, kcal, protein, carbs, fat }].
 */
export function parseMfpCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The file looks empty');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(`${n} (`) || h.startsWith(n)));
  const iDate = col('date');
  const iMeal = col('meal');
  const iKcal = col('calories', 'energy');
  const iProt = col('protein');
  const iCarb = col('carbohydrates', 'carbs');
  const iFat = head.findIndex((h) => h === 'fat' || h.startsWith('fat (') || h === 'total fat' || h.startsWith('total fat'));
  if (iDate < 0 || iKcal < 0) throw new Error('Couldn’t find Date and Calories columns — use MyFitnessPal’s Nutrition Summary export');
  const n = (v) => {
    const x = parseFloat(String(v ?? '').replace(/,/g, ''));
    return Number.isNaN(x) ? 0 : x;
  };
  const out = [];
  for (const r of rows.slice(1)) {
    const date = normaliseDate(r[iDate]);
    if (!date) continue;
    out.push({
      eaten_on: date,
      meal: iMeal >= 0 ? (r[iMeal] || 'Day').trim() : 'Day',
      kcal: n(r[iKcal]),
      protein: iProt >= 0 ? n(r[iProt]) : 0,
      carbs: iCarb >= 0 ? n(r[iCarb]) : 0,
      fat: iFat >= 0 ? n(r[iFat]) : 0,
    });
  }
  if (!out.length) throw new Error('No rows with a valid date were found');
  return out;
}

function normaliseDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // MFP US export: MM/DD/YYYY
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

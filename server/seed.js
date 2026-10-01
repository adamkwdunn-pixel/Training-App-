// Fills an empty database with a demo coach, athletes, a program and a few logged sessions.
// Usage: npm run seed   (then sign in as coach@demo.app / password123)
import { openDb } from './db.js';
import { createApp } from './app.js';

const db = openDb();
if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  console.log('Database already has users — seed skipped. Delete data/ to start fresh.');
  process.exit(0);
}
const server = createApp(db).listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (method, url, token, body) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${url}: ${data.error}`);
  return data;
};

const coach = await call('POST', '/auth/register', null, { name: 'Demo Coach', email: 'coach@demo.app', password: 'password123', role: 'coach' });
const T = coach.token;
const athletes = [];
for (const [name, position, email] of [['Sam Taylor', 'Tighthead prop', 'sam@demo.app'], ['Jordan Lee', 'Openside flanker', 'jordan@demo.app'], ['Alex Rivera', 'Outside centre', 'alex@demo.app']]) {
  const a = await call('POST', '/auth/register', null, { name, email, password: 'password123', invite_code: coach.user.invite_code });
  await call('PATCH', '/me', a.token, { position });
  athletes.push(a);
}

const { exercises } = await call('GET', '/exercises', T);
let exercises2;
const ex = (n) => (exercises.find((e) => e.name === n) || exercises2.find((e) => e.name === n)).id;
const { rules } = await call('GET', '/rules', T);
const rule = (n) => rules.find((r) => r.name === n).id;

const { program } = await call('POST', '/programs', T, { name: 'Pre-season Block 1', description: 'Strength base + acceleration. 3 sessions per week.', weeks: 4, days_per_week: 3 });
const w1 = program.days.filter((d) => d.week === 1);
await call('PUT', `/days/${w1[0].id}`, T, {
  title: 'Lower strength + acceleration',
  notes: 'RAMP warm-up 10 min. Sprints fresh, full recovery.',
  prescriptions: [
    { exercise_id: ex('10 m Acceleration'), block: 'A', sets: 6, reps: '1', target: '10 m from 2-point', target_value: 1.85, rest_seconds: 90, progression: 'rule', rule_id: rule('Speed quality check') },
    { exercise_id: ex('Countermovement Jump'), block: 'B', sets: 3, reps: '3', load_type: 'none', rest_seconds: 90, progression: 'none' },
    { exercise_id: ex('Back Squat'), block: 'C1', sets: 4, reps: '5', load_type: 'rir', rir: 2, rest_seconds: 180 },
    { exercise_id: ex('Romanian Deadlift'), block: 'C2', sets: 3, reps: '8', load_type: 'rir', rir: 3, rest_seconds: 120 },
    { exercise_id: ex('Nordic Hamstring Curl'), block: 'D', sets: 3, reps: '5', load_type: 'bodyweight', progression: 'none' },
  ],
});
await call('PUT', `/days/${w1[1].id}`, T, {
  title: 'Upper strength',
  prescriptions: [
    { exercise_id: ex('Bench Press'), block: 'A1', sets: 4, reps: '5', load_type: 'percent', percent: 80, rir: 2, rest_seconds: 180 },
    { exercise_id: ex('Weighted Pull-up'), block: 'A2', sets: 4, reps: '6', load_type: 'rir', rir: 2, rest_seconds: 120 },
    { exercise_id: ex('Overhead Press'), block: 'B1', sets: 3, reps: '8', load_type: 'rpe', rpe: 7, rest_seconds: 120 },
    { exercise_id: ex('Bent-over Row'), block: 'B2', sets: 3, reps: '10', load_type: 'rir', rir: 2, rest_seconds: 90 },
  ],
});
await call('PUT', `/days/${w1[2].id}`, T, {
  title: 'Power + max velocity',
  prescriptions: [
    { exercise_id: ex('Flying 20 m'), block: 'A', sets: 4, reps: '1', target: '20 m build-up', target_value: 2.3, rest_seconds: 180 },
    { exercise_id: ex('Hang Power Clean'), block: 'B', sets: 5, reps: '3', load_type: 'percent', percent: 75, rest_seconds: 150, progression: 'rule', rule_id: rule('Percentage block — auto-update max') },
    { exercise_id: ex('Trap Bar Deadlift'), block: 'C', sets: 3, reps: '4', load_type: 'rir', rir: 2, rest_seconds: 180 },
    { exercise_id: ex('Copenhagen Plank'), block: 'D', sets: 3, reps: '1', target: '30 s / side', progression: 'none' },
  ],
});
for (const to of [2, 3, 4]) await call('POST', `/programs/${program.id}/copy-week`, T, { from: 1, to });

const maxes = [
  { 'Back Squat': 180, 'Bench Press': 140, 'Romanian Deadlift': 170, 'Weighted Pull-up': 130, 'Overhead Press': 85, 'Bent-over Row': 120, 'Hang Power Clean': 110, 'Trap Bar Deadlift': 230 },
  { 'Back Squat': 160, 'Bench Press': 120, 'Romanian Deadlift': 150, 'Weighted Pull-up': 120, 'Overhead Press': 75, 'Bent-over Row': 105, 'Hang Power Clean': 105, 'Trap Bar Deadlift': 210 },
  { 'Back Squat': 150, 'Bench Press': 105, 'Romanian Deadlift': 140, 'Weighted Pull-up': 110, 'Overhead Press': 70, 'Bent-over Row': 95, 'Hang Power Clean': 100, 'Trap Bar Deadlift': 190 },
];
for (let i = 0; i < athletes.length; i++) {
  const a = athletes[i];
  await call('POST', '/assignments', T, { program_id: program.id, athlete_ids: [a.user.id], rule_id: rule('RIR-guided double progression'), start_date: daysAgo(10) });
  for (const [name, max] of Object.entries(maxes[i])) await call('PUT', `/athletes/${a.user.id}/state/${ex(name)}`, T, { max });
}

// Sam has trained the first three sessions.
const sam = athletes[0];
for (let s = 0; s < 3; s++) {
  const plan = await call('GET', `/athletes/${sam.user.id}/plan`, sam.token);
  const asg = plan.assignments[0];
  const day = asg.next_day;
  const sets = [];
  for (const r of day.prescriptions) {
    for (let n = 1; n <= (r.sets || 1); n++) {
      if (r.metric === 'load') sets.push({ prescription_id: r.id, set_number: n, target_load: r.target_load, weight: r.target_load, reps: parseInt(r.reps, 10), rir: s === 1 ? 1 : 3 });
      else if (r.metric === 'time') sets.push({ prescription_id: r.id, set_number: n, time_seconds: Number(((r.target_value || 2) * (1.01 + Math.random() * 0.05)).toFixed(2)) });
      else if (r.metric === 'height') sets.push({ prescription_id: r.id, set_number: n, result: 48 + n });
      else sets.push({ prescription_id: r.id, set_number: n, reps: parseInt(r.reps, 10) || 1 });
    }
  }
  await call('POST', '/logs', sam.token, { assignment_id: asg.id, day_id: day.id, performed_on: daysAgo(8 - s * 3), session_rpe: 7 + s, sets, notes: s === 0 ? 'Squats felt fast today.' : '' });
}
await call('POST', '/comments', sam.token, { body: 'Hamstring a bit tight after Nordics — ok to keep going?' });
await call('POST', '/comments', T, { athlete_id: sam.user.id, body: 'Keep going but drop Nordics to 2 sets this week. Let me know Thursday how it feels.' });

// ---- Nutrition, recovery and testing demo data
exercises2 = (await call('GET', '/exercises', T)).exercises;
const profiles = [
  { sex: 'male', birth_date: '1999-04-12', height_cm: 186, weight: 121, goal: 'maintain', activity: 1.725 },
  { sex: 'male', birth_date: '2001-09-03', height_cm: 188, weight: 104, goal: 'gain', rate: 0.25, activity: 1.725 },
  { sex: 'male', birth_date: '2002-01-22', height_cm: 183, weight: 95, goal: 'lose', rate: 0.5, activity: 1.725 },
];
const foods = [
  ['Breakfast', 'Overnight oats with whey', '1 bowl', 620, 45, 80, 14],
  ['Breakfast', 'Eggs on toast', '4 eggs, 2 slices', 520, 32, 30, 28],
  ['Lunch', 'Chicken burrito bowl', 'large', 950, 62, 110, 24],
  ['Pre-training', 'Banana + rice cakes', '', 260, 4, 58, 2],
  ['Dinner', 'Salmon, rice and greens', '', 880, 55, 85, 32],
  ['Snacks', 'Greek yoghurt + berries', '300 g', 290, 28, 30, 6],
];
for (let i = 0; i < athletes.length; i++) {
  const a = athletes[i];
  await call('PUT', `/athletes/${a.user.id}/nutrition/profile`, a.token, profiles[i]);
  for (let d = 13; d >= 0; d--) {
    await call('POST', `/athletes/${a.user.id}/bodyweight`, a.token, { measured_on: daysAgo(d), weight: +(profiles[i].weight + (i === 2 ? d * 0.07 : i === 1 ? -d * 0.04 : (d % 3) * 0.2 - 0.2)).toFixed(1) });
    if (d > 0 || i === 0) {
      for (const [meal, name, quantity, kcal, protein, carbs, fat] of foods) {
        if (Math.random() < 0.15 && d > 0) continue;
        const scale = i === 0 ? 1.25 : i === 1 ? 1.1 : 0.85;
        await call('POST', `/athletes/${a.user.id}/food`, a.token, { eaten_on: daysAgo(d), meal, name, quantity, kcal: Math.round(kcal * scale), protein: Math.round(protein * scale), carbs: Math.round(carbs * scale), fat: Math.round(fat * scale) });
      }
    }
    const base = [4, 3, 4][i];
    const v = (o) => Math.max(1, Math.min(5, base + o + (d % 4 === 0 ? -1 : 0)));
    await call('POST', `/athletes/${a.user.id}/readiness`, a.token, {
      day: daysAgo(d), sleep_hours: [8, 6.5, 7.5][i] - (d % 4 === 0 ? 1 : 0), sleep_quality: v(0), energy: v(i === 1 && d === 0 ? -1 : 0), soreness: v(-1), stress: v(1), mood: v(0),
    });
  }
}
const jordan = athletes[1];
const inj = await call('POST', `/athletes/${jordan.user.id}/injuries`, jordan.token, { area: 'Hamstring', side: 'left', pain: 3, availability: 'modified', description: 'Felt a twinge on the last flying 20 m rep. Tight when bending over.', reported_on: daysAgo(1) });
await call('POST', '/comments', T, { athlete_id: jordan.user.id, target_type: 'injury', target_id: inj.id, body: 'Thanks for flagging. No sprinting this week — start the hamstring protocol and we’ll reassess Friday.' });
const { protocols } = await call('GET', '/protocols', T);
const proto = (n) => protocols.find((p) => p.name === n).id;
await call('POST', `/protocols/${proto('Daily mobility (10 min)')}/assign`, T, { athlete_ids: athletes.map((a) => a.user.id), frequency: 'Daily' });
await call('POST', `/protocols/${proto('Hamstring prehab')}/assign`, T, { athlete_ids: [jordan.user.id], frequency: '3× per week', note: 'Isometrics only until pain is 0/10' });
await call('POST', `/protocols/${proto('Groin / adductor prehab')}/assign`, T, { athlete_ids: [sam.user.id], frequency: '2× per week' });

const tests = [
  [['Back Squat', 175, 3], ['Bench Press', 135, 3], ['Deadlift', 220, 1], ['Power Clean', 110, 1], ['Overhead Press', 85, 3], ['Weighted Chin-up', 40, 3]],
  [['Back Squat', 160, 3], ['Bench Press', 115, 3], ['Deadlift', 200, 2], ['Power Clean', 105, 1], ['Overhead Press', 72.5, 3], ['Weighted Chin-up', 45, 3]],
  [['Back Squat', 145, 5], ['Bench Press', 100, 5], ['Deadlift', 185, 3], ['Power Clean', 97.5, 1], ['Overhead Press', 67.5, 5], ['Weighted Chin-up', 35, 5]],
];
for (let i = 0; i < athletes.length; i++) {
  const a = athletes[i];
  for (const [lift, weight, reps] of tests[i]) {
    const id = ex(lift);
    await call('POST', `/athletes/${a.user.id}/tests`, T, { exercise_id: id, weight: weight - 7.5, reps, tested_on: daysAgo(70), update_max: false });
    await call('POST', `/athletes/${a.user.id}/tests`, a.token, { exercise_id: id, weight, reps, tested_on: daysAgo(12), update_max: false });
  }
}

server.close();
console.log('Demo data ready. Coach: coach@demo.app / password123 · Athletes: sam@demo.app, jordan@demo.app, alex@demo.app (password123)');

function daysAgo(n) {
  return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
}

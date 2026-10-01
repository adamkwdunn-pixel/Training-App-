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
const ex = (n) => exercises.find((e) => e.name === n).id;
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

server.close();
console.log('Demo data ready. Coach: coach@demo.app / password123 · Athletes: sam@demo.app, jordan@demo.app, alex@demo.app (password123)');

function daysAgo(n) {
  return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
}

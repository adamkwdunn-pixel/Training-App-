# Squad Training

A coaching app for rugby and strength & conditioning, split into four sections: **Training, Nutrition, Recovery and Testing**. Coaches build programs, set their own progression rules, and see every athlete's training, intake, readiness, injuries and test results. Athletes use it on their phone; the coach can work from a phone or PC.

It's a **web app you can install** (a PWA). Open the site on a phone, then "Add to Home Screen", and it runs like a native app. On a PC, use it in any browser. It's one codebase with no app-store approval needed.

## What it does

The app is split into four sections, each with its own tab: **Training, Nutrition, Recovery, Testing**. The coach also has a **Squad** tab (inbox + athletes). Every athlete page has tabs for all four sections, so you can see one athlete's full picture in one place.

### Training
- **Programs:** weeks → sessions → exercises. Loads can be set as **% of max**, **RIR** (load worked out from the athlete's max using the RPE/RIR chart), **RPE**, **fixed kg**, **bodyweight** or **no load**. Speed, power and conditioning work uses numeric targets (e.g. 10 m in 1.85 s).
- **Progression rules you write yourself**, e.g. "if all reps done and RIR ≥ target + 2 → add 5 kg", "after 2 failed sessions → −10 %", "if e1RM beats max → update max", "if sprints are > 5 % off target → flag me". Attach a rule per athlete, and override it per exercise if needed.
- **Athletes:** see today's session with the loads already worked out, log sets with a rest timer, film a set from the session screen, and see what their program changed afterwards.
- **Form checks:** slow motion and frame stepping, with a feedback thread on every video and session.

### Nutrition
- **Food log** by meal, with a calorie ring and protein/carb/fat bars against the athlete's targets. Recent foods can be re-added in one tap.
- **Targets (Mifflin-St Jeor):** resting energy = 10·kg + 6.25·cm − 5·age + 5 (male) / −161 (female). This is multiplied by an activity level to get maintenance, then adjusted for the athlete's goal: **lose / maintain / gain** at a chosen kg per week (7,700 kcal per kg). Protein is set in g/kg, fat as a % of calories, and carbs fill the rest. The coach can pin a calorie target that overrides the calculation.
- **Bodyweight** log with a trend chart.
- **MyFitnessPal:** MFP doesn't offer a public connection for other apps, so athletes upload MFP's **Nutrition Summary CSV export** instead (Reports → Export data on myfitnesspal.com, Premium only). Re-importing the same days replaces them rather than double counting.
- **Coach view:** a squad table of each athlete's target vs 7-day average intake, protein, days logged and 28-day weight change.

### Recovery
- **Daily readiness check-in:** hours of sleep, plus sleep quality, energy, soreness, stress and mood on a 1-5 scale. These make a 0-100 score, and less than 7 h of sleep takes points off. Low scores appear in the coach's inbox.
- **Injury reports:** body area, side, pain 0-10, and whether the athlete can train (full / modified / unavailable). Each report has its own message thread with the coach. The coach moves it through New → Monitoring → Rehab → Resolved.
- **Protocols:** stretching, mobility, prehab, rehab and recovery routines, each a list of exercises with dose, cues and an optional demo link. Six starter protocols are included. The coach assigns protocols to athletes with a frequency, and athletes tick them off each day.

### Testing
- Rep maxes for the main lifts: **Back Squat, Bench Press, Deadlift, Power Clean, Overhead Press, Weighted Chin-up**. Any other lift can be tested too.
- Each test records weight × reps with an estimated 1RM, relative strength (× bodyweight), and an optional **video of the lift**. The coach can verify a test, and the full history is kept.
- A tested max can be used straight away as the max that % and RIR training loads are calculated from.
- **Coach view:** a squad testing board showing every athlete's best on each lift, in kg or × bodyweight.

## Run it locally

Requires **Node.js 22.5+** (uses Node's built-in SQLite, so there's no database server to install).

```bash
npm install
npm run build
npm run seed     # optional: demo coach, 3 athletes, a 4-week program, some logged sessions
npm start        # http://localhost:3000
```

Demo logins (after `npm run seed`): coach `coach@demo.app`, athletes `sam@demo.app`, `jordan@demo.app`, `alex@demo.app`. Password for all: `password123`.

To develop with hot reload, run `npm run dev` (the web app is on http://localhost:5173 and proxies to the API). Run the tests with `npm test`.

## Getting athletes on

1. The first account created with **Coach** becomes the head coach. Later coach sign-ups need `COACH_SIGNUP_KEY` (see below).
2. Your **team code** is shown on the Athletes page. Athletes choose **Join team** and enter it. You can also add athletes yourself with a temporary password.

## Hosting it so phones can reach it

Any host that runs Node or Docker and gives you a **persistent disk** works, for example Render, Railway, Fly.io, or a small VPS. The disk is needed because the database and videos live in `DATA_DIR`.

- **Docker:** `docker build -t squad-training . && docker run -p 3000:3000 -v squad-data:/data squad-training`
- **Render / Railway (no Docker):** build command `npm install && npm run build`, start command `npm start`. Mount a persistent disk and set `DATA_DIR` to its path.
- Use **HTTPS**, which these hosts provide automatically. It's required for "Add to Home Screen" and phone camera uploads.

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | SQLite database + uploaded videos |
| `MAX_UPLOAD_MB` | `300` | Max video size |
| `COACH_SIGNUP_KEY` | *(unset)* | Lets extra coaches register; without it only the first coach can |

Back up `DATA_DIR` regularly. If you expect a lot of video, the next step would be moving uploads to object storage (S3 / Cloudflare R2).

## How the code is laid out

```
server/
  app.js              API routes (auth, athletes, programs, rules, logs, videos, comments)
  db.js               SQLite schema
  lib/loads.js        % / RIR / RPE load maths, e1RM, rounding
  lib/progression.js  rule engine: session metrics → conditions → actions, plus presets
  lib/nutrition.js    Mifflin-St Jeor targets, MyFitnessPal CSV parser
  lib/recovery.js     readiness score
  routes/             nutrition, recovery (readiness, injuries, protocols), testing APIs
  seed.js             demo data
client/src/
  pages/              coach + athlete screens
  components/         layout, chart, feedback thread, video uploader, maxes table
test/                 unit tests for load maths & rules, end-to-end API test
```

### Rule metrics and actions

Metrics: `all_reps_completed`, `reps_missed`, `sets_completed`, `avg_rir`, `min_rir`, `last_set_rir`, `rir_vs_target`, `top_set_weight`, `e1rm`, `e1rm_vs_max_pct`, `success_streak`, `fail_streak`, `best_time`, `time_vs_target_pct`, `best_result`, `session_count`.

Actions: hold, change working load (kg or %), change max (kg or %), set max from e1RM, reset load adjustment, reset streaks, flag for coach review.

"Working load" changes are stored as a per-athlete, per-exercise adjustment added on top of the calculated load. "Max" changes move the number that % and RIR loads are calculated from.

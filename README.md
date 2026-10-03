# AD Rugby Coaching

A coaching app for rugby and strength & conditioning, split into four sections: **Training, Nutrition, Recovery and Testing**. Coaches build programs, set their own progression rules, and see every athlete's training, intake, readiness, injuries and test results. Athletes use it on their phone; the coach can work from a phone or PC.

It's a **web app you can install** (a PWA). Open the site on a phone, then "Add to Home Screen", and it runs like a native app. On a PC, use it in any browser. It's one codebase with no app-store approval needed.

## What it does

The app is split into four sections, each with its own tab: **Training, Nutrition, Recovery, Testing**. For the coach, Training also holds the inbox and athlete list. Every athlete page has tabs for all four sections, so you can see one athlete's full picture in one place.

### Coach tools
- **Program builder:**
  - Add or remove weeks with a **− / +** stepper.
  - **Duplicate** a week (the copy is inserted right after it) or remove it.
  - Copy a week over another, and duplicate individual sessions.
  - Pick the program's **progression model** from a dropdown (double progression, linear, RIR-guided, % block…). Override it per athlete or per exercise from the same list.
- **Never lose work:** unsaved session edits are kept on the device. You can create a new exercise without leaving the session.
- **Sign athletes up:** the app generates a temporary password and emails the athlete their login details. They set their own password on first sign-in. You can resend or reset login details at any time.
- **Athletes (Coach → Athletes):** each athlete's page opens with a snapshot: bodyweight trend, body fat, 7-day readiness, sleep debt, sessions this week, program and injuries. Tabs cover details, program, log, form checks, progress, nutrition, recovery, testing and messages. **Details** lets you edit name, login email, position, sex, date of birth, height, bodyweight, load rounding and private notes.
- **Train yourself:** add yourself as an athlete in your own squad and switch between coach and athlete views without signing out.

### Coach tab (coach accounts only)
The Coach tab is where you **create and edit programs**, and manage your progression rules, exercise library, and recovery protocols. Anyone else who opens it sees a **For coaches only** page, and the server refuses those requests from athlete accounts. If you add another coach (see `COACH_SIGNUP_KEY`), each coach only sees their own programs and athletes.

### Training
- **Programs:** weeks → sessions → exercises. Loads can be set as **% of max**, **RIR** (load worked out from the athlete's max using the RPE/RIR chart), **RPE**, **fixed kg**, **bodyweight** or **no load**. Speed, power and conditioning work uses numeric targets (e.g. 10 m in 1.85 s).
- **Progression rules you write yourself**, e.g. "if all reps done and RIR ≥ target + 2 → add 5 kg", "after 2 failed sessions → −10 %", "if e1RM beats max → update max", "if sprints are > 5 % off target → flag me". Attach a rule per athlete, and override it per exercise if needed.
- **Athletes:** see today's session with the loads already worked out, log sets with a rest timer, film a set from the session screen, and see what their program changed afterwards.
- **Form checks:** slow motion and frame stepping, with a feedback thread on every video and session.

### Nutrition
Athletes enter their own details, and the app works everything out and shows the working.
- **Targets:** each step of the calculation is shown with the athlete's own numbers:
  1. **Resting energy**, from one of two equations (the athlete chooses):
     - **Mifflin-St Jeor:** 10·kg + 6.25·cm − 5·age + 5 (male) / −161 (female)
     - **Katch-McArdle:** 370 + 21.6·lean mass. It uses the latest body fat measurement, so it suits heavily muscled athletes better.
  2. × an **activity factor** → maintenance calories.
  3. ± the **goal**: lose, maintain or gain, at a chosen rate (kg/week × 7,700 kcal ÷ 7).
  4. **Macros**, adjustable with sliders: either protein and fat in **g per kg** or as **% of calories**. Carbohydrate fills whatever calories are left.
  - Everything recalculates live as the athlete moves the sliders. The coach can pin a calorie target that overrides the calculation.
- **Bodyweight:**
  - Weigh-ins with a chart showing each weigh-in as a dot and the **7-day average** as a line.
  - The 4-week rate of change in kg/week is compared with the goal, and marked on track or off target.
  - A week-by-week table of averages and changes, with 4-week / 12-week / 6-month / all views.
- **Body fat**, with a built-in explanation of each method and where to measure:
  - **Calipers — Jackson-Pollock 3-site or 7-site:** the sum of skinfolds gives body density, which the Siri equation (495 ÷ density − 450) turns into body fat %. The sum of skinfolds in mm is also tracked, since many S&C staff prefer it.
  - **US Navy tape method** (Hodgdon & Beckett): uses neck, waist, height, and hips for women.
  - **Other:** record a result from DEXA, InBody, Bod Pod etc.
  - Each measurement shows fat and lean mass, with trends charted for one method at a time. The coach can enter measurements for athletes (e.g. skinfolds on testing day).
- **Coach view:** a squad table of each athlete's goal, targets, 7-day average bodyweight, 4-week rate vs goal, body fat and lean mass.

- **Food log with AI estimates:** athletes describe what they ate in plain words. Claude (Anthropic's model `claude-opus-5-5`, via the official SDK with structured outputs) breaks it into foods with estimated calories, protein, carbs and fat, and lists any portion sizes it had to assume. The athlete checks or adjusts the numbers and saves them. The day is totalled against their targets with a calorie ring and macro bars, and the coach sees each athlete's food log plus 7-day average intake on the squad nutrition table. Needs `ANTHROPIC_API_KEY`; without it, athletes enter the numbers manually.
- **In-session RIR adjustments:** when an athlete logs a set harder or easier than the prescribed RIR/RPE, the weight for their remaining sets updates straight away, with the reason shown. The size of the change comes from the RPE/RIR %1RM chart, with a ±1 RIR tolerance, cautious increases and a per-set cap. It runs alongside the long-term progression rules, which only count a session as complete if the reps were done at the prescribed weight. See [docs/IN-SESSION-ADJUSTMENTS.md](docs/IN-SESSION-ADJUSTMENTS.md).
- **Plain-English progression rules:** on Coach → Progression rules, describe a rule in your own words ("add 2.5 kg when they hit every rep; deload 10% after two failed sessions") or describe a change to an existing rule. Claude turns it into the app's rule format, which is shown back as numbered plain-English steps for you to check before saving. Every rule is also listed in plain English with where it's in use, and the detailed editor is still there for fine-tuning. Saved changes apply from the next session anyone logs. Uses `ANTHROPIC_API_KEY`.
- **Program import:** on Coach → Programs, drop a PDF or photos/screenshots of a written program (up to 10 files). Claude reads it into weeks, sessions and exercises: sets, reps, %, RIR, RPE, kg, rest, tempo, supersets and repeated weeks. Exercises are matched to the coach's library, and new ones are flagged. The coach checks the preview and anything flagged as unclear, then creates the program and edits it in the builder. Uses the same `ANTHROPIC_API_KEY`.

### Recovery
- **Daily readiness check-in:** hours of sleep, plus sleep quality, energy, soreness, stress and mood on a 1-5 scale. These make a 0-100 score, and less than 7 h of sleep takes points off. Low scores appear in the coach's inbox.
- **Injury reports:** body area, side, pain 0-10, and whether the athlete can train (full / modified / unavailable). Each report has its own message thread with the coach. The coach moves it through New → Monitoring → Rehab → Resolved.
- **Protocols:** stretching, mobility, prehab, rehab and recovery routines, each a list of exercises with dose, cues and an optional demo link. Six starter protocols are included. The coach assigns protocols to athletes with a frequency, and athletes tick them off each day.

### Notifications
- A **🔔 inbox** in the app, plus **push notifications** to phones and computers (Web Push). Push works on Android, desktop browsers, and iPhone (iOS 16.4+, once the app is added to the home screen).
- **Coach is notified when an athlete:** completes a session, sends a form check or max-lift video, sends a message or reply, checks in (⚠️ for low readiness), reports or updates an injury, logs a test, logs bodyweight or body fat, joins the squad, or trips a progression-rule flag.
- **Athletes are notified about:** their session summary (including any program changes), coach comments on form checks, sessions and injuries, messages, new programs and protocols, tests recorded or verified by the coach, and a **daily check-in reminder** at a local time they choose (skipped if they've already checked in).
- Each person picks which types they want under **🔔 → settings**. Tapping a notification opens the exact screen it refers to.
- Push keys (VAPID) are generated automatically on first start and stored in the database. Set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` to use your own.

### Updates
When a new version is deployed, anyone with the app open sees a **"New version available"** banner. One tap reloads it. Nothing needs reinstalling.

### Testing
- Rep maxes for the main lifts: **Back Squat, Bench Press, Deadlift, Power Clean, Overhead Press, Weighted Chin-up**. Any other lift can be tested too.
- Each test records weight × reps with an estimated 1RM, relative strength (× bodyweight), and an optional **video of the lift**. The coach can verify a test, and the full history is kept.
- A tested max can be used straight away as the max that % and RIR training loads are calculated from.
- **Coach view:** a squad testing board showing every athlete's best on each lift, in kg or × bodyweight.

**New here? Read [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md)**. It walks through trying the app, hosting it online, and the path to the App Store and Google Play.

## Run it locally

Requires **Node.js 22.5+** (uses Node's built-in SQLite, so there's no database server to install).

```bash
npm install
npm run build
npm run seed     # optional: demo coach, 3 athletes, a 4-week program, some logged sessions
npm start        # http://localhost:3000
```

Demo logins (after `npm run seed`): coach **Adam** `coach@demo.app`, athletes `sam@demo.app`, `jordan@demo.app`, `alex@demo.app`. Password for all: `password123`.

To develop with hot reload, run `npm run dev` (the web app is on http://localhost:5173 and proxies to the API). Run the tests with `npm test`.

## Getting athletes on

1. The first account created with **Coach** becomes the head coach. Later coach sign-ups need `COACH_SIGNUP_KEY` (see below).
2. Your **team code** is shown on the Athletes page. Athletes choose **Join team** and enter it. You can also add athletes yourself with a temporary password.

## Hosting it so phones can reach it

Any host that runs Node or Docker and gives you a **persistent disk** works, for example Render, Railway, Fly.io, or a small VPS. The disk is needed because the database and videos live in `DATA_DIR`.

- **Docker:** `docker build -t squad-training . && docker run -p 3000:3000 -v squad-data:/data squad-training`
- **Render (recommended):** the included `render.yaml` sets everything up. See the getting-started guide.
- **Railway / others (no Docker):** build command `npm install && npm run build`, start command `npm start`. Mount a persistent disk and set `DATA_DIR` to its path.
- Use **HTTPS**, which these hosts provide automatically. It's required for "Add to Home Screen" and phone camera uploads.

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | SQLite database + uploaded videos |
| `MAX_UPLOAD_MB` | `300` | Max video size |
| `COACH_SIGNUP_KEY` | *(unset)* | Lets extra coaches register; without it only the first coach can |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` (or `SMTP_URL`) | *(unset)* | Sends athletes their login details by email. Without it, the coach copies/shares them instead |
| `ANTHROPIC_API_KEY` | *(unset)* | Turns on AI food estimates in the food log |
| `AI_ESTIMATES_PER_DAY` | `40` | Daily cap on AI estimates per athlete |
| `RULE_AI_PER_DAY` | `50` | Daily cap on plain-English rule writing per coach |
| `PROGRAM_IMPORTS_PER_DAY` | `20` | Daily cap on program imports (PDF/photo) per coach |
| `APP_URL` | *(this site's address)* | The link put in emails, if it should differ from the address the coach is using |
| `SEED_DEMO` | *(unset)* | `true` loads the demo squad the first time the server starts on an empty database |
| `DEMO_COACH_NAME` / `DEMO_COACH_EMAIL` / `DEMO_COACH_PASSWORD` | `Adam` / `coach@demo.app` / `password123` | The coach account the demo creates |

Back up `DATA_DIR` regularly. If you expect a lot of video, the next step would be moving uploads to object storage (S3 / Cloudflare R2).

## How the code is laid out

```
server/
  app.js              API routes (auth, athletes, programs, rules, logs, videos, comments)
  db.js               SQLite schema
  lib/loads.js        % / RIR / RPE load maths, e1RM, rounding
  lib/progression.js  rule engine: session metrics → conditions → actions, plus presets
  lib/recovery.js     readiness score
  routes/             nutrition (targets, bodyweight, body fat), recovery, testing APIs
shared/
  nutrition.js        energy equations, macros, bodyweight trend — used by server and app
  bodyfat.js          US Navy, Jackson-Pollock 3/7-site, Siri
server/notify.js      notification inbox, Web Push, daily check-in reminders
server/mail.js        login-details emails (SMTP)
server/lib/food-ai.js AI meal estimates (Claude, structured outputs)
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

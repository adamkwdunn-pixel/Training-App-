# Squad Training

A coaching app for rugby and strength & conditioning. Coaches build programs and set their own progression rules. Athletes follow their sessions on their phone, log sets, and send form-check videos. The coach reviews and gives feedback from a phone or PC.

It's a **web app you can install** (a PWA). Open the site on a phone, then "Add to Home Screen", and it runs like a native app. On a PC, use it in any browser. It's one codebase with no app-store approval needed.

## What it does

**For the coach**
- **Programs:** weeks → sessions → exercises. Each exercise is prescribed as sets × reps with a load type:
  - **% of max** (optionally with a target RIR)
  - **RIR (reps in reserve)**: the load is worked out from the athlete's max using the RPE/RIR chart (e.g. 5 reps @ 2 RIR ≈ 81% of max)
  - **RPE**, **fixed kg**, **bodyweight**, or **no load** (speed/conditioning)
  - Blocks (A1/A2…), tempo, rest, targets such as "30 m from 3-point" with a numeric target (e.g. 4.10 s), and coaching notes
- Copy a session or a whole week, or duplicate a program to make an athlete-specific version.
- **Progression rules you write yourself:** "if *all reps completed* = 1 and *RIR vs target* ≥ 2 → *add 5 kg*", "if *fail streak* ≥ 2 → *−10 %*", "if *e1RM vs max* ≥ 2 % → *update max*", "if *sprint time vs target* > 5 % → *flag me*". Clauses are checked top to bottom and the first match wins. A rule can be attached per athlete (on their program) or overridden per exercise. Four editable presets are included.
- **Inbox:** new sessions logged, videos waiting for review, rule flags, and athlete messages.
- **Per-athlete view:** maxes and load adjustments (editable), a history of what the rules changed and why, the program, the training log, videos, progress charts, private notes, and load rounding (e.g. 2.5 kg).
- **Video review:** slow motion (0.25×/0.5×), frame stepping, and a feedback thread per video.
- Exercise library (23 rugby/S&C starter exercises) with cues and demo links.

**For the athlete**
- **Today:** the next session with the loads already calculated for them.
- **Session logging:** weight / reps / RIR per set, times for sprints, heights/distances for jumps, a rest timer, "last time" numbers, and the option to film a set from the session screen. Drafts are saved on the phone if the app is closed mid-session.
- After a session they see what their program changed ("Back Squat: +2.5 kg").
- Form-check uploads, a feedback thread per session/video, and a general chat with the coach.
- Progress charts (e1RM, top set, volume, best times / jump heights) and their own maxes.

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

# Getting started

This guide covers:

1. Trying the app on your own computer (optional)
2. Putting it online so you and your athletes can use it on phones
3. First steps once it's live
4. Getting it into the Apple App Store and Google Play later on

---

## 1. Try it on your computer (optional, ~10 minutes)

You can skip this and go straight to step 2. Hosting is the easiest way to try it on your phone.

1. Install **Node.js 22 (LTS)** from https://nodejs.org.
2. Download the code. On the GitHub repo page, click **Code → Download ZIP** and unzip it. If you use git, run `git clone` instead.
3. Open a terminal in that folder: Terminal on Mac, PowerShell on Windows. Then run:
   ```bash
   npm install
   npm run build
   npm run seed
   npm start
   ```
4. Open **http://localhost:3000** and sign in:
   - **Coach (Adam):** `coach@demo.app` / `password123`
   - **Athletes:** `sam@demo.app`, `jordan@demo.app` or `alex@demo.app` (all with password `password123`)
5. **Try it on your phone on the same Wi-Fi.** First find your computer’s local IP address:
   - Mac: System Settings → Wi-Fi → Details
   - Windows: run `ipconfig`

   Then open `http://<that-ip>:3000` on your phone. Video uploads from the camera need the hosted (https) version.

To start over with fresh demo data, stop the app (Ctrl+C), delete the `data` folder, and run `npm run seed` again.

---

## 2. Put it online (~15 minutes, about US$7–8 a month)

This uses **Render**, which runs the app and gives it a secure `https://` address. The repo already contains a `render.yaml` file that tells Render exactly how to set it up.

1. Create an account at **https://render.com**. Sign up with GitHub; it's the simplest option.
2. In Render, click **New → Blueprint**. Connect your GitHub account if asked, then choose the **Training-App-** repository and the branch with the code.
3. Render reads `render.yaml` and shows one web service called **squad-training**, with a 5 GB disk. It asks for a value for **DEMO_COACH_PASSWORD**. Type the password you want for `coach@demo.app` (at least 8 characters).
4. Click **Apply**. The first build takes a few minutes.
5. When it says **Live**, open the address Render gives you, e.g. `https://squad-training.onrender.com`. Sign in as `coach@demo.app` with the password you chose.

What you're paying for:

| Item | Cost |
| --- | --- |
| Starter web service | ~US$7 / month (the free tier can't keep files, so your data would be wiped) |
| 5 GB disk for the database and videos | ~US$1.25 / month, and can be increased later |

**Optional:** to use your own web address (e.g. `app.yourclub.com`), buy a domain (~US$10–20 a year), then add it in Render under **Settings → Custom Domains**. Render handles the https certificate for you.

**Updates:** whenever new code is pushed to the branch Render is watching, Render rebuilds and redeploys automatically. Your data stays on the disk.

**Backups:** in Render, open the service, go to **Disks**, and use **Snapshots**. Render keeps daily snapshots, and you can restore one from there.

---

## 3. First steps once it's live

1. **Look around with the demo squad.** Sam, Jordan and Alex come with a program, logged sessions, bodyweight, body fat, readiness, an injury and test results. Their passwords are `password123`. Sign in as one of them on your phone to see the athlete side.
2. **Install it on your phone.** It works like an app:
   - **iPhone:** open the site in **Safari** → Share → **Add to Home Screen**.
   - **Android:** open it in **Chrome** → ⋮ menu → **Install app** / **Add to Home screen**.
3. **When you're ready for real athletes:**
   - In **Training → Athletes**, open each demo athlete → **Settings → Remove from squad**.
   - Build your programs in the **Coach** tab.
   - Share your **team code** (shown on the Athletes page). Athletes open the site, choose **Join team**, and enter the code.
4. **Profile → Change password** at any time.

---

## 4. Apple App Store and Google Play (later)

The app is already an installable web app (step 3.2). That's often enough for a squad, and there are no store fees or reviews. If you want it in the stores, here's the plan.

**How:** the existing app gets wrapped in a native shell with **Capacitor**, so it's one codebase for iPhone, Android and web. The hosted server from step 2 stays as the back end that the store apps talk to.

| | Apple App Store | Google Play |
| --- | --- | --- |
| Developer account | Apple Developer Program, **US$99 / year** | Google Play Console, **US$25 one-off** |
| To build | A **Mac with Xcode**, or a cloud build service such as Codemagic | Any computer with Android Studio |
| Before public launch | App Review, usually 1–3 days | New *personal* accounts must run a **closed test with at least 12 testers for 14 days** before going public. *Organisation* accounts (which need a free D-U-N-S number for your business or club) skip this. |

Things the stores require that we'd add when you're ready:

- **A privacy policy page.** You collect health data (bodyweight, body fat, injuries, readiness), so both stores ask how it's used and stored.
- **In-app account deletion.** Apple requires this for any app that lets people create accounts.
- **Native features.** Apple rejects apps that are "just a website", so the store version would use the phone camera directly for form-check videos and **push notifications** (e.g. "Adam replied to your squat video", or a morning readiness reminder).
- **Store listing:** app name, icon, screenshots and a description.

Suggested order:

1. Host it (step 2) and use it with your squad as a web app.
2. Gather feedback and fix what's missing.
3. Register the developer accounts.
4. Add the store requirements listed above and wrap the app with Capacitor.
5. Submit.

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
   - In **Coach → Athletes**, open each demo athlete → **Settings → Remove from squad**.
   - Build your programs in the **Coach** tab.
   - Add athletes one of two ways:
     - **You sign them up** (Athletes → Add): they get an email with their login details. See "Emailing login details" below.
     - **They join themselves:** share your **team code** (shown on the Athletes page). They open the site, choose **Join team**, and enter it.
   - **Train on your own program:** on the Athletes page, tap **Add myself**. You can then switch between coach and athlete views from the Athletes page or your Profile, without signing out.
4. **Profile → Change password** at any time.
5. **Turn on notifications** on each phone or computer: tap the 🔔 bell → settings icon → **Turn on notifications**.
   - **iPhone:** add the app to the home screen first (step 2), open it from there, then turn notifications on. This is an Apple rule (iOS 16.4 or later).
   - You can choose which alerts you get. As the coach you can be told about completed sessions, form checks, messages, check-ins, injuries, tests, bodyweight/body fat entries and rule flags. Athletes get session summaries, coach feedback, new programs or protocols, and a daily check-in reminder at a time they choose.

---

## Emailing login details to athletes

When you add an athlete (**Coach → Athletes → Add**), the app creates a temporary password and emails it to them, with a link to the app. They choose their own password the first time they sign in. If you need to send new details later (for example, they forgot their password), use the athlete's **Settings → Send new login details** button.

The app needs an email account to send from. Until you set one up, it shows you the login details with **Copy** and **Share** buttons instead, so you can text or WhatsApp them.

**Easiest setup: a Gmail account** (your own or a dedicated one, e.g. `adrugbycoaching@gmail.com`)

1. Turn on **2-Step Verification** for that Google account.
2. Go to **myaccount.google.com/apppasswords** and create an app password called "AD Rugby app". Copy the 16-character password it shows.
3. In Render, open the service → **Environment** → **Add environment variable**, and add:

   | Key | Value |
   | --- | --- |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `465` |
   | `SMTP_USER` | your Gmail address |
   | `SMTP_PASS` | the 16-character app password |
   | `MAIL_FROM` | `AD Rugby Coaching <your Gmail address>` |

4. Save. Render restarts the app, and new athletes will get an email.

Any other email provider that gives you SMTP details works the same way (Outlook/Microsoft 365, Zoho, Brevo, Resend, SendGrid…). If you set up your own web address later, a provider like Resend or Brevo lets the emails come from that domain.

---

## Turning on AI food estimates

In **Nutrition → Food log**, athletes describe a meal in their own words (e.g. *"a chicken sandwich with about 100 g chicken breast, some mayonnaise and lettuce"*). The app uses Claude, Anthropic's AI, to estimate calories, protein, carbs and fat for each part of the meal. Athletes check the estimate, adjust it if they know better, and save it. Their day is then totalled against their targets.

It needs an Anthropic API key, which is a pay-as-you-go account separate from any Claude subscription:

1. Go to **console.anthropic.com**, sign up, and add a payment method under **Billing**.
2. **Recommended:** under **Billing → Limits**, set a monthly spend limit (e.g. US$20), so costs can never run away.
3. Go to **API keys → Create key**, name it "AD Rugby app", and copy the key. It starts with `sk-ant-`.
4. In Render, open the service → **Environment** → **Add environment variable**:
   - Key: `ANTHROPIC_API_KEY`
   - Value: the key you copied
5. **Save, rebuild, and deploy.** In the app, **Profile → Server status** should then show "AI food estimates: On".

**Cost:** roughly 1–2 US cents per estimate. A squad of 30 logging three meals a day is about US$1–2 a day. Each athlete is capped at 40 estimates a day by default; you can change that with an `AI_ESTIMATES_PER_DAY` variable.

### Writing progression rules in plain English

The same key turns on plain-English rules in **Coach → Progression rules**.

- **To make a rule:** tap **New rule**, describe it in your own words, then tap **Write rule**.
- **To change a rule:** tap it, type what you want to change (e.g. "make the deload 15%"), then tap **Update rule**.

The rule is shown back as numbered steps for you to check, with a note on anything that had to be interpreted. It isn't live until you tap **Save rule**. From then on it applies to the next session any athlete on it logs. Each request costs well under a cent.

### Importing a program from a PDF or photo

The same key turns on **Coach → Programs → Import a program**.

1. Drag a PDF onto the dashed box, or tap it to choose files. Photos and screenshots of a written program also work (JPG/PNG, up to 10 files at once). For an iPhone HEIC photo, take a screenshot of it first.
2. Tap **Read this file**. This takes a minute or two.
3. Check the preview:
   - Weeks, sessions and exercises with sets × reps and loads.
   - A "Worth checking" list of anything the AI couldn't read clearly.
   - Exercises it will add to your library.
4. Tap **Create program**. Everything can still be edited in the program builder afterwards.

Clear, typed programs work best. Very long programs may need importing a block at a time. **Cost:** roughly US$0.10–0.35 per import, depending on the number of pages. Each coach is capped at 20 imports a day (`PROGRAM_IMPORTS_PER_DAY`).

Without a key, the food log still works: athletes type the calories and macros themselves.

---

## Making changes and updates

- **Things you change inside the app** (programs, rules, maxes, protocols…) are live immediately.
- **Code changes** come in as a **pull request** into the `main` branch on GitHub. Render deploys `main`, so an update goes live when you click **Merge** on the pull request, and not before. The deploy takes a few minutes, with about a minute of downtime, so merge at a quiet time.
- **Athletes don't need to do anything.** If someone has the app open while an update goes live, a **"New version available — Update"** banner appears at the top. Tapping it loads the new version, and closing and reopening the app does the same.
- **One-time setup:** make sure Render is watching `main`. In Render, open the service → **Settings → Build & Deploy → Branch** → choose `main`. In GitHub, go to the repo **Settings → General → Default branch** and set it to `main`.

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

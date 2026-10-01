// Outgoing email (login details for new athletes). Configure with SMTP settings:
//   SMTP_URL=smtps://user:pass@smtp.example.com:465     or
//   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS (+ SMTP_SECURE=true for port 465)
//   MAIL_FROM="AD Rugby Coaching <coach@yourdomain.com>"
import nodemailer from 'nodemailer';

export function createMailer(env = process.env) {
  let transport = null;
  if (env.SMTP_URL) transport = nodemailer.createTransport(env.SMTP_URL);
  else if (env.SMTP_HOST) {
    const port = Number(env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  const from = env.MAIL_FROM || env.SMTP_USER;
  return {
    configured: !!transport && !!from,
    async send({ to, subject, text, html, replyTo }) {
      if (!transport || !from) throw new Error('Email isn’t set up on the server yet');
      await transport.sendMail({ from, to, subject, text, html, replyTo });
    },
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The welcome / login-details email an athlete receives when the coach signs them up. */
export function loginEmail({ athleteName, coachName, url, email, password, reset = false }) {
  const first = String(athleteName).split(' ')[0];
  const intro = reset
    ? `${coachName} has reset your AD Rugby Coaching password.`
    : `${coachName} has set you up on AD Rugby Coaching — your training, nutrition, recovery and testing all in one app.`;
  const text = `Hi ${first},

${intro}

Open the app: ${url}
Email: ${email}
Temporary password: ${password}

You'll be asked to choose your own password when you first sign in.

Tip: add it to your home screen so it works like an app —
iPhone: open the link in Safari → Share → Add to Home Screen.
Android: open the link in Chrome → ⋮ → Install app.

See you at training,
${coachName}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#000;color:#fff;padding:32px 20px">
  <div style="max-width:480px;margin:0 auto">
    <img src="${esc(url)}/logo.png" alt="AD Rugby Coaching" width="200" style="display:block;margin:0 auto 24px">
    <p style="font-size:16px">Hi ${esc(first)},</p>
    <p style="font-size:16px;line-height:1.5">${esc(intro)}</p>
    <div style="border:1px solid #fff;border-radius:16px;padding:16px 18px;margin:20px 0;font-size:15px;line-height:1.8">
      <div><span style="color:#a3a3a3">Email</span><br><strong>${esc(email)}</strong></div>
      <div style="margin-top:8px"><span style="color:#a3a3a3">Temporary password</span><br><strong style="font-family:Menlo,monospace;font-size:18px;letter-spacing:1px">${esc(password)}</strong></div>
    </div>
    <p style="text-align:center;margin:24px 0"><a href="${esc(url)}" style="background:#fff;color:#000;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;display:inline-block">Open the app</a></p>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.5">You’ll be asked to choose your own password when you first sign in.<br><br>
    Add it to your home screen so it works like an app — iPhone: Safari → Share → Add to Home Screen. Android: Chrome → ⋮ → Install app.</p>
    <p style="font-size:15px">See you at training,<br>${esc(coachName)}</p>
  </div></div>`;
  return { subject: reset ? 'Your new AD Rugby Coaching password' : 'Your AD Rugby Coaching login', text, html };
}

/** Easy-to-type temporary password, e.g. "maul-7kq3-ruck". */
export function tempPassword(randomBytes) {
  const words = ['ruck', 'maul', 'scrum', 'lineout', 'tackle', 'sprint', 'squat', 'clean', 'press', 'drive', 'try', 'pass'];
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const b = randomBytes(6);
  const mid = [...b.subarray(2, 6)].map((x) => chars[x % chars.length]).join('');
  return `${words[b[0] % words.length]}-${mid}-${words[b[1] % words.length]}`;
}

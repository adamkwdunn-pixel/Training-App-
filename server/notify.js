// Notifications: an in-app inbox for every user, plus Web Push to their phones / computers.
import webpush from 'web-push';

// Every notification type, who receives it, and how it's described in settings.
export const TYPES = {
  coach: {
    session: 'Athlete completes a session',
    form_check: 'New form-check video',
    message: 'Messages and replies from athletes',
    checkin: 'Daily readiness check-ins',
    injury: 'Injury reports and updates',
    test: 'Testing results',
    data: 'Bodyweight and body fat entries',
    flag: 'Progression rule flags',
    join: 'Athlete joins the squad',
  },
  athlete: {
    session: 'Session completed summary',
    reminder: 'Daily check-in reminder',
    comment: 'Coach feedback and messages',
    program: 'New program or protocol assigned',
    test: 'Testing results recorded or verified by coach',
    data: 'Measurements recorded by your coach',
  },
};

/** VAPID keys identify this server to the push services. Generated once and stored in the database. */
export function vapidKeys(db) {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'vapid'").get();
  if (row) return JSON.parse(row.value);
  const keys = webpush.generateVAPIDKeys();
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('vapid', ?)").run(JSON.stringify(keys));
  return keys;
}

/** Real push sender. Returns 'gone' when the subscription has expired so it can be removed. */
export function webPushSender(db) {
  const keys = vapidKeys(db);
  const subject = process.env.VAPID_SUBJECT || 'mailto:notifications@squad-training.app';
  return async (sub, payload) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
        vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 60 * 60 * 24,
      });
      return 'sent';
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) return 'gone';
      console.warn('Push failed:', e.statusCode || e.message);
      return 'failed';
    }
  };
}

export function prefsOf(db, userId) {
  const row = db.prepare('SELECT * FROM notification_prefs WHERE user_id = ?').get(userId);
  return row ? { ...row, muted: JSON.parse(row.muted) } : { user_id: userId, muted: [], reminder_time: '08:00', timezone: null, last_reminder_on: null };
}

/**
 * Build notify(userId, { type, title, body, link, actorId }).
 * Muted types are skipped entirely; nobody is notified about their own action.
 */
export function createNotifier(db, sendPush) {
  const insert = db.prepare('INSERT INTO notifications (user_id, actor_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?)');
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?');
  const drop = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0');

  // Fire and forget: a slow push service must never hold up the request that triggered it.
  const push = (userId, payload) => {
    if (!sendPush) return;
    for (const s of subs.all(userId)) {
      Promise.resolve(sendPush(s, payload)).then((r) => r === 'gone' && drop.run(s.endpoint)).catch(() => {});
    }
  };

  function notify(userId, { type, title, body = null, link = null, actorId = null }) {
    if (!userId || userId === actorId) return;
    if (prefsOf(db, userId).muted.includes(type)) return;
    const id = Number(insert.run(userId, actorId, type, title, body, link).lastInsertRowid);
    push(userId, { id, title, body, url: link || '/', tag: `${type}-${id}`, badge: unread.get(userId).n });
  }
  notify.pushOnly = (userId, payload) => push(userId, { tag: 'test', badge: unread.get(userId).n, ...payload });
  return notify;
}

/** Local date ("YYYY-MM-DD") and time ("HH:MM") for a timezone. */
export function localNow(timezone, now = new Date()) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    return localNow('UTC', now);
  }
  const g = (t) => parts.find((p) => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

/** Send each athlete one check-in reminder a day, at their chosen local time, if they haven't checked in. */
export function runReminders(db, notify, now = new Date()) {
  const athletes = db.prepare("SELECT id FROM users WHERE role = 'athlete' AND coach_id IS NOT NULL").all();
  let sent = 0;
  for (const { id } of athletes) {
    const p = prefsOf(db, id);
    if (p.muted.includes('reminder')) continue;
    const { date, time } = localNow(p.timezone, now);
    if (time < p.reminder_time || p.last_reminder_on === date) continue;
    db.prepare(`INSERT INTO notification_prefs (user_id, last_reminder_on) VALUES (?, ?)
      ON CONFLICT (user_id) DO UPDATE SET last_reminder_on = excluded.last_reminder_on`).run(id, date);
    if (db.prepare('SELECT 1 FROM readiness WHERE athlete_id = ? AND day = ?').get(id, date)) continue;
    notify(id, { type: 'reminder', title: 'Morning check-in', body: 'How did you sleep? 30 seconds to tell your coach how you’re feeling.', link: '/recovery' });
    sent++;
  }
  return sent;
}

export function registerNotifications(app, { db, q, fail, str, requireUser, notify }) {
  app.get('/api/notifications', (req, res) => {
    const u = requireUser(req);
    const rows = q(`SELECT n.*, a.name AS actor_name FROM notifications n LEFT JOIN users a ON a.id = n.actor_id
      WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 100`).all(u.id);
    res.json({ notifications: rows, unread: rows.filter((r) => !r.read).length });
  });

  app.get('/api/notifications/unread', (req, res) => {
    const u = requireUser(req);
    res.json({ count: q('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0').get(u.id).n });
  });

  app.post('/api/notifications/read', (req, res) => {
    const u = requireUser(req);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null;
    if (ids) for (const id of ids) q('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(id, u.id);
    else q('UPDATE notifications SET read = 1 WHERE user_id = ?').run(u.id);
    res.json({ ok: true });
  });

  app.get('/api/notifications/prefs', (req, res) => {
    const u = requireUser(req);
    const p = prefsOf(db, u.id);
    res.json({
      prefs: { muted: p.muted, reminder_time: p.reminder_time, timezone: p.timezone },
      types: TYPES[u.role],
      devices: q('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(u.id).n,
    });
  });

  app.put('/api/notifications/prefs', (req, res) => {
    const u = requireUser(req);
    const cur = prefsOf(db, u.id);
    const b = req.body || {};
    const muted = Array.isArray(b.muted) ? b.muted.filter((t) => t in TYPES[u.role]) : cur.muted;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(b.reminder_time || '') ? b.reminder_time : cur.reminder_time;
    let tz = cur.timezone;
    if (b.timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: b.timezone });
        tz = b.timezone;
      } catch {
        /* ignore unknown zones */
      }
    }
    q(`INSERT INTO notification_prefs (user_id, muted, reminder_time, timezone) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET muted = excluded.muted, reminder_time = excluded.reminder_time, timezone = excluded.timezone`).run(
      u.id, JSON.stringify(muted), time, tz,
    );
    res.json({ prefs: { muted, reminder_time: time, timezone: tz } });
  });

  // ---------- push subscriptions (one per device / browser) ----------
  app.get('/api/push/key', (_req, res) => res.json({ publicKey: vapidKeys(db).publicKey }));

  app.post('/api/push/subscribe', (req, res) => {
    const u = requireUser(req);
    const s = req.body?.subscription;
    if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth || !/^https:\/\//.test(s.endpoint)) fail(400, 'Invalid push subscription');
    q(`INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`).run(
      s.endpoint, u.id, s.keys.p256dh, s.keys.auth, str(req.get('user-agent'))?.slice(0, 200) ?? null,
    );
    res.status(201).json({ ok: true });
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const u = requireUser(req);
    q('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(String(req.body?.endpoint || ''), u.id);
    res.json({ ok: true });
  });

  app.post('/api/push/test', (req, res) => {
    const u = requireUser(req);
    const n = q('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(u.id).n;
    if (!n) fail(400, 'Notifications aren’t switched on for any device yet');
    // Bypass mutes for an explicit test.
    q('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)').run(u.id, 'test', 'Test notification', 'Notifications are working on this device 👍', '/notifications');
    notify.pushOnly?.(u.id, { title: 'Test notification', body: 'Notifications are working on this device 👍', url: '/notifications' });
    res.json({ devices: n });
  });
}

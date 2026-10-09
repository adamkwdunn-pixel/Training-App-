import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useApi } from '../util.js';
import { disablePush, enablePush, isIOS, pushStatus } from '../push.js';
import { Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';

export default function NotificationSettings() {
  const { user } = useAuth();
  const { data, error, setData } = useApi('/notifications/prefs');
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushStatus().then(setStatus).catch(() => setStatus('unsupported'));
  }, []);

  if (!data) return <Loading error={error} />;
  const { prefs, types } = data;

  const save = async (patch) => {
    const out = await api('/notifications/prefs', { method: 'PUT', body: { ...prefs, ...patch } });
    setData({ ...data, prefs: out.prefs });
  };
  const toggle = (type) => save({ muted: prefs.muted.includes(type) ? prefs.muted.filter((t) => t !== type) : [...prefs.muted, type] });

  const turnOn = async () => {
    setBusy(true);
    setMsg('');
    try {
      await enablePush();
      setStatus('on');
      setMsg('Notifications are on for this device.');
    } catch (e) {
      setMsg(e.message);
      setStatus(await pushStatus());
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setStatus('off');
    setMsg('');
    setBusy(false);
  };
  const test = async () => {
    setMsg('');
    try {
      await api('/push/test', { method: 'POST' });
      setMsg('Test sent — it should arrive in a few seconds.');
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <>
      <PageHeader title="Notification settings" back="/notifications" />

      <div className="card stack">
        <div className="inline-form">
          <Icon name="bell" />
          <div className="grow">
            <strong>Push notifications on this device</strong>
            <div className="small muted">
              {status === 'on' && 'On — you’ll get notifications even when the app is closed.'}
              {status === 'off' && 'Off. Turn on to get alerts on this phone or computer.'}
              {status === 'denied' && 'Blocked in your settings.'}
              {status === 'needs-install' && 'On iPhone, notifications only work once the app is on your home screen.'}
              {status === 'unsupported' && 'This browser doesn’t support push notifications.'}
            </div>
          </div>
        </div>
        {status === 'off' && <button className="btn primary" disabled={busy} onClick={turnOn}>Turn on notifications</button>}
        {status === 'on' && (
          <div className="row-actions" style={{ marginTop: 0 }}>
            <button className="btn" onClick={test}>Send a test</button>
            <button className="btn ghost" disabled={busy} onClick={turnOff}>Turn off on this device</button>
          </div>
        )}
        {status === 'needs-install' && (
          <ol className="small" style={{ margin: 0, paddingLeft: '1.2rem' }}>
            <li>Open this site in <strong>Safari</strong>.</li>
            <li>Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.</li>
            <li>Open the app from your home screen and come back here to turn notifications on.</li>
          </ol>
        )}
        {status === 'denied' && (
          <p className="small muted" style={{ margin: 0 }}>
            {isIOS()
              ? 'Open the iPhone Settings app → Notifications → AD Rugby → Allow Notifications.'
              : 'Click the padlock / site settings icon next to the address bar and allow Notifications, then reload.'}
          </p>
        )}
        {msg && <p className="small" style={{ margin: 0 }}>{msg}</p>}
        <p className="tiny faint" style={{ margin: 0 }}>Turn this on separately on each phone or computer you use. Everything below also appears in the 🔔 inbox in the app.</p>
      </div>

      <h2>What to notify me about</h2>
      <div className="list">
        {Object.entries(types).map(([type, label]) => {
          const on = !prefs.muted.includes(type);
          return (
            <label key={type} className="row switch-row">
              <span className="grow" style={{ color: 'var(--text)', fontSize: '0.95rem', fontWeight: 500, letterSpacing: 0 }}>{label}</span>
              <input type="checkbox" className="switch" checked={on} onChange={() => toggle(type)} />
            </label>
          );
        })}
      </div>

      {user.role === 'athlete' && !prefs.muted.includes('reminder') && (
        <div className="card stack">
          <label>
            Check-in reminder time
            <input type="time" value={prefs.reminder_time} onChange={(e) => e.target.value && save({ reminder_time: e.target.value })} />
          </label>
          <p className="tiny muted" style={{ margin: 0 }}>Sent once a day at this time ({prefs.timezone || 'your local time'}), only if you haven’t already checked in.</p>
        </div>
      )}
      {user.role === 'athlete' && !prefs.muted.includes('photo') && (
        <div className="card stack">
          <label>
            Progress photo day
            <select value={prefs.photo_day ?? 1} onChange={(e) => save({ photo_day: Number(e.target.value) })}>
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
          <p className="tiny muted" style={{ margin: 0 }}>A weekly reminder at your check-in time to take progress photos. They stay on your phone and don’t need uploading. Keep a record of them to see your own visual progress over time.</p>
        </div>
      )}
    </>
  );
}

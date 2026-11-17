import { useEffect, useState } from 'react';
import { enablePush, isIOS, pushStatus } from '../push.js';
import Icon from './Icon.jsx';

const SNOOZE_KEY = 'push-prompt-snoozed';
const snoozed = () => {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
};

/**
 * Asks athletes to turn on push notifications on this phone, so coach feedback reaches them.
 * Walks iPhone users through adding the app to the home screen first, and explains how to unblock.
 */
export default function PushPrompt({ reason = 'so you see your coach’s feedback the moment it’s sent' }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hidden, setHidden] = useState(snoozed);

  useEffect(() => {
    pushStatus().then(setStatus).catch(() => setStatus('unsupported'));
  }, []);

  if (hidden || !status || status === 'on' || status === 'unsupported') return null;
  const snooze = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + 2 * 24 * 3600 * 1000));
    } catch {
      /* storage unavailable */
    }
    setHidden(true);
  };
  const turnOn = async () => {
    setBusy(true);
    setErr('');
    try {
      await enablePush();
      setStatus('on');
    } catch (e) {
      setErr(e.message);
      setStatus(await pushStatus());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack push-prompt" role="region" aria-label="Turn on notifications">
      <div className="inline-form" style={{ alignItems: 'flex-start' }}>
        <Icon name="bell" />
        <div className="grow">
          <strong>Turn on notifications</strong>
          <div className="small muted">Get an alert on this phone {reason}.</div>
        </div>
      </div>
      {status === 'off' && <button className="btn primary" disabled={busy} onClick={turnOn}>{busy ? 'Turning on…' : 'Turn on notifications'}</button>}
      {status === 'needs-install' && (
        <ol className="small" style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>Open this page in <strong>Safari</strong>.</li>
          <li>Tap <strong>Share</strong> (the square with an arrow), then <strong>Add to Home Screen</strong>.</li>
          <li>Open AD Rugby from your home screen; this box will then let you turn notifications on.</li>
        </ol>
      )}
      {status === 'denied' && (
        <p className="small" style={{ margin: 0 }}>
          Notifications are blocked on this phone.{' '}
          {isIOS() ? 'Open the Settings app → Notifications → AD Rugby → Allow Notifications.' : 'Open your browser’s site settings for this app (the icon next to the address, or long-press the app icon → App info) and allow Notifications.'}
        </p>
      )}
      {err && <p className="error">{err}</p>}
      <button className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={snooze}>Not now</button>
    </div>
  );
}

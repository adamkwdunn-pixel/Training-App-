import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { PageHeader } from '../components/Bits.jsx';

export default function Profile() {
  const { user, coach, signOut, refresh, signIn, system } = useAuth();
  const switchView = async () => {
    const out = await api('/me/switch', { method: 'POST' });
    signIn(out.token, out.user);
  };
  const [f, setF] = useState({ name: user.name, position: user.position || '', bodyweight: user.bodyweight || '', current_password: '', new_password: '' });
  const [msg, setMsg] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api('/me', { method: 'PATCH', body: f });
      setF({ ...f, current_password: '', new_password: '' });
      setMsg('Saved ✓');
      refresh();
    } catch (e2) {
      setMsg(e2.message);
    }
  };
  return (
    <>
      <PageHeader title="Profile" sub={`${user.email} · ${user.role}${coach ? ` · coach: ${coach.name}` : ''}`} />
      {user.role === 'coach' && <p className="card">Team code for athletes: <strong className="code">{user.invite_code}</strong></p>}
      <form className="card stack" onSubmit={save}>
        <div className="grid2">
          <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label>Position<input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></label>
          <label>Bodyweight (kg)<input type="number" step="0.1" inputMode="decimal" value={f.bodyweight} onChange={(e) => setF({ ...f, bodyweight: e.target.value })} /></label>
        </div>
        <h3>Change password</h3>
        <div className="grid2">
          <label>Current password<input type="password" autoComplete="current-password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} /></label>
          <label>New password<input type="password" autoComplete="new-password" minLength={8} value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></label>
        </div>
        {msg && <p className="small">{msg}</p>}
        <button className="btn primary">Save</button>
      </form>
      {user.linked_user_id && (
        <button className="card flat row" style={{ border: '1px solid var(--line)', marginBottom: 14, width: '100%' }} onClick={switchView}>
          <Icon name={user.role === 'coach' ? 'user' : 'clipboard'} />
          <div className="grow"><strong>Switch to {user.role === 'coach' ? 'your athlete view' : 'coach view'}</strong><div className="small muted">No need to sign out</div></div>
          <Icon name="right" size={18} />
        </button>
      )}
      <Link to="/settings/notifications" className="card flat row" style={{ border: '1px solid var(--line)', marginBottom: 14 }}>
        <Icon name="bell" />
        <div className="grow"><strong>Notifications</strong><div className="small muted">Phone alerts, what you’re notified about{user.role === 'athlete' ? ', check-in reminder time' : ''}</div></div>
        <Icon name="right" size={18} />
      </Link>
      {system && <ServerStatus system={system} />}
      <button className="btn ghost danger" onClick={signOut}>Sign out</button>
    </>
  );
}

/** Coach-only: what the server is running on, so hosting problems are visible. */
function ServerStatus({ system }) {
  const s = system.storage;
  const ok = s.persistent !== false;
  return (
    <div className="card stack" style={{ borderColor: ok ? 'var(--line)' : 'var(--bad)' }}>
      <h3 style={{ margin: 0 }}>Server status</h3>
      <div className="kv small"><span className="muted">Data storage</span><strong style={{ color: ok ? 'var(--good)' : 'var(--bad)' }}>{s.label}</strong></div>
      <div className="kv small"><span className="muted">Data folder</span><span>{s.dir}</span></div>
      <div className="kv small"><span className="muted">App version</span><span>{system.version}</span></div>
      <div className="kv small"><span className="muted">Running since</span><span>{new Date(system.started_at).toLocaleString()}</span></div>
      <div className="kv small"><span className="muted">AI food estimates</span><span>{system.ai_configured ? 'On ✓' : 'Off (add ANTHROPIC_API_KEY in Render)'}</span></div>
      <div className="kv small"><span className="muted">Program import (PDF/photo)</span><span>{system.import_configured ? 'On ✓' : 'Off (add ANTHROPIC_API_KEY in Render)'}</span></div>
      <div className="kv small"><span className="muted">Login emails</span><span>{system.email_configured ? 'Set up ✓' : 'Not set up (details shown to copy/share)'}</span></div>
      {!ok && (
        <div className="small" style={{ lineHeight: 1.6 }}>
          <strong>How to fix (in Render, on this app’s service page):</strong>
          <ol style={{ margin: '6px 0 0', paddingLeft: '1.2rem' }}>
            <li><strong>Disks → Add disk</strong>: mount path <code>/var/data</code>, size 1–5 GB. (Needs a paid instance, e.g. Starter.)</li>
            <li><strong>Environment</strong>: add <code>DATA_DIR</code> = <code>/var/data</code>{s.data_dir_set ? ' (it’s set — check it matches the disk’s mount path exactly)' : ''}.</li>
            <li>Save and redeploy. This card turns green once it’s working.</li>
          </ol>
        </div>
      )}
    </div>
  );
}

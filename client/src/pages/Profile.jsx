import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { PageHeader } from '../components/Bits.jsx';

export default function Profile() {
  const { user, coach, signOut, refresh } = useAuth();
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
      <button className="btn ghost danger" onClick={signOut}>Sign out</button>
    </>
  );
}

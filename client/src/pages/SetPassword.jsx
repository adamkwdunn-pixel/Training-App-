import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { Brand } from '../components/Layout.jsx';

/** First sign-in with a temporary password from the coach: choose your own before continuing. */
export default function SetPassword({ onDone }) {
  const { user, signOut } = useAuth();
  const [f, setF] = useState({ current_password: '', new_password: '', confirm: '' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (f.new_password !== f.confirm) return setErr('The new passwords don’t match');
    try {
      await api('/me', { method: 'PATCH', body: { current_password: f.current_password, new_password: f.new_password } });
      onDone();
    } catch (e2) {
      setErr(e2.message);
    }
  };
  return (
    <div className="auth-page">
      <form className="auth-card stack" onSubmit={submit}>
        <Brand big />
        <h3 style={{ textAlign: 'center', margin: 0 }}>Welcome, {user.name.split(' ')[0]}</h3>
        <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>Choose your own password to finish setting up your account.</p>
        <label>Temporary password (from your email)<input required type="password" autoComplete="current-password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} /></label>
        <label>New password<input required type="password" minLength={8} autoComplete="new-password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></label>
        <label>Confirm new password<input required type="password" minLength={8} autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></label>
        {err && <p className="error">{err}</p>}
        <button className="btn primary block">Save and continue</button>
        <button type="button" className="btn ghost block" onClick={signOut}>Sign out</button>
      </form>
    </div>
  );
}

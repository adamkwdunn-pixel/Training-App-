import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { Brand } from '../components/Layout.jsx';

export default function Login() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState('login'); // login | athlete | coach
  const [f, setF] = useState({ name: '', email: '', password: '', invite_code: '', coach_key: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const out = mode === 'login'
        ? await api('/auth/login', { method: 'POST', body: { email: f.email, password: f.password } })
        : await api('/auth/register', { method: 'POST', body: { ...f, role: mode } });
      signIn(out.token, out.user);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card stack" onSubmit={submit}>
        <Brand big />
        <p className="auth-tag">Training · Nutrition · Recovery · Testing</p>
        <div className="segmented">
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Sign in</button>
          <button type="button" className={mode === 'athlete' ? 'on' : ''} onClick={() => setMode('athlete')}>Join team</button>
          <button type="button" className={mode === 'coach' ? 'on' : ''} onClick={() => setMode('coach')}>Coach</button>
        </div>
        {mode !== 'login' && (
          <label>Full name<input required value={f.name} onChange={set('name')} autoComplete="name" /></label>
        )}
        <label>Email<input required type="email" value={f.email} onChange={set('email')} autoComplete="email" /></label>
        <label>
          Password
          <input required type="password" minLength={mode === 'login' ? undefined : 8} value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {mode === 'athlete' && (
          <label>Team code<input required value={f.invite_code} onChange={set('invite_code')} placeholder="From your coach" autoCapitalize="characters" /></label>
        )}
        {mode === 'coach' && (
          <label>
            Coach key <span className="muted small">(not needed for the first coach)</span>
            <input value={f.coach_key} onChange={set('coach_key')} />
          </label>
        )}
        {err && <p className="error">{err}</p>}
        <button className="btn primary block" disabled={busy}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}

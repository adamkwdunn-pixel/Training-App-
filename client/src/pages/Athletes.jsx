import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import LoginDetails from '../components/LoginDetails.jsx';
import { fmtDate, useApi } from '../util.js';
import { Badge, Empty, Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';

export default function Athletes() {
  const { data, error, reload } = useApi('/athletes');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', email: '', position: '' });
  const [created, setCreated] = useState(null);
  const { signIn } = useAuth();
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');
  const [code, setCode] = useState(null);

  const add = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const out = await api('/athletes', { method: 'POST', body: f });
      setCreated({ ...out, name: f.name });
      setF({ name: '', email: '', position: '' });
      setAdding(false);
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  };
  const newCode = async () => {
    if (!confirm('Make a new team code? The old one will stop working for new sign-ups.')) return;
    setCode((await api('/me/invite-code', { method: 'POST' })).invite_code);
  };

  const [confirming, setConfirming] = useState(null); // athlete id showing delete options
  const deleteAthlete = async (a, permanent) => {
    if (permanent && !confirm(`Permanently delete ${a.name} and all their data? This can’t be undone.`)) return;
    await api(`/athletes/${a.id}${permanent ? '?permanent=1' : ''}`, { method: 'DELETE' });
    setConfirming(null);
    reload();
  };
  const removeDemo = async () => {
    if (!confirm(`Permanently delete the ${data.demo_count} demo athletes (Sam, Jordan, Alex…) and all their demo data?\n\nYour own account, your programs and any real athletes are kept.`)) return;
    await api('/athletes/remove-demo', { method: 'POST' });
    reload();
  };

  const addMe = async () => {
    await api('/me/athlete-profile', { method: 'POST' });
    reload();
  };
  const switchToMe = async () => {
    const out = await api('/me/switch', { method: 'POST' });
    signIn(out.token, out.user);
  };

  if (!data) return <Loading error={error} />;
  const list = data.athletes.filter((a) => `${a.name} ${a.position || ''}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <PageHeader title="Athletes" sub={`${data.athletes.length} in your squad`}>
        <button className="btn primary" onClick={() => setAdding(!adding)}><Icon name="plus" /> Add</button>
      </PageHeader>

      <div className="card invite">
        <div>
          Team code: <strong className="code">{code || data.invite_code}</strong>
          <div className="muted small">Athletes choose “Join team” and enter this code.</div>
        </div>
        <button className="btn small ghost" onClick={newCode}>New code</button>
      </div>

      {adding && (
        <form className="card stack" onSubmit={add}>
          <h3>Add an athlete</h3>
          <div className="grid2">
            <label>Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label>Position<input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} placeholder="e.g. Tighthead prop" /></label>
            <label>Email<input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            A temporary password is created for them{data.email_configured ? ' and emailed with a link to the app' : ''}. They choose their own the first time they sign in.
          </p>
          {err && <p className="error">{err}</p>}
          <button className="btn primary">Add athlete</button>
        </form>
      )}

      {data.demo_count > 0 && (
        <div className="card flat row" style={{ border: '1px solid var(--warn)', marginBottom: 14 }}>
          <Icon name="alert" />
          <div className="grow">
            <strong>{data.demo_count} demo athlete{data.demo_count === 1 ? '' : 's'} in your squad</strong>
            <div className="small muted">Clear them out before adding your real squad.</div>
          </div>
          <button className="btn small" onClick={removeDemo}>Remove demo athletes</button>
        </div>
      )}

      {created && <LoginDetails details={created} onClose={() => setCreated(null)} />}

      <div className="card flat row" style={{ border: '1px solid var(--line)', marginBottom: 14 }}>
        <Icon name="user" />
        <div className="grow">
          <strong>{data.has_athlete_profile ? 'Your athlete profile' : 'Train on your own program'}</strong>
          <div className="small muted">{data.has_athlete_profile ? 'Log your own sessions, check-ins and tests, then switch back.' : 'Add yourself as an athlete in your squad to try everything first-hand.'}</div>
        </div>
        {data.has_athlete_profile
          ? <button className="btn small primary" onClick={switchToMe}>Switch to athlete view</button>
          : <button className="btn small" onClick={addMe}><Icon name="plus" size={16} /> Add myself</button>}
      </div>

      {data.athletes.length > 6 && <input className="search" placeholder="Search athletes…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      {data.athletes.length === 0 && <Empty>No athletes yet. Share your team code or add them above.</Empty>}
      <div className="list">
        {list.map((a) => (
          <div key={a.id} className="row athlete-row">
            <Link to={`/athletes/${a.id}`} className="athlete-link">
            <div className="avatar">{a.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
            <div className="grow">
              <strong>{a.name}</strong>{a.is_me && <span className="badge solid" style={{ marginLeft: 6 }}>You</span>} {a.position && <span className="muted small">· {a.position}</span>}
              <div className="muted small">
                {a.program || 'No program'} · last session {fmtDate(a.last_session)} · {a.sessions_7d} this week
              </div>
            </div>
            <div className="badges">
              {a.pending_videos > 0 && <Badge tone="info">{a.pending_videos} video</Badge>}
              {a.flags > 0 && <Badge tone="warn">{a.flags} flag</Badge>}
              {a.unread_messages > 0 && <Badge tone="info">{a.unread_messages} msg</Badge>}
              {a.unseen_logs > 0 && <Badge>{a.unseen_logs} new</Badge>}
            </div>
            </Link>
            <div className="row-tools">
              <Link to={`/athletes/${a.id}?tab=details`} className="icon-btn" aria-label={`Edit ${a.name}`} title="Edit details"><Icon name="edit" size={18} /></Link>
              {!a.is_me && <button className="icon-btn" onClick={() => setConfirming(confirming === a.id ? null : a.id)} aria-label={`Delete ${a.name}`} title="Delete"><Icon name="trash" size={18} /></button>}
            </div>
            {confirming === a.id && (
              <div className="delete-options">
                <button className="btn small" onClick={() => deleteAthlete(a, false)}>Remove from squad<span className="tiny muted">&nbsp;· keeps history</span></button>
                <button className="btn small danger" onClick={() => deleteAthlete(a, true)}>Delete permanently</button>
                <button className="btn small ghost" onClick={() => setConfirming(null)}>Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

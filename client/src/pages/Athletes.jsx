import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDate, useApi } from '../util.js';
import { Badge, Empty, Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';

export default function Athletes() {
  const { data, error, reload } = useApi('/athletes');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', position: '' });
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');
  const [code, setCode] = useState(null);

  const add = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api('/athletes', { method: 'POST', body: f });
      setF({ name: '', email: '', password: '', position: '' });
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
            <label>Temporary password<input required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
          </div>
          {err && <p className="error">{err}</p>}
          <button className="btn primary">Add athlete</button>
        </form>
      )}

      {data.athletes.length > 6 && <input className="search" placeholder="Search athletes…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      {data.athletes.length === 0 && <Empty>No athletes yet. Share your team code or add them above.</Empty>}
      <div className="list">
        {list.map((a) => (
          <Link key={a.id} to={`/athletes/${a.id}`} className="row">
            <div className="avatar">{a.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
            <div className="grow">
              <strong>{a.name}</strong> {a.position && <span className="muted small">· {a.position}</span>}
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
        ))}
      </div>
    </>
  );
}

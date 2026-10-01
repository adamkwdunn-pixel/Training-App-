import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { fmtDate, useApi } from '../util.js';
import { Badge, Empty, Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';
import { ScoreChip } from '../components/Ring.jsx';
import { AssignedProtocols, CheckIn, Injuries } from '../components/Recovery.jsx';

export function MyCheckIn() {
  const { user } = useAuth();
  return (<><PageHeader title="Readiness" sub="A 30-second daily check-in for your coach" /><CheckIn athleteId={user.id} /></>);
}
export function MyInjuries() {
  const { user } = useAuth();
  return (<><PageHeader title="Injuries" sub="Tell your coach about anything that hurts" /><Injuries athleteId={user.id} /></>);
}
export function MyProtocols() {
  const { user } = useAuth();
  return (<><PageHeader title="Protocols" sub="Stretching, prehab and rehab from your coach" /><AssignedProtocols athleteId={user.id} /></>);
}

const AVAIL_TONE = { full: 'ok', modified: 'warn', unavailable: 'bad' };
const AVAIL = { full: 'Full', modified: 'Modified', unavailable: 'Unavailable' };

export function RecoverySquad() {
  const { data, error } = useApi('/recovery/squad');
  if (!data) return <Loading error={error} />;
  const checkedIn = data.athletes.filter((a) => a.latest?.day === data.today);
  const injured = data.athletes.filter((a) => a.injuries.length);
  const low = checkedIn.filter((a) => a.latest.score < 50);
  return (
    <>
      <PageHeader title="Recovery" sub="Today’s readiness and current injuries" />
      <div className="grid3" style={{ marginBottom: 14 }}>
        <div className="card flat stat" style={{ margin: 0 }}><span className="stat-label">Checked in today</span><span className="stat-value">{checkedIn.length}<small>/ {data.athletes.length}</small></span></div>
        <div className="card flat stat" style={{ margin: 0 }}><span className="stat-label">Low readiness</span><span className="stat-value">{low.length}</span></div>
        <div className="card flat stat" style={{ margin: 0 }}><span className="stat-label">Injured</span><span className="stat-value">{injured.length}</span></div>
      </div>
      {data.athletes.length === 0 && <Empty>No athletes yet.</Empty>}
      <div className="list">
        {[...data.athletes].sort((a, b) => (a.latest?.day === data.today ? a.latest.score : 101) - (b.latest?.day === data.today ? b.latest.score : 101)).map((a) => {
          const today = a.latest?.day === data.today ? a.latest : null;
          return (
            <Link key={a.id} to={`/athletes/${a.id}?tab=recovery`} className="row wrap">
              <ScoreChip score={today?.score ?? null} />
              <div className="grow">
                <strong>{a.name}</strong>{a.position && <span className="muted small"> · {a.position}</span>}
                <div className="small muted">
                  {today ? `Sleep ${today.sleep_hours ?? '—'} h · soreness ${today.soreness}/5${today.notes ? ` · “${today.notes}”` : ''}` : a.latest ? `Last check-in ${fmtDate(a.latest.day)}` : 'No check-ins yet'}
                  {a.avg_7d != null && ` · 7-day avg ${a.avg_7d}`}
                </div>
              </div>
              <div className="badges">
                {a.injuries.map((i) => <Badge key={i.id} tone={AVAIL_TONE[i.availability]}>{i.area} · {AVAIL[i.availability]}</Badge>)}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

const CATS = ['mobility', 'prehab', 'rehab', 'recovery'];
const blank = () => ({ name: '', category: 'mobility', description: '', items: [{ name: '', dose: '', notes: '', video_url: '' }] });

export function ProtocolLibrary() {
  const { data, error, reload } = useApi('/protocols');
  const [editing, setEditing] = useState(null);
  const [assigning, setAssigning] = useState(null);
  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHeader title="Protocols" sub="Stretching, mobility, prehab and rehab programs">
        <button className="btn primary" onClick={() => setEditing(blank())}><Icon name="plus" /> New</button>
      </PageHeader>
      {editing && <ProtocolEditor p={editing} onDone={() => { setEditing(null); reload(); }} />}
      {assigning && <AssignProtocol p={assigning} onDone={() => { setAssigning(null); reload(); }} />}
      {CATS.map((c) => {
        const list = data.protocols.filter((p) => p.category === c);
        if (!list.length) return null;
        return (
          <section key={c}>
            <h2>{c}</h2>
            <div className="tiles">
              {list.map((p) => (
                <div key={p.id} className="card stack">
                  <div>
                    <h3>{p.name}</h3>
                    {p.description && <div className="small muted">{p.description}</div>}
                  </div>
                  <ol className="protocol-items">
                    {p.items.map((it, k) => <li key={k}><div className="grow"><div className="small">{it.name}</div><div className="tiny muted">{it.dose}</div></div></li>)}
                  </ol>
                  <div className="row-actions" style={{ marginTop: 0 }}>
                    <button className="btn small primary" onClick={() => setAssigning(p)}>Assign</button>
                    <button className="btn small" onClick={() => setEditing(structuredClone(p))}>Edit</button>
                    <span className="grow" />
                    <span className="tiny muted">{p.athlete_count} athlete{p.athlete_count === 1 ? '' : 's'}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

function ProtocolEditor({ p: initial, onDone }) {
  const [p, setP] = useState(initial);
  const [err, setErr] = useState('');
  const setItem = (i, patch) => setP({ ...p, items: p.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const move = (i, d) => {
    const items = [...p.items];
    if (i + d < 0 || i + d >= items.length) return;
    [items[i], items[i + d]] = [items[i + d], items[i]];
    setP({ ...p, items });
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      if (p.id) await api(`/protocols/${p.id}`, { method: 'PUT', body: p });
      else await api('/protocols', { method: 'POST', body: p });
      onDone();
    } catch (e2) {
      setErr(e2.message);
    }
  };
  const del = async () => {
    if (!confirm(`Delete “${p.name}”? It will be removed from every athlete.`)) return;
    await api(`/protocols/${p.id}`, { method: 'DELETE' });
    onDone();
  };
  return (
    <form className="card stack" onSubmit={save}>
      <h3>{p.id ? 'Edit protocol' : 'New protocol'}</h3>
      <div className="grid2">
        <label>Name<input required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="e.g. ACL return-to-run phase 2" /></label>
        <label>
          Type
          <select value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
      </div>
      <label>Instructions<textarea rows={2} value={p.description || ''} onChange={(e) => setP({ ...p, description: e.target.value })} placeholder="When to do it, pain rules, progression criteria" /></label>
      <div className="stat-label">Exercises</div>
      {p.items.map((it, i) => (
        <div key={i} className="clause">
          <div className="item-row">
            <input value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder="Exercise / stretch" />
            <input className="item-dose" value={it.dose || ''} onChange={(e) => setItem(i, { dose: e.target.value })} placeholder="Dose, e.g. 3 × 30 s" />
            <div className="inline-form" style={{ gap: 0 }}>
              <button type="button" className="icon-btn" onClick={() => move(i, -1)} aria-label="Move up"><Icon name="up" size={16} /></button>
              <button type="button" className="icon-btn" onClick={() => setP({ ...p, items: p.items.filter((_, j) => j !== i) })} aria-label="Remove"><Icon name="trash" size={16} /></button>
            </div>
          </div>
          <div className="grid2">
            <input value={it.notes || ''} onChange={(e) => setItem(i, { notes: e.target.value })} placeholder="Cues / notes (optional)" />
            <input type="url" value={it.video_url || ''} onChange={(e) => setItem(i, { video_url: e.target.value })} placeholder="Demo video link (optional)" />
          </div>
        </div>
      ))}
      <button type="button" className="btn ghost" onClick={() => setP({ ...p, items: [...p.items, { name: '', dose: '' }] })}><Icon name="plus" size={16} /> Add exercise</button>
      {err && <p className="error">{err}</p>}
      <div className="row-actions">
        <button className="btn primary">Save protocol</button>
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
        <span className="grow" />
        {p.id && <button type="button" className="btn ghost danger" onClick={del}>Delete</button>}
      </div>
    </form>
  );
}

function AssignProtocol({ p, onDone }) {
  const { data } = useApi('/athletes');
  const { data: detail } = useApi(`/protocols/${p.id}`);
  const [sel, setSel] = useState([]);
  const [f, setF] = useState({ frequency: 'Daily', note: '' });
  const assigned = new Set(detail?.assignments.map((a) => a.athlete_id));
  const submit = async (e) => {
    e.preventDefault();
    await api(`/protocols/${p.id}/assign`, { method: 'POST', body: { ...f, athlete_ids: sel } });
    onDone();
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h3>Assign “{p.name}”</h3>
      <div className="chips">
        {data?.athletes.map((a) => (
          <button type="button" key={a.id} className={`chip ${sel.includes(a.id) ? 'on' : ''}`} onClick={() => setSel(sel.includes(a.id) ? sel.filter((x) => x !== a.id) : [...sel, a.id])}>
            {a.name}{assigned.has(a.id) && <span className="tiny">✓</span>}
          </button>
        ))}
      </div>
      <div className="grid2">
        <label>
          How often
          <select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}>
            {['Daily', 'Before every session', 'After every session', '3× per week', '2× per week', 'Day after a match'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </label>
        <label>Note for athletes<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" /></label>
      </div>
      <div className="row-actions" style={{ marginTop: 0 }}>
        <button className="btn primary" disabled={!sel.length}>Assign to {sel.length || ''} athlete{sel.length === 1 ? '' : 's'}</button>
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

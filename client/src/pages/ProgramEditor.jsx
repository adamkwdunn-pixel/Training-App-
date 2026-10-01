import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { today, useApi } from '../util.js';
import { Badge, Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';

export default function ProgramEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, error, setData } = useApi(`/programs/${id}`);
  const [editingInfo, setEditingInfo] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [copy, setCopy] = useState({ from: 1, to: 2 });

  if (!data) return <Loading error={error} />;
  const p = data.program;
  const update = (program) => setData({ program });
  const weeks = Array.from({ length: Math.max(p.weeks, ...p.days.map((d) => d.week), 1) }, (_, i) => i + 1);

  const addDay = async (week) => {
    const { id: dayId } = await api(`/programs/${p.id}/days`, { method: 'POST', body: { week } });
    nav(`/programs/${p.id}/days/${dayId}`);
  };
  const dupDay = async (d) => {
    await api(`/days/${d.id}/duplicate`, { method: 'POST', body: {} });
    update((await api(`/programs/${p.id}`)).program);
  };
  const delDay = async (d) => {
    if (!confirm(`Delete “${d.title}” (week ${d.week})?`)) return;
    await api(`/days/${d.id}`, { method: 'DELETE' });
    update((await api(`/programs/${p.id}`)).program);
  };
  const copyWeek = async () => {
    if (!confirm(`Copy week ${copy.from} onto week ${copy.to}? Sessions in week ${copy.to} will be replaced.`)) return;
    update((await api(`/programs/${p.id}/copy-week`, { method: 'POST', body: copy })).program);
  };
  const addWeek = async () => update((await api(`/programs/${p.id}`, { method: 'PUT', body: { weeks: p.weeks + 1 } })).program);
  const duplicate = async () => {
    const name = prompt('Name for the copy (e.g. for one athlete):', `${p.name} (copy)`);
    if (!name) return;
    const { program } = await api(`/programs/${p.id}/duplicate`, { method: 'POST', body: { name } });
    nav(`/programs/${program.id}`);
  };
  const remove = async () => {
    if (!confirm(`Delete “${p.name}”? Athletes on it will lose the program (their logs are kept).`)) return;
    await api(`/programs/${p.id}`, { method: 'DELETE' });
    nav('/programs');
  };

  return (
    <>
      <PageHeader title={p.name} back="/programs" sub={p.description}>
        <button className="btn" onClick={() => setAssigning(!assigning)}><Icon name="users" /> Assign</button>
        <button className="btn ghost" onClick={() => setEditingInfo(!editingInfo)}>Edit</button>
      </PageHeader>

      {editingInfo && <InfoForm p={p} onSaved={(prog) => { update(prog); setEditingInfo(false); }} onDuplicate={duplicate} onDelete={remove} />}
      {assigning && <AssignForm p={p} onDone={(prog) => { update(prog); setAssigning(false); }} />}

      {p.assignments.length > 0 && (
        <p className="small muted">
          On this program: {p.assignments.filter((a) => a.active).map((a) => (
            <Link key={a.id} to={`/athletes/${a.athlete_id}?tab=program`} className="chip">{a.athlete_name}</Link>
          ))}
        </p>
      )}

      {weeks.map((w) => {
        const days = p.days.filter((d) => d.week === w);
        return (
          <section key={w} className="week">
            <div className="week-head">
              <h2>Week {w}</h2>
              <button className="btn small ghost" onClick={() => addDay(w)}><Icon name="plus" size={16} /> Session</button>
            </div>
            {days.length === 0 && <p className="muted small">No sessions this week.</p>}
            <div className="day-grid">
              {days.map((d) => (
                <div key={d.id} className="day-card">
                  <Link to={`/programs/${p.id}/days/${d.id}`} className="day-link">
                    <div className="day-title">D{d.day} · {d.title || 'Session'}</div>
                    {d.prescriptions.length === 0 && <div className="muted small">Empty — tap to add exercises</div>}
                    <ul>
                      {d.prescriptions.slice(0, 6).map((r) => (
                        <li key={r.id}>{r.block && <span className="block-tag">{r.block}</span>}{r.exercise_name}</li>
                      ))}
                      {d.prescriptions.length > 6 && <li className="muted">+{d.prescriptions.length - 6} more</li>}
                    </ul>
                  </Link>
                  <div className="day-actions">
                    <button className="icon-btn" title="Duplicate session" onClick={() => dupDay(d)}><Icon name="copy" size={16} /></button>
                    <button className="icon-btn" title="Delete session" onClick={() => delDay(d)}><Icon name="trash" size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <div className="card inline-form wrap">
        <button className="btn" onClick={addWeek}><Icon name="plus" /> Add week</button>
        <span className="grow" />
        <span className="small">Copy week</span>
        <select value={copy.from} onChange={(e) => setCopy({ ...copy, from: Number(e.target.value) })}>{weeks.map((w) => <option key={w}>{w}</option>)}</select>
        <span className="small">to</span>
        <select value={copy.to} onChange={(e) => setCopy({ ...copy, to: Number(e.target.value) })}>{[...weeks, weeks.length + 1].map((w) => <option key={w}>{w}</option>)}</select>
        <button className="btn" onClick={copyWeek}><Icon name="copy" /> Copy</button>
      </div>
    </>
  );
}

function InfoForm({ p, onSaved, onDuplicate, onDelete }) {
  const [f, setF] = useState({ name: p.name, description: p.description || '' });
  const save = async (e) => {
    e.preventDefault();
    onSaved((await api(`/programs/${p.id}`, { method: 'PUT', body: f })).program);
  };
  return (
    <form className="card stack" onSubmit={save}>
      <label>Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label>Description<textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <div className="row-actions">
        <button className="btn primary">Save</button>
        <button type="button" className="btn" onClick={onDuplicate}><Icon name="copy" /> Duplicate program</button>
        <span className="grow" />
        <button type="button" className="btn danger ghost" onClick={onDelete}>Delete</button>
      </div>
    </form>
  );
}

function AssignForm({ p, onDone }) {
  const { data: athletes } = useApi('/athletes');
  const { data: rules } = useApi('/rules');
  const [sel, setSel] = useState([]);
  const [f, setF] = useState({ rule_id: '', start_date: today(), replace_active: true });
  const toggle = (aid) => setSel(sel.includes(aid) ? sel.filter((x) => x !== aid) : [...sel, aid]);
  const submit = async (e) => {
    e.preventDefault();
    onDone((await api('/assignments', { method: 'POST', body: { ...f, program_id: p.id, athlete_ids: sel } })).program);
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h3>Assign to athletes</h3>
      <div className="chips">
        {athletes?.athletes.map((a) => (
          <button type="button" key={a.id} className={`chip ${sel.includes(a.id) ? 'on' : ''}`} onClick={() => toggle(a.id)}>
            {a.name}{a.program === p.name && <Badge tone="ok">on it</Badge>}
          </button>
        ))}
        {athletes?.athletes.length === 0 && <span className="muted small">No athletes yet.</span>}
      </div>
      <div className="grid2">
        <label>
          Progression rule
          <select value={f.rule_id} onChange={(e) => setF({ ...f, rule_id: e.target.value })}>
            <option value="">None</option>
            {rules?.rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label>Start date<input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></label>
      </div>
      <label className="check">
        <input type="checkbox" checked={f.replace_active} onChange={(e) => setF({ ...f, replace_active: e.target.checked })} />
        Replace each athlete’s current program
      </label>
      <button className="btn primary" disabled={!sel.length}>Assign to {sel.length || ''} athlete{sel.length === 1 ? '' : 's'}</button>
    </form>
  );
}

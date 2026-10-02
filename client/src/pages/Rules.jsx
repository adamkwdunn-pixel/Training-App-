import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApi } from '../util.js';
import { Badge, Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';
import { METRIC_LABELS, ruleSentences } from '../ruleText.js';

const emptyRule = () => ({ name: '', description: '', config: { clauses: [], otherwise: [{ action: 'hold' }] } });
function newClause() {
  return { label: '', when: [{ metric: 'all_reps_completed', op: '==', value: 1 }], then: [{ action: 'adjust_load_kg', value: 2.5 }] };
}

const EXAMPLES = [
  'If they complete every rep with at least 2 reps in reserve, add 5 kg. If they complete every rep on target, add 2.5 kg. If they miss 3 or more reps, drop the load 5%.',
  'Add 2.5 kg each successful session. After two failed sessions in a row, deload 10% and start again.',
  'If their estimated 1RM beats their max by 2% or more, update the max. If it’s 8% or more below, flag it for me.',
];

export default function Rules() {
  const { data, error, reload } = useApi('/rules');
  const { data: meta } = useApi('/rules/meta');
  const [editing, setEditing] = useState(null);

  // The editor replaces the list, so make sure it's in view (on a phone the list can be long).
  useEffect(() => { window.scrollTo({ top: 0 }); }, [editing]);

  if (!data || !meta) return <Loading error={error} />;

  if (editing) {
    return <RuleEditor rule={editing} meta={meta} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />;
  }

  return (
    <>
      <PageHeader title="Progression rules" sub="Your rules decide how loads and maxes change after each session">
        <button className="btn primary" onClick={() => setEditing(emptyRule())}><Icon name="plus" /> New rule</button>
      </PageHeader>

      <div className="card small muted">
        <strong>How rules work:</strong> after an athlete logs a session, each exercise is checked against its rule, top to bottom, and the first
        line that fits is applied to their next session. Choose a rule for a whole program in the program builder, per athlete when you assign
        a program, or per exercise in the session editor. Changes to a rule apply from the next session anyone logs.
      </div>

      <div className="list">
        {data.rules.map((r) => (
          <div key={r.id} className="rule-card">
            <button className="rule-card-main" onClick={() => setEditing(structuredClone(r))}>
              <div className="inline-form" style={{ alignItems: 'center' }}>
                <Icon name="sliders" />
                <strong className="grow">{r.name}</strong>
                <UsedBy r={r} />
              </div>
              {r.description && <div className="muted small">{r.description}</div>}
              <ul className="rule-sentences small">
                {ruleSentences(r.config).map((s, i) => <li key={i}>{s.text}</li>)}
              </ul>
            </button>
            <div className="rule-card-actions">
              <button className="btn small" onClick={() => setEditing(structuredClone(r))}><Icon name="edit" size={16} /> Edit</button>
              <button className="btn small ghost" onClick={() => setEditing({ ...structuredClone(r), id: undefined, name: `${r.name} (copy)` })}><Icon name="copy" size={16} /> Copy</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function UsedBy({ r }) {
  const parts = [];
  if (r.program_count) parts.push(`${r.program_count} program${r.program_count === 1 ? '' : 's'}`);
  if (r.athlete_count) parts.push(`${r.athlete_count} athlete${r.athlete_count === 1 ? '' : 's'}`);
  if (r.exercise_count) parts.push(`${r.exercise_count} exercise${r.exercise_count === 1 ? '' : 's'}`);
  return parts.length ? <Badge tone="ok">In use · {parts.join(', ')}</Badge> : <Badge>Not in use</Badge>;
}

function RuleEditor({ rule, meta, onClose, onSaved }) {
  const [r, setR] = useState(rule);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState([]);
  const [changed, setChanged] = useState(false); // AI rewrote it and it's not saved yet
  const [detail, setDetail] = useState(!meta.ai_enabled && !rule.id ? true : false);
  const isNew = !rule.id;
  const cfg = r.config;
  const setCfg = (patch) => setR({ ...r, config: { ...cfg, ...patch } });
  const setClause = (i, patch) => setCfg({ clauses: cfg.clauses.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const moveClause = (i, d) => {
    const list = [...cfg.clauses];
    if (i + d < 0 || i + d >= list.length) return;
    [list[i], list[i + d]] = [list[i + d], list[i]];
    setCfg({ clauses: list });
  };

  const write = async () => {
    setErr('');
    setBusy(true);
    try {
      // Changing a rule sends the current (possibly already edited) version so nothing is lost.
      const body = cfg.clauses.length ? { text, rule: r } : { text };
      const { draft } = await api('/rules/ai', { method: 'POST', body });
      setR({ ...r, name: isNew && !r.name ? draft.name : r.name || draft.name, description: draft.description, config: draft.config });
      setNotes(draft.notes || []);
      setChanged(true);
      setText('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async (e) => {
    e?.preventDefault();
    setErr('');
    if (!r.name.trim()) return setErr('Give the rule a name');
    if (!cfg.clauses.length) return setErr('Describe the rule above, or add a line under “Fine-tune”');
    try {
      if (r.id) await api(`/rules/${r.id}`, { method: 'PUT', body: r });
      else await api('/rules', { method: 'POST', body: r });
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    }
  };
  const del = async () => {
    if (!confirm(`Delete rule “${r.name}”? Programs using it will stop auto-progressing.`)) return;
    await api(`/rules/${r.id}`, { method: 'DELETE' });
    onSaved();
  };

  return (
    <form className="stack" onSubmit={save}>
      <PageHeader title={isNew ? 'New rule' : 'Edit rule'} back={{ onClick: onClose }} sub={isNew ? 'Describe it in your own words — the app turns it into a rule' : r.name} />

      <div className="card stack">
        <h3 style={{ margin: 0 }}>{isNew && !cfg.clauses.length ? 'Describe your rule' : 'Change it in plain English'}</h3>
        {meta.ai_enabled ? (
          <>
            <textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={isNew && !cfg.clauses.length ? EXAMPLES[0] : 'e.g. Make the deload 15% instead of 10%, and flag me when they miss reps twice in a row'}
            />
            {isNew && !cfg.clauses.length && !text && (
              <div className="examples">
                <span className="tiny muted">Examples — tap to use:</span>
                {EXAMPLES.map((x) => <button type="button" key={x} className="example" onClick={() => setText(x)}>{x}</button>)}
              </div>
            )}
            <button type="button" className="btn primary" disabled={busy || text.trim().length < 5} onClick={write}>
              {busy ? 'Working it out…' : cfg.clauses.length ? '✨ Update rule' : '✨ Write rule'}
            </button>
          </>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>Plain-English editing needs the AI key (ANTHROPIC_API_KEY) set in Render. You can still edit the rule under “Fine-tune” below.</p>
        )}
        {err && <p className="error">{err}</p>}
      </div>

      {cfg.clauses.length > 0 && (
        <div className={`card stack${changed ? ' highlight' : ''}`}>
          <div className="inline-form" style={{ alignItems: 'center' }}>
            <h3 className="grow" style={{ margin: 0 }}>What this rule does</h3>
            {changed && <Badge tone="warn">Not saved yet</Badge>}
          </div>
          <label>Name<input required value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></label>
          <label>Description<textarea rows={2} value={r.description || ''} onChange={(e) => setR({ ...r, description: e.target.value })} /></label>
          <ol className="rule-sentences numbered">
            {ruleSentences(cfg).map((s, i) => <li key={i}>{s.label ? <strong>{s.label}: </strong> : null}{s.text}</li>)}
          </ol>
          {notes.length > 0 && (
            <div className="import-warn">
              <strong className="small"><Icon name="alert" size={16} /> Worth knowing</strong>
              <ul className="small">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}
          <p className="tiny faint" style={{ margin: 0 }}>Checked top to bottom after each logged session; the first line that fits is used.</p>
        </div>
      )}

      {isNew && !cfg.clauses.length && (
        <label className="card">
          Or start from a ready-made rule
          <select value="" onChange={(e) => { const p = meta.presets[e.target.value]; if (p) { setR({ name: p.name, description: p.description, config: structuredClone(p.config) }); setChanged(true); } }}>
            <option value="">Choose…</option>
            {meta.presets.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
          </select>
        </label>
      )}

      <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setDetail(!detail)} aria-expanded={detail}>
        <Icon name={detail ? 'up' : 'down'} size={16} /> Fine-tune the details
      </button>
      {detail && (
        <div className="card stack rule-editor">
          {cfg.clauses.map((c, i) => (
            <div key={i} className="clause">
              <div className="clause-head">
                <strong>{i + 1}</strong>
                <input className="grow" value={c.label || ''} onChange={(e) => setClause(i, { label: e.target.value })} placeholder="Label (e.g. Too easy)" />
                <button type="button" className="icon-btn" onClick={() => moveClause(i, -1)} aria-label="Move up"><Icon name="up" size={16} /></button>
                <button type="button" className="icon-btn" onClick={() => moveClause(i, 1)} aria-label="Move down"><Icon name="down" size={16} /></button>
                <button type="button" className="icon-btn" onClick={() => setCfg({ clauses: cfg.clauses.filter((_, j) => j !== i) })} aria-label="Delete line"><Icon name="trash" size={16} /></button>
              </div>
              <div className="muted small">If all of these are true…</div>
              {c.when.map((w, k) => (
                <div key={k} className="cond">
                  <select value={w.metric} onChange={(e) => setClause(i, { when: c.when.map((x, j) => (j === k ? { ...x, metric: e.target.value } : x)) })}>
                    {Object.entries(meta.metrics).map(([m, d]) => <option key={m} value={m} title={d}>{METRIC_LABELS[m] || m}</option>)}
                  </select>
                  <select className="op" value={w.op} onChange={(e) => setClause(i, { when: c.when.map((x, j) => (j === k ? { ...x, op: e.target.value } : x)) })}>
                    {meta.ops.map((o) => <option key={o}>{o}</option>)}
                  </select>
                  <input className="num" type="number" step="any" value={w.value} onChange={(e) => setClause(i, { when: c.when.map((x, j) => (j === k ? { ...x, value: e.target.value } : x)) })} />
                  <button type="button" className="icon-btn" onClick={() => setClause(i, { when: c.when.filter((_, j) => j !== k) })} aria-label="Remove condition"><Icon name="trash" size={16} /></button>
                  <div className="cond-help muted small">{meta.metrics[w.metric]}</div>
                </div>
              ))}
              <button type="button" className="btn small ghost" onClick={() => setClause(i, { when: [...c.when, { metric: 'avg_rir', op: '>=', value: 2 }] })}>+ condition</button>
              <div className="muted small">…then</div>
              <Actions list={c.then} meta={meta} onChange={(then) => setClause(i, { then })} />
            </div>
          ))}
          <button type="button" className="btn ghost" onClick={() => setCfg({ clauses: [...cfg.clauses, newClause()] })}>+ Add a line</button>

          <div className="clause">
            <strong>Otherwise (nothing above fits)</strong>
            <Actions list={cfg.otherwise || []} meta={meta} onChange={(otherwise) => setCfg({ otherwise })} />
          </div>
          {isNew && !cfg.clauses.length && (
            <label>Name<input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></label>
          )}
        </div>
      )}

      <div className="save-bar">
        <button className="btn primary" disabled={busy}>Save rule</button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <span className="grow" />
        {r.id && <button type="button" className="btn danger ghost" onClick={del}>Delete</button>}
      </div>
    </form>
  );
}

function Actions({ list, meta, onChange }) {
  const set = (k, patch) => onChange(list.map((a, j) => (j === k ? { ...a, ...patch } : a)));
  const noValue = ['hold', 'max_from_e1rm', 'reset_load_adjustment', 'reset_streaks', 'flag_coach'];
  return (
    <>
      {list.map((a, k) => (
        <div key={k} className="cond">
          <select value={a.action} onChange={(e) => set(k, { action: e.target.value })}>
            {Object.entries(meta.actions).map(([v, d]) => <option key={v} value={v}>{d}</option>)}
          </select>
          {!noValue.includes(a.action) && (
            <input className="num" type="number" step="any" value={a.value ?? ''} onChange={(e) => set(k, { value: e.target.value })} placeholder="±" />
          )}
          {a.action === 'flag_coach' && <input value={a.message || ''} onChange={(e) => set(k, { message: e.target.value })} placeholder="Message" />}
          <button type="button" className="icon-btn" onClick={() => onChange(list.filter((_, j) => j !== k))} aria-label="Remove action"><Icon name="trash" size={16} /></button>
        </div>
      ))}
      <button type="button" className="btn small ghost" onClick={() => onChange([...list, { action: 'adjust_load_kg', value: 2.5 }])}>+ action</button>
    </>
  );
}

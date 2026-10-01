import { useState } from 'react';
import { api } from '../api.js';
import { useApi } from '../util.js';
import { Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';

const emptyRule = () => ({ name: '', description: '', config: { clauses: [newClause()], otherwise: [{ action: 'hold' }] } });
function newClause() {
  return { label: '', when: [{ metric: 'all_reps_completed', op: '==', value: 1 }], then: [{ action: 'adjust_load_kg', value: 2.5 }] };
}

export default function Rules() {
  const { data, error, reload } = useApi('/rules');
  const { data: meta } = useApi('/rules/meta');
  const [editing, setEditing] = useState(null);

  if (!data || !meta) return <Loading error={error} />;

  return (
    <>
      <PageHeader title="Progression rules" sub="Your rules decide how loads and maxes change after each session">
        <button className="btn primary" onClick={() => setEditing(emptyRule())}><Icon name="plus" /> New rule</button>
      </PageHeader>

      {editing && <RuleEditor rule={editing} meta={meta} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}

      <div className="card small muted">
        <strong>How rules work:</strong> after an athlete logs a session, each exercise is checked against its rule.
        Clauses are checked top to bottom and the first one where <em>every</em> condition is true is applied; if none match, “otherwise” runs.
        Attach a rule to an athlete’s program assignment, or override it per exercise in the session editor.
      </div>

      <div className="list">
        {data.rules.map((r) => (
          <div key={r.id} className="row wrap">
            <Icon name="sliders" />
            <div className="grow">
              <strong>{r.name}</strong>
              {r.description && <div className="muted small">{r.description}</div>}
              <ol className="rule-summary small">
                {r.config.clauses.map((c, i) => (
                  <li key={i}>
                    <span className="muted">If</span> {c.when.map((w) => `${w.metric.replaceAll('_', ' ')} ${w.op} ${w.value}`).join(' and ')}{' '}
                    <span className="muted">→</span> {c.then.map((a) => actionText(a, meta)).join(', ')}
                  </li>
                ))}
                {r.config.otherwise?.length > 0 && (
                  <li><span className="muted">Otherwise →</span> {r.config.otherwise.map((a) => actionText(a, meta)).join(', ')}</li>
                )}
              </ol>
            </div>
            <button className="btn small" onClick={() => setEditing(structuredClone(r))}>Edit</button>
            <button className="btn small ghost" onClick={() => setEditing({ ...structuredClone(r), id: undefined, name: `${r.name} (copy)` })}>Copy</button>
          </div>
        ))}
      </div>
    </>
  );
}

function actionText(a, meta) {
  const label = { hold: 'hold', adjust_load_kg: 'load', adjust_load_pct: 'load', adjust_max_kg: 'max', adjust_max_pct: 'max' }[a.action];
  if (a.action === 'hold') return 'hold';
  if (a.action.endsWith('_kg')) return `${label} ${a.value >= 0 ? '+' : ''}${a.value} kg`;
  if (a.action.endsWith('_pct')) return `${label} ${a.value >= 0 ? '+' : ''}${a.value}%`;
  if (a.action === 'flag_coach') return `flag: “${a.message || ''}”`;
  return meta.actions[a.action] || a.action;
}

function RuleEditor({ rule, meta, onClose, onSaved }) {
  const [r, setR] = useState(rule);
  const [err, setErr] = useState('');
  const cfg = r.config;
  const setCfg = (patch) => setR({ ...r, config: { ...cfg, ...patch } });
  const setClause = (i, patch) => setCfg({ clauses: cfg.clauses.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const moveClause = (i, d) => {
    const list = [...cfg.clauses];
    if (i + d < 0 || i + d >= list.length) return;
    [list[i], list[i + d]] = [list[i + d], list[i]];
    setCfg({ clauses: list });
  };

  const save = async (e) => {
    e.preventDefault();
    setErr('');
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
    <form className="card stack rule-editor" onSubmit={save}>
      <h3>{r.id ? 'Edit rule' : 'New rule'}</h3>
      <div className="grid2">
        <label>Name<input required value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></label>
        <label>Description<input value={r.description || ''} onChange={(e) => setR({ ...r, description: e.target.value })} /></label>
      </div>
      {!r.id && (
        <label>
          Start from a preset
          <select value="" onChange={(e) => { const p = meta.presets[e.target.value]; if (p) setR({ name: p.name, description: p.description, config: structuredClone(p.config) }); }}>
            <option value="">—</option>
            {meta.presets.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
          </select>
        </label>
      )}

      {cfg.clauses.map((c, i) => (
        <div key={i} className="clause">
          <div className="clause-head">
            <strong>Clause {i + 1}</strong>
            <input className="grow" value={c.label || ''} onChange={(e) => setClause(i, { label: e.target.value })} placeholder="Label (e.g. Too easy)" />
            <button type="button" className="icon-btn" onClick={() => moveClause(i, -1)} aria-label="Move up"><Icon name="up" size={16} /></button>
            <button type="button" className="icon-btn" onClick={() => moveClause(i, 1)} aria-label="Move down"><Icon name="down" size={16} /></button>
            <button type="button" className="icon-btn" onClick={() => setCfg({ clauses: cfg.clauses.filter((_, j) => j !== i) })} aria-label="Delete clause"><Icon name="trash" size={16} /></button>
          </div>
          <div className="muted small">If all of these are true…</div>
          {c.when.map((w, k) => (
            <div key={k} className="cond">
              <select value={w.metric} onChange={(e) => setClause(i, { when: c.when.map((x, j) => (j === k ? { ...x, metric: e.target.value } : x)) })}>
                {Object.entries(meta.metrics).map(([m, d]) => <option key={m} value={m} title={d}>{m.replaceAll('_', ' ')}</option>)}
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
      <button type="button" className="btn ghost" onClick={() => setCfg({ clauses: [...cfg.clauses, newClause()] })}>+ Add clause</button>

      <div className="clause">
        <strong>Otherwise (no clause matched)</strong>
        <Actions list={cfg.otherwise || []} meta={meta} onChange={(otherwise) => setCfg({ otherwise })} />
      </div>

      {err && <p className="error">{err}</p>}
      <div className="row-actions">
        <button className="btn primary">Save rule</button>
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

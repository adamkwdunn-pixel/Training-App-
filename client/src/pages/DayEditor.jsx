import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { CATEGORIES, LOAD_TYPES, describeRx, useApi } from '../util.js';
import { Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';

const blankRx = (ex) => ({
  key: Math.random().toString(36).slice(2),
  exercise_id: ex.id,
  block: '',
  sets: ex.metric === 'load' ? 3 : 4,
  reps: ex.metric === 'load' ? '5' : '1',
  load_type: ex.metric === 'load' ? 'rir' : 'none',
  percent: '',
  rir: ex.metric === 'load' ? 2 : '',
  rpe: '',
  fixed_load: '',
  target: '',
  target_value: '',
  rest_seconds: ex.category === 'speed' ? 120 : 150,
  tempo: '',
  notes: '',
  progression: 'inherit',
  rule_id: '',
});

export default function DayEditor() {
  const { id, dayId } = useParams();
  const nav = useNavigate();
  const { data, error } = useApi(`/programs/${id}`);
  const { data: exData } = useApi('/exercises');
  const { data: ruleData } = useApi('/rules');
  const [day, setDay] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState('');

  const program = data?.program;
  const source = program?.days.find((d) => String(d.id) === dayId);
  useEffect(() => {
    if (source) {
      setDay({ ...source, prescriptions: source.prescriptions.map((r) => ({ ...r, key: String(r.id) })) });
      setDirty(false);
    }
  }, [source?.id, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const h = (e) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const exById = useMemo(() => Object.fromEntries((exData?.exercises || []).map((e) => [e.id, e])), [exData]);

  if (!program || !day) return <Loading error={error || (data && !source ? 'Session not found' : null)} />;

  const change = (patch) => {
    setDay({ ...day, ...patch });
    setDirty(true);
    setStatus('');
  };
  const setRx = (i, patch) => change({ prescriptions: day.prescriptions.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const move = (i, dir) => {
    const list = [...day.prescriptions];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    change({ prescriptions: list });
  };
  const remove = (i) => change({ prescriptions: day.prescriptions.filter((_, j) => j !== i) });
  const add = (exId) => {
    const ex = exById[exId];
    if (!ex) return;
    const rx = { ...blankRx(ex), exercise_name: ex.name };
    change({ prescriptions: [...day.prescriptions, rx] });
    setOpen(rx.key);
    setAdding('');
  };

  const save = async () => {
    setStatus('Saving…');
    try {
      await api(`/days/${day.id}`, { method: 'PUT', body: day });
      setDirty(false);
      setStatus('Saved ✓');
    } catch (e) {
      setStatus(e.message);
    }
  };

  const ordered = program.days;
  const idx = ordered.findIndex((d) => d.id === day.id);
  const go = (d) => {
    if (dirty && !confirm('You have unsaved changes. Leave anyway?')) return;
    nav(`/coach/programs/${program.id}/days/${d.id}`);
  };

  return (
    <>
      <PageHeader title={`Week ${day.week} · Day ${day.day}`} back={`/coach/programs/${program.id}`} sub={program.name}>
        {idx > 0 && <button className="btn ghost small" onClick={() => go(ordered[idx - 1])}>← Prev</button>}
        {idx < ordered.length - 1 && <button className="btn ghost small" onClick={() => go(ordered[idx + 1])}>Next →</button>}
      </PageHeader>

      <div className="card stack">
        <label>Session title<input value={day.title || ''} onChange={(e) => change({ title: e.target.value })} placeholder="e.g. Lower strength + acceleration" /></label>
        <label>Session notes<textarea rows={2} value={day.notes || ''} onChange={(e) => change({ notes: e.target.value })} placeholder="Warm-up, focus, anything the athlete should know" /></label>
      </div>

      <div className="rx-list">
        {day.prescriptions.map((r, i) => {
          const ex = exById[r.exercise_id] || {};
          const isOpen = open === r.key;
          return (
            <div key={r.key} className={`rx-card ${isOpen ? 'open' : ''}`}>
              <div className="rx-head" onClick={() => setOpen(isOpen ? null : r.key)}>
                <div className="grow">
                  <div>{r.block && <span className="block-tag">{r.block}</span>}<strong>{ex.name || r.exercise_name}</strong></div>
                  <div className="muted small">{describeRx(r) || 'Tap to set sets, reps and load'}</div>
                </div>
                <div className="rx-tools" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn" onClick={() => move(i, -1)} aria-label="Move up"><Icon name="up" size={16} /></button>
                  <button className="icon-btn" onClick={() => move(i, 1)} aria-label="Move down"><Icon name="down" size={16} /></button>
                  <button className="icon-btn" onClick={() => remove(i)} aria-label="Remove"><Icon name="trash" size={16} /></button>
                </div>
              </div>
              {isOpen && <RxForm r={r} ex={ex} rules={ruleData?.rules || []} onChange={(patch) => setRx(i, patch)} exercises={exData?.exercises || []} />}
            </div>
          );
        })}
      </div>

      <div className="card inline-form">
        <select value={adding} onChange={(e) => add(Number(e.target.value))}>
          <option value="">+ Add exercise…</option>
          {CATEGORIES.map((c) => {
            const list = (exData?.exercises || []).filter((e) => e.category === c);
            return list.length ? (
              <optgroup key={c} label={c[0].toUpperCase() + c.slice(1)}>
                {list.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
        <Link to="/coach/exercises" className="small">Manage library</Link>
      </div>

      <div className="save-bar">
        <span className="small muted">{status || (dirty ? 'Unsaved changes' : '')}</span>
        <button className="btn primary" onClick={save} disabled={!dirty}>Save session</button>
      </div>
    </>
  );
}

function RxForm({ r, ex, rules, onChange, exercises }) {
  const f = (k) => ({ value: r[k] ?? '', onChange: (e) => onChange({ [k]: e.target.value }) });
  const isLoad = ex.metric === 'load';
  return (
    <div className="rx-form">
      <div className="grid3">
        <label>
          Exercise
          <select value={r.exercise_id} onChange={(e) => onChange({ exercise_id: Number(e.target.value) })}>
            {exercises.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label>Block / order<input {...f('block')} placeholder="A1, B2, Speed…" /></label>
        <label>Sets<input type="number" inputMode="numeric" min={0} {...f('sets')} /></label>
        <label>{isLoad || ex.metric === 'reps' ? 'Reps' : 'Reps / efforts'}<input {...f('reps')} placeholder="5, 3-5, 8/side" /></label>
        <label>
          Load
          <select {...f('load_type')}>
            {Object.entries(LOAD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {r.load_type === 'percent' && <label>% of max<input type="number" inputMode="decimal" step="0.5" {...f('percent')} /></label>}
        {(r.load_type === 'rir' || r.load_type === 'percent') && (
          <label>{r.load_type === 'percent' ? 'Target RIR (optional)' : 'Reps in reserve'}<input type="number" inputMode="decimal" step="0.5" min={0} {...f('rir')} /></label>
        )}
        {r.load_type === 'rpe' && <label>RPE<input type="number" inputMode="decimal" step="0.5" min={5} max={10} {...f('rpe')} /></label>}
        {r.load_type === 'fixed' && <label>Weight (kg)<input type="number" inputMode="decimal" step="0.5" {...f('fixed_load')} /></label>}
        <label>Target / distance<input {...f('target')} placeholder={ex.category === 'speed' ? '30 m from 3-pt start' : 'e.g. bar speed > 0.8 m/s'} /></label>
        {!isLoad && (
          <label>Target number {ex.metric === 'time' ? '(s)' : ''}<input type="number" inputMode="decimal" step="0.01" {...f('target_value')} placeholder="Used by rules" /></label>
        )}
        <label>Rest (s)<input type="number" inputMode="numeric" {...f('rest_seconds')} /></label>
        {isLoad && <label>Tempo<input {...f('tempo')} placeholder="31X1" /></label>}
      </div>
      <label>Coaching notes<input {...f('notes')} placeholder="Cues, intent, variations" /></label>
      <div className="grid2">
        <label>
          Progression for this exercise
          <select {...f('progression')}>
            <option value="inherit">Use the athlete’s program rule</option>
            <option value="rule">Use a specific rule</option>
            <option value="none">No auto-progression</option>
          </select>
        </label>
        {r.progression === 'rule' && (
          <label>
            Rule
            <select {...f('rule_id')}>
              <option value="">Choose…</option>
              {rules.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

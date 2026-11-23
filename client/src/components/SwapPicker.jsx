import { useState } from 'react';
import { api } from '../api.js';
import { useApi } from '../util.js';
import ExerciseFields from './ExerciseFields.jsx';
import Icon from './Icon.jsx';

/**
 * Pick a substitute for an accessory: from the coach's library (same category first), or add a new exercise.
 * Main movements can't be picked. Same sets, reps and effort target; the load comes from the new exercise's history.
 */
export default function SwapPicker({ r0, athleteId, onPick, onProgramSwap, onCancel, programOnly = false }) {
  const { data } = useApi('/exercises');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(null);
  const [chosen, setChosen] = useState(null); // exercise picked, waiting for "today" or "whole program"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const original = r0.swapped_from_name || r0.exercise_name;

  const pick = (exercise) => {
    setErr('');
    setChosen(exercise);
  };
  const today = async () => {
    setBusy(true);
    setErr('');
    try {
      const { prescription } = await api(`/athletes/${athleteId}/rx/${r0.id}/swap?exercise_id=${chosen.id}`);
      onPick(prescription);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  const wholeProgram = async () => {
    setBusy(true);
    setErr('');
    try {
      await onProgramSwap(chosen.id);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { exercise } = await api('/exercises', { method: 'POST', body: adding });
      if (exercise.main) throw new Error(`${exercise.name} is a main movement, so it can’t be used as a swap`);
      setAdding(null);
      setBusy(false);
      pick(exercise);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  const options = (data?.exercises || [])
    .filter((x) => !x.main && x.id !== r0.exercise_id && x.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a.category === r0.category ? 0 : 1) - (b.category === r0.category ? 0 : 1) || a.name.localeCompare(b.name));

  return (
    <div className="swap-picker stack">
      <div className="inline-form" style={{ alignItems: 'center' }}>
        <strong className="grow small">Swap {r0.exercise_name}</strong>
        <button type="button" className="btn small ghost" onClick={onCancel}>Cancel</button>
      </div>
      {chosen ? (
        <div className="stack swap-choice">
          <p className="small" style={{ margin: 0 }}>Swap <strong>{r0.exercise_name}</strong> for <strong>{chosen.name}</strong>…</p>
          {!programOnly && <button type="button" className="btn primary" disabled={busy} onClick={today}>Just for today</button>}
          <button type="button" className={`btn${programOnly ? ' primary' : ''}`} disabled={busy} onClick={wholeProgram}>For the rest of my program</button>
          <p className="tiny muted" style={{ margin: 0 }}>
            “Rest of my program” puts {chosen.name} in place of {original} in every session of this program, for you only. You can switch back any time; your coach is told.
          </p>
          <button type="button" className="btn small ghost" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => setChosen(null)}>Back</button>
        </div>
      ) : adding ? (
        <form className="stack" onSubmit={add}>
          <ExerciseFields value={adding} onChange={setAdding} cuesLabel="Notes / cues (optional)" />
          <div className="row-actions" style={{ marginTop: 0 }}>
            <button className="btn primary small" disabled={busy || !adding.name.trim()}>{busy ? 'Adding…' : 'Add & swap'}</button>
            <button type="button" className="btn ghost small" onClick={() => setAdding(null)}>Back</button>
          </div>
        </form>
      ) : (
        <>
          <input className="search" placeholder="Search exercises…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="swap-options">
            {!data && <p className="muted small">Loading…</p>}
            {options.slice(0, 40).map((x) => (
              <button type="button" key={x.id} className="swap-option" disabled={busy} onClick={() => pick(x)}>
                <span>{x.name}</span>
                <span className="tiny muted">{x.category === r0.category ? 'similar' : x.category}</span>
              </button>
            ))}
            {data && !options.length && <p className="muted small">No match{q ? ` for “${q}”` : ''}.</p>}
          </div>
          <button type="button" className="btn small" onClick={() => setAdding({ name: q.trim(), category: r0.category || 'strength', metric: r0.metric || 'load', demo_url: '', cues: '' })}>
            <Icon name="plus" size={14} /> Add a new exercise{q.trim() ? ` “${q.trim()}”` : ''}
          </button>
          <p className="tiny muted" style={{ margin: 0 }}>Same sets, reps and effort as programmed. {programOnly ? 'This changes every session of this program, for you only.' : 'Next you’ll choose: just today, or the rest of your program.'}</p>
        </>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

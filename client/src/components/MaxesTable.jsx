import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { fmtKg } from '../util.js';

/** Current 1RM / training max and rule-driven load adjustments per exercise. */
export default function MaxesTable({ athleteId, states, exercises, onChange }) {
  const { user } = useAuth();
  const isCoach = user.role === 'coach';
  const [editing, setEditing] = useState(null); // exercise id
  const [vals, setVals] = useState({ max: '', load_offset: '' });
  const [adding, setAdding] = useState('');

  const start = (s) => {
    setEditing(s.exercise_id);
    setVals({ max: s.max ?? '', load_offset: s.load_offset ?? 0 });
  };
  const save = async (exerciseId) => {
    await api(`/athletes/${athleteId}/state/${exerciseId}`, { method: 'PUT', body: vals });
    setEditing(null);
    setAdding('');
    onChange?.();
  };

  const loadExercises = (exercises || []).filter((e) => e.metric === 'load' && !states.some((s) => s.exercise_id === e.id));
  const rows = states.filter((s) => s.metric === 'load' || s.max != null);

  return (
    <div className="stack">
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Exercise</th><th>Max</th><th>Load adj.</th><th>Streak</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="muted">No maxes yet — add one so % and RIR loads can be calculated.</td></tr>
            )}
            {rows.map((s) => (
              <tr key={s.exercise_id}>
                <td>{s.exercise_name}</td>
                {editing === s.exercise_id ? (
                  <>
                    <td><input className="num" type="number" step="0.5" inputMode="decimal" value={vals.max} onChange={(e) => setVals({ ...vals, max: e.target.value })} /></td>
                    <td>
                      {isCoach
                        ? <input className="num" type="number" step="0.5" inputMode="decimal" value={vals.load_offset} onChange={(e) => setVals({ ...vals, load_offset: e.target.value })} />
                        : fmtKg(s.load_offset)}
                    </td>
                    <td />
                    <td><button className="btn small primary" onClick={() => save(s.exercise_id)}>Save</button></td>
                  </>
                ) : (
                  <>
                    <td>{fmtKg(s.max)}</td>
                    <td>{s.load_offset ? `${s.load_offset > 0 ? '+' : ''}${s.load_offset} kg` : '—'}</td>
                    <td className="small">{s.success_streak ? `✓ ${s.success_streak}` : s.fail_streak ? `✗ ${s.fail_streak}` : '—'}</td>
                    <td><button className="btn small ghost" onClick={() => start(s)}>Edit</button></td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loadExercises.length > 0 && (
        <div className="inline-form">
          <select value={adding} onChange={(e) => { setAdding(e.target.value); setVals({ max: '', load_offset: 0 }); }}>
            <option value="">+ Add a max…</option>
            {loadExercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {adding && (
            <>
              <input className="num" type="number" step="0.5" inputMode="decimal" placeholder="kg" value={vals.max} onChange={(e) => setVals({ ...vals, max: e.target.value })} />
              <button className="btn small primary" disabled={!vals.max} onClick={() => save(adding)}>Add</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

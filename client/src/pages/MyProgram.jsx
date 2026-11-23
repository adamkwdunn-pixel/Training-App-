import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import SwapPicker from '../components/SwapPicker.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../App.jsx';
import { fmtDate, useApi } from '../util.js';
import { Empty, Loading, PageHeader } from '../components/Bits.jsx';

export default function MyProgram() {
  const { user } = useAuth();
  const { data, error, reload } = useApi(`/athletes/${user.id}/plan`);
  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHeader title="My program" />
      {data.assignments.length === 0 && <Empty>No program assigned yet.</Empty>}
      {data.assignments.map((asg) => {
        const weeks = [...new Set(asg.days.map((d) => d.week))];
        return (
          <div key={asg.id}>
            <h2>{asg.program_name}</h2>
            {asg.description && <p className="muted small">{asg.description}</p>}
            <BlockSwaps athleteId={user.id} asg={asg} onChange={reload} />
            {weeks.map((w) => (
              <section key={w}>
                <h3>Week {w}</h3>
                <div className="list">
                  {asg.days.filter((d) => d.week === w).map((d) => (
                    <Link key={d.id} to={d.log_id ? `/logs/${d.log_id}` : `/session/${d.id}`} className="row">
                      <span className={`dotmark ${d.log_id ? 'done' : ''}`} />
                      <div className="grow">
                        <strong>Day {d.day}</strong> · {d.title}
                        <div className="muted small">{d.exercise_count} exercises{d.done_on ? ` · done ${fmtDate(d.done_on)}` : ''}</div>
                      </div>
                      {asg.next_day?.id === d.id && <span className="badge info">Next</span>}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        );
      })}
    </>
  );
}

/** Swap an accessory for every session of this program (this athlete only), without having to start a workout. */
function BlockSwaps({ athleteId, asg, onChange }) {
  const { data, reload } = useApi(`/athletes/${athleteId}/assignments/${asg.id}/accessories`);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(null);
  const [msg, setMsg] = useState('');
  if (!data || !data.accessories.length) return null;
  const swapped = data.accessories.filter((x) => x.swap_id);

  const swap = async (acc, exerciseId) => {
    const out = await api(`/athletes/${athleteId}/swaps`, { method: 'POST', body: { prescription_id: acc.prescription_id, exercise_id: exerciseId } });
    const sw = out.swaps.find((x) => x.from_exercise_id === acc.exercise_id && x.assignment_id === asg.id);
    setMsg(sw ? `✓ ${acc.exercise_name} → ${sw.to_name} in ${out.sessions} session${out.sessions === 1 ? '' : 's'}. Your coach has been told.` : '');
    setPicking(null);
    reload();
    onChange?.();
  };
  const undo = async (acc) => {
    await api(`/athletes/${athleteId}/swaps/${acc.swap_id}`, { method: 'DELETE' });
    setMsg(`✓ ${acc.exercise_name} is back in your program.`);
    reload();
    onChange?.();
  };

  return (
    <div className="card stack block-swaps">
      <button type="button" className="inline-form block-swaps-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="copy" />
        <span className="grow" style={{ textAlign: 'left' }}>
          <strong>Swap an exercise for this block</strong>
          <span className="small muted" style={{ display: 'block' }}>
            {swapped.length ? swapped.map((x) => `${x.exercise_name} → ${x.swapped_to}`).join(', ') : 'Change an accessory in every session of this program'}
          </span>
        </span>
        <Icon name={open ? 'up' : 'down'} size={16} />
      </button>
      {msg && <p className="small" style={{ margin: 0 }}>{msg}</p>}
      {open && (
        <div className="list">
          {data.accessories.map((acc) => (
            <div key={acc.exercise_id} className="stack" style={{ gap: 8 }}>
              <div className="row">
                <div className="grow small">
                  <strong>{acc.swapped_to || acc.exercise_name}</strong>
                  <div className="tiny muted">
                    {acc.swapped_to ? `Swapped in for ${acc.exercise_name} · ` : ''}{acc.sessions} session{acc.sessions === 1 ? '' : 's'}
                  </div>
                </div>
                {acc.swap_id && <button type="button" className="btn small ghost" onClick={() => undo(acc)}>Switch back</button>}
                {picking !== acc.exercise_id && <button type="button" className="btn small" onClick={() => setPicking(acc.exercise_id)}>Swap</button>}
              </div>
              {picking === acc.exercise_id && (
                <SwapPicker
                  programOnly
                  athleteId={athleteId}
                  r0={{ id: acc.prescription_id, exercise_id: acc.exercise_id, exercise_name: acc.swapped_to || acc.exercise_name, swapped_from_name: acc.swapped_to ? acc.exercise_name : null, category: acc.category, metric: acc.metric }}
                  onProgramSwap={(exId) => swap(acc, exId)}
                  onCancel={() => setPicking(null)}
                />
              )}
            </div>
          ))}
          <p className="tiny muted" style={{ margin: 0 }}>Main lifts stay as your coach wrote them. Swaps keep the same sets, reps and effort, and only change your program.</p>
        </div>
      )}
    </div>
  );
}

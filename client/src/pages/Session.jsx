import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, uploadVideo } from '../api.js';
import { useAuth } from '../App.jsx';
import { describeRx, today, useApi } from '../util.js';
import { Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';
import ExerciseFields from '../components/ExerciseFields.jsx';
import { nextSetLoad, targetRirOf } from '../../../shared/effort.js';

const draftKey = (a, d) => `session-draft-${a}-${d}`;
const readDraft = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const writeDraft = (k, v) => {
  try {
    if (v) localStorage.setItem(k, JSON.stringify(v));
    else localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
};

function rowsFor(r) {
  const n = Math.max(1, Number(r.sets) || 1);
  const reps = parseInt(r.reps, 10);
  return Array.from({ length: n }, () => ({
    done: false,
    weight: r.target_load ?? (r.load_type === 'fixed' ? r.fixed_load : '') ?? '',
    reps: Number.isNaN(reps) ? '' : reps,
    rir: '',
    time_seconds: '',
    result: '',
  }));
}
function initialRows(day) {
  return Object.fromEntries(day.prescriptions.map((r) => [r.id, rowsFor(r)]));
}

/**
 * In-session (tactical) adjustment: the last completed set with weight, reps and RIR sets the weight
 * for the remaining sets, unless the athlete typed their own weight for a set.
 */
function reflow(list, r, autoreg) {
  if (r.metric !== 'load' || !autoreg?.enabled) return { list, advice: null };
  let k = -1;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].done) { k = i; break; }
  if (k < 0) return { list, advice: null };
  const advice = nextSetLoad(list[k], r, autoreg);
  if (!advice) {
    const needsRir = targetRirOf(r) != null && list[k].rir === '' && k < list.length - 1;
    return { list, advice: needsRir ? { direction: 'missing', reason: `Add your RIR for set ${k + 1} and the app will set the weight for set ${k + 2}.` } : null };
  }
  const out = list.map((s, j) => (j > k && !s.done && !s.manual
    ? { ...s, weight: advice.load, suggested_load: advice.load, adjust_note: advice.direction === 'hold' ? '' : advice.reason, adjust_dir: advice.direction }
    : s));
  return { list: out, advice: { ...advice, next: out.findIndex((s, j) => j > k && !s.done) } };
}

export default function Session() {
  const { dayId, athleteId: paramAthlete } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const athleteId = paramAthlete || user.id;
  const { data, error } = useApi(`/athletes/${athleteId}/days/${dayId}`);
  const key = draftKey(athleteId, dayId);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({ performed_on: today(), session_rpe: '', notes: '' });
  const [videos, setVideos] = useState({}); // prescription id -> File
  const [swaps, setSwaps] = useState({}); // prescription id -> swapped-in prescription (accessories only)
  const [swapping, setSwapping] = useState(null); // prescription id with the swap picker open
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [timer, setTimer] = useState(null); // { end, total }

  useEffect(() => {
    if (!data) return;
    const draft = readDraft(key);
    setRows(draft?.rows || initialRows(data.day));
    if (draft?.meta) setMeta(draft.meta);
    if (draft?.swaps) setSwaps(draft.swaps);
  }, [data, key]);

  useEffect(() => {
    if (rows) writeDraft(key, { rows, meta, swaps });
  }, [rows, meta, swaps, key]);

  if (!data || !rows) return <Loading error={error} />;
  const day = data.day;
  const isCoach = user.role === 'coach';

  const eff = (r) => swaps[r.id] || r; // the exercise actually being done today
  const rxById = (id) => { const r = day.prescriptions.find((x) => x.id === Number(id)); return r && eff(r); };
  const applySwap = (r, swapped) => {
    setSwaps((cur) => {
      const next = { ...cur };
      if (swapped) next[r.id] = swapped;
      else delete next[r.id];
      return next;
    });
    setRows({ ...rows, [r.id]: rowsFor(swapped || r) });
    setSwapping(null);
  };
  const update = (rxId, list) => setRows({ ...rows, [rxId]: reflow(list, rxById(rxId), data.autoreg).list });
  const setSet = (rxId, i, patch) => {
    const list = rows[rxId];
    // Typing a weight for a set that hasn't been done yet means "I'll choose this one myself".
    const manual = 'weight' in patch && !list[i].done ? { manual: true } : {};
    update(rxId, list.map((s, j) => (j === i ? { ...s, ...patch, ...manual } : s)));
  };
  const addSet = (rxId) => {
    const list = rows[rxId] || [];
    const last = list[list.length - 1] || {};
    update(rxId, [...list, { ...last, done: false, manual: false }]);
  };
  const toggleDone = (r, i) => {
    const s = rows[r.id][i];
    update(r.id, rows[r.id].map((x, j) => (j === i ? { ...x, done: !x.done } : x)));
    if (!s.done && r.rest_seconds) setTimer({ end: Date.now() + r.rest_seconds * 1000, total: r.rest_seconds });
  };

  const doneCount = Object.values(rows).flat().filter((s) => s.done).length;

  const submit = async () => {
    const sets = [];
    for (const r0 of day.prescriptions) {
      const r = eff(r0);
      (rows[r0.id] || []).forEach((s, i) => {
        if (!s.done) return;
        sets.push({
          prescription_id: r0.id, exercise_id: r.exercise_id, set_number: i + 1, target_load: r.target_load,
          weight: s.weight, reps: s.reps, rir: s.rir, time_seconds: s.time_seconds, result: s.result,
          suggested_load: s.suggested_load ?? null, adjust_note: s.adjust_note || null,
        });
      });
    }
    if (!sets.length) {
      setStatus('Tick off at least one set first.');
      return;
    }
    setStatus('Saving…');
    try {
      const out = await api('/logs', {
        method: 'POST',
        body: { athlete_id: athleteId, assignment_id: data.assignment_id, day_id: day.id, sets, ...meta },
      });
      const files = Object.entries(videos).filter(([, f]) => f);
      for (let i = 0; i < files.length; i++) {
        const [rxId, file] = files[i];
        const rx = rxById(rxId);
        await uploadVideo(file, { athlete_id: athleteId, exercise_id: rx?.exercise_id, workout_log_id: out.id }, (p) =>
          setStatus(`Uploading video ${i + 1}/${files.length} — ${Math.round(p * 100)}%`),
        );
      }
      writeDraft(key, null);
      setResult(out);
      setStatus('');
    } catch (e) {
      setStatus(e.message);
    }
  };

  if (result) {
    return (
      <div className="stack">
        <PageHeader title="Session saved 💪" />
        {result.events.length > 0 ? (
          <div className="card events">
            <strong>Your program updated:</strong>
            {result.events.map((e, i) => (
              <div key={i} className="small"><strong>{e.exercise}:</strong> {e.summary}</div>
            ))}
          </div>
        ) : (
          <p className="muted">Nice work. Your coach will see this session.</p>
        )}
        <div className="row-actions">
          <Link className="btn primary" to={`/logs/${result.id}`}>View session</Link>
          <button className="btn" onClick={() => nav(isCoach ? `/athletes/${athleteId}?tab=program` : '/')}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title={day.title || `Week ${day.week} · Day ${day.day}`} back={isCoach ? `/athletes/${athleteId}?tab=program` : '/program'} sub={`Week ${day.week} · Day ${day.day}${isCoach ? ' · logging for athlete' : ''}`} />
      {day.notes && <p className="card small">{day.notes}</p>}
      {!data.assignment_id && <p className="error">This session isn’t part of an active program for this athlete.</p>}

      {day.prescriptions.map((r0) => {
        const r = eff(r0);
        const advice = reflow(rows[r0.id], r, data.autoreg).advice;
        return (
        <section key={r0.id} className="card ex-card">
          <div className="ex-head">
            <div className="grow">
              <div>{r.block && <span className="block-tag">{r.block}</span>}<strong>{r.exercise_name}</strong></div>
              {swaps[r0.id] && <div className="tiny muted">Swapped in for {r0.exercise_name} today · <button type="button" className="link-btn" onClick={() => applySwap(r0, null)}>undo</button></div>}
              <div className="small muted">{describeRx(r)}</div>
              {r0.swappable && !swaps[r0.id] && swapping !== r0.id && (
                <button type="button" className="btn small ghost swap-btn" onClick={() => setSwapping(r0.id)}><Icon name="copy" size={14} /> Swap exercise</button>
              )}
            </div>
            {r.target_load != null && (
              <div className="target" title={r.load_basis}>
                <div className="target-kg">{r.target_load}<small>kg</small></div>
                <div className="muted tiny">{r.load_basis}</div>
              </div>
            )}
            {r.target_load == null && r.load_basis === 'needs max' && <div className="muted tiny">No max set — pick a weight</div>}
          </div>
          {swapping === r0.id && (
            <SwapPicker r0={r0} athleteId={athleteId} onPick={(p) => applySwap(r0, p)} onCancel={() => setSwapping(null)} />
          )}
          {r.notes && <div className="small">📝 {r.notes}</div>}
          {r.cues && <div className="small muted">Cues: {r.cues}</div>}
          {r.demo_url && <a className="small" href={r.demo_url} target="_blank" rel="noreferrer">Watch demo ↗</a>}
          {r.last_time?.length > 0 && (
            <div className="tiny muted">
              Last time: {r.last_time.map((s) => (r.metric === 'load' ? `${s.weight ?? '—'}×${s.reps ?? '—'}${s.rir != null ? `@${s.rir}` : ''}` : r.metric === 'time' ? `${s.time_seconds}s` : r.metric === 'reps' ? s.reps : s.result)).join(', ')}
            </div>
          )}

          <div className={`sets ${r.metric === 'load' ? 'load' : 'effort'}`}>
            <div className="set-row head">
              <span>#</span>
              {r.metric === 'load' ? (<><span>kg</span><span>Reps</span><span>RIR</span></>) : (<><span>{r.metric === 'time' ? 'Time (s)' : r.metric === 'height' ? 'cm' : r.metric === 'distance' ? 'm' : r.metric === 'velocity' ? 'm/s' : 'Reps'}</span></>)}
              <span>Done</span>
            </div>
            {rows[r.id].map((s, i) => (
              <div key={i} className={`set-row ${s.done ? 'done' : ''}`}>
                <span className="set-n">{i + 1}</span>
                {r.metric === 'load' ? (
                  <>
                    <input
                      className={!s.done && !s.manual && s.adjust_note ? `auto-${s.adjust_dir}` : ''}
                      type="number" inputMode="decimal" step="0.5" value={s.weight ?? ''} onChange={(e) => setSet(r.id, i, { weight: e.target.value })} aria-label="Weight" />
                    <input type="number" inputMode="numeric" value={s.reps ?? ''} onChange={(e) => setSet(r.id, i, { reps: e.target.value })} aria-label="Reps" />
                    <select value={s.rir} onChange={(e) => setSet(r.id, i, { rir: e.target.value })} aria-label="Reps in reserve">
                      <option value="">–</option>
                      {[0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </>
                ) : r.metric === 'time' ? (
                  <input type="number" inputMode="decimal" step="0.01" value={s.time_seconds} onChange={(e) => setSet(r.id, i, { time_seconds: e.target.value })} aria-label="Time in seconds" />
                ) : r.metric === 'reps' ? (
                  <input type="number" inputMode="numeric" value={s.reps ?? ''} onChange={(e) => setSet(r.id, i, { reps: e.target.value })} aria-label="Reps" />
                ) : (
                  <input type="number" inputMode="decimal" step="0.01" value={s.result} onChange={(e) => setSet(r.id, i, { result: e.target.value })} aria-label="Result" />
                )}
                <button type="button" className={`check-btn ${s.done ? 'on' : ''}`} onClick={() => toggleDone(r, i)} aria-label={`Set ${i + 1} done`}>
                  <Icon name="check" />
                </button>
              </div>
            ))}
          </div>
          {advice && advice.next !== -1 && (
            <div className={`autoreg ${advice.direction}`} role="status">
              <strong>{advice.direction === 'up' ? '↑' : advice.direction === 'down' ? '↓' : advice.direction === 'hold' ? '✓' : 'ℹ'}</strong>
              <span>
                {advice.direction === 'missing' ? advice.reason : (
                  <>Set {advice.next + 1}: <strong>{rows[r.id][advice.next].weight} kg</strong>{' · '}{advice.reason}
                    {rows[r.id][advice.next].manual ? ' (you chose your own weight for this set)' : ''}</>
                )}
              </span>
            </div>
          )}
          <div className="ex-foot">
            <button type="button" className="btn small ghost" onClick={() => addSet(r.id)}>+ set</button>
            <label className="btn small ghost file-btn">
              <Icon name="camera" size={16} /> {videos[r.id] ? 'Video ✓' : 'Add video'}
              <input type="file" accept="video/*" capture="environment" onChange={(e) => setVideos({ ...videos, [r.id]: e.target.files?.[0] })} />
            </label>
          </div>
        </section>
        );
      })}

      <section className="card stack">
        <div className="grid2">
          <label>Date<input type="date" value={meta.performed_on} onChange={(e) => setMeta({ ...meta, performed_on: e.target.value })} /></label>
          <label>
            Session RPE (1–10)
            <select value={meta.session_rpe} onChange={(e) => setMeta({ ...meta, session_rpe: e.target.value })}>
              <option value="">–</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
        </div>
        <label>Notes for your coach<textarea rows={2} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} placeholder="How did it feel? Any niggles?" /></label>
      </section>

      <div className="save-bar">
        <span className="small muted">{status || `${doneCount} sets ticked`}</span>
        <button className="btn primary" onClick={submit} disabled={status === 'Saving…' || status.startsWith('Uploading')}>Finish session</button>
      </div>

      {timer && <RestTimer timer={timer} onClose={() => setTimer(null)} />}
    </>
  );
}

/**
 * Pick a substitute for an accessory: from the coach's library (same category first), or add a new exercise.
 * Main movements can't be picked. Same sets, reps and effort target; the load comes from the new exercise's history.
 */
function SwapPicker({ r0, athleteId, onPick, onCancel }) {
  const { data } = useApi('/exercises');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (exerciseId) => {
    setBusy(true);
    setErr('');
    try {
      const { prescription } = await api(`/athletes/${athleteId}/rx/${r0.id}/swap?exercise_id=${exerciseId}`);
      onPick(prescription);
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
      await pick(exercise.id);
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
        <strong className="grow small">Swap {r0.exercise_name} for today</strong>
        <button type="button" className="btn small ghost" onClick={onCancel}>Cancel</button>
      </div>
      {adding ? (
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
              <button type="button" key={x.id} className="swap-option" disabled={busy} onClick={() => pick(x.id)}>
                <span>{x.name}</span>
                <span className="tiny muted">{x.category === r0.category ? 'similar' : x.category}</span>
              </button>
            ))}
            {data && !options.length && <p className="muted small">No match{q ? ` for “${q}”` : ''}.</p>}
          </div>
          <button type="button" className="btn small" onClick={() => setAdding({ name: q.trim(), category: r0.category || 'strength', metric: r0.metric || 'load', demo_url: '', cues: '' })}>
            <Icon name="plus" size={14} /> Add a new exercise{q.trim() ? ` “${q.trim()}”` : ''}
          </button>
          <p className="tiny muted" style={{ margin: 0 }}>Same sets, reps and effort as programmed. Your coach sees what you swapped.</p>
        </>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

function RestTimer({ timer, onClose }) {
  const [now, setNow] = useState(Date.now());
  const buzzed = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((timer.end - now) / 1000));
  useEffect(() => {
    if (left === 0 && !buzzed.current) {
      buzzed.current = true;
      navigator.vibrate?.([200, 100, 200]);
    }
  }, [left]);
  return (
    <button className={`rest-timer ${left === 0 ? 'over' : ''}`} onClick={onClose} aria-label="Dismiss rest timer">
      <span className="tiny">Rest</span>
      <strong>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</strong>
      <span className="tiny">{left === 0 ? 'Go!' : 'tap to close'}</span>
    </button>
  );
}


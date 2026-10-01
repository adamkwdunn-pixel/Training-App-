import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uploadVideo } from '../api.js';
import { useAuth } from '../App.jsx';
import { fmtDate, today, useApi } from '../util.js';
import { Badge, Loading } from './Bits.jsx';
import Icon from './Icon.jsx';

const kg = (n) => (n == null ? '—' : Math.round(n * 10) / 10);

/** Main-lift testing board for one athlete: current rep maxes, e1RM, max-lift videos, history. */
export default function TestingView({ athleteId }) {
  const { user } = useAuth();
  const { data, error, reload } = useApi(`/athletes/${athleteId}/tests`);
  const { data: ex } = useApi('/exercises');
  const [logging, setLogging] = useState(null); // exercise id
  const [extra, setExtra] = useState('');
  if (!data) return <Loading error={error} />;
  const bw = data.bodyweight;
  const used = new Set([...data.lifts, ...data.other].map((l) => l.exercise.id));

  const card = (l) => (
    <LiftCard
      key={l.exercise.id} l={l} bw={bw} athleteId={athleteId} isCoach={user.role === 'coach'}
      logging={logging === l.exercise.id} onLog={() => setLogging(logging === l.exercise.id ? null : l.exercise.id)}
      onSaved={() => { setLogging(null); reload(); }} onChange={reload}
    />
  );

  return (
    <>
      {!bw && <p className="small muted">Add a bodyweight in Nutrition → Bodyweight to see relative strength.</p>}
      <div className="tiles">{data.lifts.map(card)}</div>
      {data.other.length > 0 && (<><h2>Other tests</h2><div className="tiles">{data.other.map(card)}</div></>)}
      {extra && !used.has(Number(extra)) && (
        <div className="tiles">
          {card({ exercise: ex.exercises.find((e) => e.id === Number(extra)), latest: null, best: null, history: [], last_video: null })}
        </div>
      )}
      <div className="card soft inline-form">
        <select value={extra} onChange={(e) => { setExtra(e.target.value); setLogging(Number(e.target.value)); }}>
          <option value="">+ Test another lift…</option>
          {ex?.exercises.filter((e) => e.metric === 'load' && !used.has(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
    </>
  );
}

function LiftCard({ l, bw, athleteId, isCoach, logging, onLog, onSaved, onChange }) {
  const [showHistory, setShowHistory] = useState(false);
  const best = l.best;
  const latest = l.latest;
  const verify = async (t) => {
    await api(`/tests/${t.id}`, { method: 'PATCH', body: { verified: !t.verified } });
    onChange();
  };
  const del = async (t) => {
    if (!confirm(`Delete the ${t.weight} kg × ${t.reps} test from ${t.tested_on}?`)) return;
    await api(`/tests/${t.id}`, { method: 'DELETE' });
    onChange();
  };
  return (
    <div className="card lift-card">
      <div className="lift-top">
        <div>
          <div className="lift-name">{l.exercise.name}</div>
          {latest ? (
            <div className="small muted">{latest.reps === 1 ? '1RM' : `${latest.reps}RM`} {kg(latest.weight)} kg · {fmtDate(latest.tested_on)}</div>
          ) : <div className="small muted">Not tested yet</div>}
        </div>
        <div className="lift-e1rm">
          <div className="num-big">{best ? kg(best.e1rm) : '—'}<span className="small muted" style={{ marginLeft: 3 }}>kg</span></div>
          <div className="tiny muted">best est. 1RM</div>
        </div>
      </div>
      {best && (
        <div className="lift-meta">
          {bw ? <span>{(best.e1rm / bw).toFixed(2)} × BW</span> : null}
          <span>Best: {kg(best.weight)} × {best.reps}</span>
          {latest?.verified ? <Badge tone="ok">Verified</Badge> : latest && <Badge>Unverified</Badge>}
        </div>
      )}
      <div className="row-actions" style={{ marginTop: 0 }}>
        {l.last_video && (
          <Link className="btn small" to={`/videos/${l.last_video.video_id}`}><Icon name="play" size={16} /> Last max video</Link>
        )}
        <button className={`btn small ${logging ? '' : 'primary'}`} onClick={onLog}>{logging ? 'Cancel' : <><Icon name="plus" size={16} /> Log test</>}</button>
        {l.history.length > 0 && <button className="btn small ghost" onClick={() => setShowHistory(!showHistory)}>History ({l.history.length})</button>}
      </div>
      {logging && <TestForm exercise={l.exercise} athleteId={athleteId} onSaved={onSaved} />}
      {showHistory && (
        <div className="history">
          {l.history.map((t) => (
            <div key={t.id} className="history-row">
              <span className="grow tabular"><strong>{kg(t.weight)} × {t.reps}</strong> <span className="muted">→ {kg(t.e1rm)} · {fmtDate(t.tested_on)}</span></span>
              {t.video_id && <Link to={`/videos/${t.video_id}`} className="icon-btn" aria-label="Watch video"><Icon name="play" size={16} /></Link>}
              {isCoach && <button className={`btn small ${t.verified ? '' : 'ghost'}`} onClick={() => verify(t)}>{t.verified ? 'Verified ✓' : 'Verify'}</button>}
              <button className="icon-btn" onClick={() => del(t)} aria-label="Delete"><Icon name="trash" size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TestForm({ exercise, athleteId, onSaved }) {
  const [f, setF] = useState({ weight: '', reps: 1, tested_on: today(), notes: '', update_max: true });
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const est = f.weight && f.reps ? (Number(f.reps) === 1 ? Number(f.weight) : Number(f.weight) / (EP[f.reps] / 100)) : null;
  const submit = async (e) => {
    e.preventDefault();
    setStatus('Saving…');
    try {
      const out = await api(`/athletes/${athleteId}/tests`, { method: 'POST', body: { ...f, exercise_id: exercise.id } });
      if (file) {
        await uploadVideo(file, { athlete_id: athleteId, exercise_id: exercise.id, test_id: out.id, note: `Max test: ${f.weight} kg × ${f.reps}` }, (p) =>
          setStatus(`Uploading video ${Math.round(p * 100)}%`),
        );
      }
      onSaved();
    } catch (e2) {
      setStatus(e2.message);
    }
  };
  return (
    <form className="stack" onSubmit={submit} style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
      <div className="grid2">
        <label>Weight (kg)<input required autoFocus type="number" inputMode="decimal" step="0.5" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></label>
        <label>
          Reps
          <select value={f.reps} onChange={(e) => setF({ ...f, reps: e.target.value })}>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((r) => <option key={r} value={r}>{r === 1 ? '1 (true max)' : `${r} reps`}</option>)}
          </select>
        </label>
      </div>
      <label>Date<input type="date" value={f.tested_on} onChange={(e) => setF({ ...f, tested_on: e.target.value })} /></label>
      <label className="file-drop" style={{ padding: 16 }}>
        <Icon name="camera" />
        <span>{file ? file.name : 'Add video of the lift'}</span>
        <input type="file" accept="video/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      <label className="check"><input type="checkbox" checked={f.update_max} onChange={(e) => setF({ ...f, update_max: e.target.checked })} /> Use as my training max for programmed loads</label>
      <div className="inline-form">
        <button className="btn primary" disabled={status === 'Saving…' || status.startsWith('Uploading')}>Save test</button>
        <span className="small muted">{status || (est ? `≈ ${Math.round(est * 10) / 10} kg est. 1RM` : '')}</span>
      </div>
    </form>
  );
}

// %1RM by reps at 0 RIR (matches the server's chart).
const EP = { 1: 100, 2: 95.5, 3: 92.2, 4: 89.2, 5: 86.3, 6: 83.7, 8: 78.6, 10: 73.9 };

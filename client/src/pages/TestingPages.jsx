import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { fmtDate, useApi } from '../util.js';
import { Empty, Loading, PageHeader } from '../components/Bits.jsx';
import TestingView from '../components/Testing.jsx';

export function MyTesting() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Testing" sub="Your current rep maxes and max-lift videos" />
      <TestingView athleteId={user.id} />
    </>
  );
}

export function TestingSquad() {
  const { data, error } = useApi('/testing/squad');
  const [mode, setMode] = useState('kg');
  const nav = useNavigate();
  if (!data) return <Loading error={error} />;
  const short = (n) => n.replace('Weighted ', '').replace('Overhead Press', 'OHP').replace('Back ', '');
  return (
    <>
      <PageHeader title="Testing" sub="Best estimated 1RM on the main lifts" />
      <div className="segmented" style={{ maxWidth: 220 }}>
        <button className={mode === 'kg' ? 'on' : ''} onClick={() => setMode('kg')}>kg</button>
        <button className={mode === 'bw' ? 'on' : ''} onClick={() => setMode('bw')}>× BW</button>
      </div>
      {data.athletes.length === 0 && <Empty>No athletes yet.</Empty>}
      {data.athletes.length > 0 && (
        <div className="card" style={{ padding: '6px 8px' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Athlete</th><th>BW</th>{data.lifts.map((l) => <th key={l.id}>{short(l.name)}</th>)}</tr>
              </thead>
              <tbody>
                {data.athletes.map((a) => (
                  <tr key={a.id} className="clickable" onClick={() => nav(`/athletes/${a.id}?tab=testing`)}>
                    <td><strong>{a.name}</strong>{a.position && <div className="tiny muted">{a.position}</div>}</td>
                    <td className="muted">{a.bodyweight ?? '—'}</td>
                    {data.lifts.map((l) => {
                      const r = a.results[l.id];
                      if (!r) return <td key={l.id} className="faint">—</td>;
                      const val = mode === 'bw' ? (a.bodyweight ? (r.e1rm / a.bodyweight).toFixed(2) : '—') : Math.round(r.e1rm * 10) / 10;
                      return (
                        <td key={l.id} title={`${r.weight} kg × ${r.reps} on ${fmtDate(r.tested_on)}`}>
                          <strong>{val}</strong>{r.video_id ? ' ▶' : ''}
                          <div className="tiny muted">{r.weight}×{r.reps}{r.verified ? ' ✓' : ''}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="tiny muted">▶ = video of the lift · ✓ = verified by coach. Tap an athlete to log or verify tests.</p>
    </>
  );
}

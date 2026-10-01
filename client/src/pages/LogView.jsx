import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { fmtDate, fmtKg, useApi } from '../util.js';
import { Badge, Loading, PageHeader } from '../components/Bits.jsx';
import Thread from '../components/Thread.jsx';
import VideoUploader from '../components/VideoUploader.jsx';
import Icon from '../components/Icon.jsx';

export default function LogView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { data, error, reload } = useApi(`/logs/${id}`);
  if (!data) return <Loading error={error} />;
  const { log, sets, events, videos, athlete } = data;
  const isCoach = user.role === 'coach';

  // Group sets by exercise in logged order.
  const groups = [];
  for (const s of sets) {
    const key = `${s.prescription_id ?? 'x'}-${s.exercise_id}`;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, name: s.exercise_name, metric: s.metric, rx: s, exercise_id: s.exercise_id, sets: [] }));
    g.sets.push(s);
  }
  const exercises = groups.map((g) => ({ id: g.exercise_id, name: g.name }));

  const del = async () => {
    if (!confirm('Delete this session log? Load changes already made by rules will stay.')) return;
    await api(`/logs/${log.id}`, { method: 'DELETE' });
    nav(isCoach ? `/athletes/${log.athlete_id}?tab=log` : '/history');
  };

  return (
    <>
      <PageHeader title={log.title} back={isCoach ? `/athletes/${log.athlete_id}?tab=log` : '/history'} sub={`${isCoach ? `${athlete.name} · ` : ''}${fmtDate(log.performed_on)}${log.session_rpe != null ? ` · session RPE ${log.session_rpe}` : ''}`} />
      {log.notes && <p className="card">“{log.notes}”</p>}

      {events.length > 0 && (
        <div className="card events">
          <strong>Rule updates</strong>
          {events.map((e) => (
            <div key={e.id} className="small">
              {e.flagged ? <Icon name="flag" size={14} /> : <Icon name="sliders" size={14} />} <strong>{e.exercise_name}:</strong> {e.summary} <span className="muted">({e.rule_name} · {e.matched})</span>
            </div>
          ))}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.key} className="card">
          <h3>{g.name}</h3>
          {g.rx.rx_reps && (
            <div className="muted small">
              Prescribed {[g.rx.rx_sets, g.rx.rx_reps].filter(Boolean).join(' × ')}
              {g.rx.load_type === 'percent' && g.rx.percent ? ` @ ${g.rx.percent}%` : ''}
              {g.rx.load_type === 'rir' && g.rx.rx_rir != null ? ` @ ${g.rx.rx_rir} RIR` : ''}
              {g.rx.load_type === 'rpe' && g.rx.rx_rpe != null ? ` @ RPE ${g.rx.rx_rpe}` : ''}
              {g.rx.rx_target ? ` · ${g.rx.rx_target}` : ''}
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                {g.metric === 'load' ? (
                  <tr><th>Set</th><th>Target</th><th>Weight</th><th>Reps</th><th>RIR</th><th>e1RM</th></tr>
                ) : (
                  <tr><th>Set</th><th>{g.metric === 'time' ? 'Time (s)' : 'Result'}</th><th>Reps</th><th>Notes</th></tr>
                )}
              </thead>
              <tbody>
                {g.sets.map((s) => g.metric === 'load' ? (
                  <tr key={s.id}>
                    <td>{s.set_number}</td><td className="muted">{fmtKg(s.target_load)}</td><td>{fmtKg(s.weight)}</td>
                    <td>{s.reps ?? '—'}</td><td>{s.rir ?? '—'}</td><td className="muted">{fmtKg(s.e1rm)}</td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td>{s.set_number}</td><td>{g.metric === 'time' ? s.time_seconds ?? '—' : s.result ?? '—'}</td><td>{s.reps ?? '—'}</td><td className="small">{s.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section>
        <h2>Form-check videos</h2>
        {videos.length === 0 && <p className="muted small">No videos for this session.</p>}
        <div className="list">
          {videos.map((v) => (
            <Link key={v.id} to={`/videos/${v.id}`} className="row">
              <Icon name="play" />
              <div className="grow">{v.exercise_name || 'General'} {v.status === 'pending' ? <Badge tone="info">To review</Badge> : <Badge tone="ok">Reviewed</Badge>}</div>
            </Link>
          ))}
        </div>
        {!isCoach && <VideoUploader exercises={exercises} workoutLogId={log.id} onDone={reload} />}
      </section>

      <section>
        <h2>Session feedback</h2>
        <Thread athleteId={log.athlete_id} type="workout" targetId={log.id} placeholder={isCoach ? 'Feedback on this session…' : 'How did it go?'} />
      </section>

      <div className="row-actions">
        <span className="grow" />
        <button className="btn danger ghost" onClick={del}>Delete log</button>
      </div>
    </>
  );
}

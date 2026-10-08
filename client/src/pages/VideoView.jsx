import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, videoDownload, videoSrc } from '../api.js';
import { useAuth } from '../App.jsx';
import { fmtDate, useApi } from '../util.js';
import { Badge, Loading, PageHeader } from '../components/Bits.jsx';
import Thread from '../components/Thread.jsx';
import Icon from '../components/Icon.jsx';

const RATES = [0.25, 0.5, 1];

export default function VideoView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { data, error, reload } = useApi(`/videos/${id}`);
  const ref = useRef(null);
  const [rate, setRate] = useState(1);

  if (!data) return <Loading error={error} />;
  const v = data.video;
  const isCoach = user.role === 'coach';

  const setSpeed = (r) => {
    setRate(r);
    if (ref.current) ref.current.playbackRate = r;
  };
  const step = (frames) => {
    if (!ref.current) return;
    ref.current.pause();
    ref.current.currentTime = Math.max(0, ref.current.currentTime + frames / 30);
  };
  const toggleReviewed = async () => {
    await api(`/videos/${v.id}`, { method: 'PATCH', body: { status: v.status === 'pending' ? 'reviewed' : 'pending' } });
    reload();
  };
  const del = async () => {
    if (!confirm('Delete this video?')) return;
    await api(`/videos/${v.id}`, { method: 'DELETE' });
    nav('/videos');
  };

  return (
    <>
      <PageHeader title={v.exercise_name || 'Form check'} back="/videos" sub={`${isCoach ? `${v.athlete_name} · ` : ''}${fmtDate(v.created_at)}`}>
        {v.status === 'pending' ? <Badge tone="info">To review</Badge> : <Badge tone="ok">Reviewed</Badge>}
      </PageHeader>
      <div className="video-wrap">
        <video ref={ref} src={videoSrc(v.id)} controls playsInline preload="metadata" />
      </div>
      <div className="video-controls">
        {RATES.map((r) => <button key={r} className={`btn small ${rate === r ? 'primary' : ''}`} onClick={() => setSpeed(r)}>{r}×</button>)}
        <button className="btn small" onClick={() => step(-1)}>◀ frame</button>
        <button className="btn small" onClick={() => step(1)}>frame ▶</button>
        <a className="btn small" href={videoDownload(v.id)} download><Icon name="download" size={16} /> Download</a>
      </div>
      {!v.test_label && v.exercise_id && <p className="tiny muted" style={{ margin: 0 }}>Only the latest {v.exercise_name} video is kept — a new upload replaces this one.</p>}
      {v.test_label && <p className="small"><span className="badge solid">Max test</span> {v.test_label}</p>}
      {v.note && <p className="card flat">“{v.note}”</p>}
      {v.cues && <p className="small muted">Cues: {v.cues}</p>}
      {v.workout_log_id && <p className="small"><Link to={`/logs/${v.workout_log_id}`}>View the session this was filmed in →</Link></p>}

      <section>
        <h2>Feedback</h2>
        <Thread athleteId={v.athlete_id} type="video" targetId={v.id} since={v.created_at} placeholder={isCoach ? 'What did you see? Cues for next time…' : 'Reply to your coach…'} />
      </section>

      <div className="row-actions">
        {isCoach && <button className="btn" onClick={toggleReviewed}>{v.status === 'pending' ? 'Mark reviewed' : 'Mark as to review'}</button>}
        <span className="grow" />
        <button className="btn danger ghost" onClick={del}>Delete video</button>
      </div>
    </>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { fmtDate, useApi } from '../util.js';
import { Badge, Empty, Loading, PageHeader } from '../components/Bits.jsx';
import VideoUploader from '../components/VideoUploader.jsx';
import Icon from '../components/Icon.jsx';

export default function Videos() {
  const { user } = useAuth();
  const isCoach = user.role === 'coach';
  const [status, setStatus] = useState(isCoach ? 'pending' : '');
  const { data, error, reload } = useApi(`/videos${status ? `?status=${status}` : ''}`);
  const { data: ex } = useApi(isCoach ? null : '/exercises');

  return (
    <>
      <PageHeader title={isCoach ? 'Form checks' : 'My form checks'} sub={isCoach ? 'Videos your athletes have sent' : 'Film a set and send it to your coach'} />
      {!isCoach && <VideoUploader exercises={ex?.exercises} onDone={reload} />}
      <div className="segmented">
        {[['pending', 'To review'], ['reviewed', 'Reviewed'], ['', 'All']].map(([v, l]) => (
          <button key={v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>{l}</button>
        ))}
      </div>
      {!data ? <Loading error={error} /> : data.videos.length === 0 ? (
        <Empty>{isCoach && status === 'pending' ? 'No videos waiting for review.' : 'No videos yet.'}</Empty>
      ) : (
        <div className="list">
          {data.videos.map((v) => (
            <Link key={v.id} to={`/videos/${v.id}`} className="row">
              <Icon name="play" />
              <div className="grow">
                {isCoach && <strong>{v.athlete_name} — </strong>}
                {v.exercise_name || 'General'}{' '}
                {v.status === 'pending' ? <Badge tone="info">{isCoach ? 'To review' : 'Waiting'}</Badge> : <Badge tone="ok">Reviewed</Badge>}
                {v.comment_count > 0 && <span className="muted small"> · {v.comment_count} comments</span>}
                {v.note && <div className="muted small clamp">“{v.note}”</div>}
              </div>
              <span className="muted small">{fmtDate(v.created_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

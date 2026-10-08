import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, videoDownload } from '../api.js';
import { useAuth } from '../App.jsx';
import { fmtDate, useApi } from '../util.js';
import { Badge, Empty, Loading, PageHeader } from '../components/Bits.jsx';
import VideoUploader from '../components/VideoUploader.jsx';
import Icon from '../components/Icon.jsx';

const QUICK = ['Looks good 👍 keep it up', 'Good — brace harder before each rep', 'Nice — control the lowering'];

export default function Videos() {
  const { user } = useAuth();
  const isCoach = user.role === 'coach';
  const [status, setStatus] = useState(isCoach ? 'pending' : '');
  const { data, error, reload } = useApi(`/videos${status ? `?status=${status}` : ''}`);
  const { data: ex } = useApi(isCoach ? null : '/exercises');

  return (
    <>
      <PageHeader title={isCoach ? 'Form checks' : 'My form checks'} sub={isCoach ? 'The latest video for each athlete and exercise' : 'Film a set and send it to your coach'} />
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
          {data.videos.map((v) => <VideoCard key={v.id} v={v} isCoach={isCoach} onReplied={reload} />)}
        </div>
      )}
    </>
  );
}

/** One form check: watch, download, and (for the coach) a quick text reply for minor fixes. */
function VideoCard({ v, isCoach, onReplied }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState('');

  const send = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('/comments', { method: 'POST', body: { athlete_id: v.athlete_id, target_type: 'video', target_id: v.id, body: text.trim() } });
      setSent(text.trim());
      setText('');
      setTimeout(onReplied, 1200); // leave the confirmation visible briefly before the list refreshes
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card fc-card">
      <Link to={`/videos/${v.id}`} className="fc-head">
        <Icon name="play" />
        <div className="grow">
          {isCoach && <strong>{v.athlete_name} — </strong>}
          <strong>{v.exercise_name || 'General'}</strong>{' '}
          {v.status === 'pending' ? <Badge tone="info">{isCoach ? 'To review' : 'Waiting'}</Badge> : <Badge tone="ok">Reviewed</Badge>}
          {v.note && <div className="muted small clamp">“{v.note}”</div>}
        </div>
        <span className="muted small">{fmtDate(v.created_at)}</span>
      </Link>
      {v.last_comment && (
        <div className="fc-last small"><span className="muted">{v.last_comment_author}:</span> {v.last_comment}</div>
      )}
      <div className="fc-actions">
        <Link className="btn small" to={`/videos/${v.id}`}><Icon name="play" size={16} /> Watch{v.comment_count > 0 ? ` · ${v.comment_count} messages` : ''}</Link>
        <a className="btn small ghost" href={videoDownload(v.id)} download><Icon name="download" size={16} /> Download</a>
      </div>
      {isCoach && (
        sent ? <p className="small" style={{ margin: 0 }}>✓ Sent to {v.athlete_name.split(' ')[0]}: “{sent}”</p> : (
          <>
            <div className="quick-reply">
              <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Quick reply…" aria-label={`Reply to ${v.athlete_name}`} />
              <button className="btn primary small" disabled={busy || !text.trim()} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
            </div>
            {!text && (
              <div className="quick-chips">
                {QUICK.map((qr) => <button key={qr} type="button" onClick={() => setText(qr)}>{qr}</button>)}
              </div>
            )}
            {err && <p className="error">{err}</p>}
          </>
        )
      )}
    </div>
  );
}

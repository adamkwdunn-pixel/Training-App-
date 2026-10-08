import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useApi } from '../util.js';

const utc = (t) => new Date(`${String(t).replace(' ', 'T')}Z`);

/**
 * Feedback thread between coach and athlete, on a workout, a video, or general.
 * `since`: when the current video was uploaded — earlier messages were about a previous video.
 */
export default function Thread({ athleteId, type = 'general', targetId, placeholder, since }) {
  const { user } = useAuth();
  const qs = new URLSearchParams({ athlete_id: athleteId, target_type: type, ...(targetId ? { target_id: targetId } : {}) });
  const { data, reload } = useApi(`/comments?${qs}`);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await api('/comments', { method: 'POST', body: { athlete_id: athleteId, target_type: type, target_id: targetId, body } });
      setBody('');
      reload();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="thread">
      {data?.comments?.length === 0 && <p className="muted small">No messages yet.</p>}
      {data?.comments?.map((c, i, all) => (
        <div key={c.id} style={{ display: 'contents' }}>
        {since && utc(c.created_at) >= utc(since) && (i === 0 || utc(all[i - 1].created_at) < utc(since)) && i > 0 && (
          <div className="thread-divider tiny muted">New video uploaded — messages above were about the previous one</div>
        )}
        <div className={`bubble ${c.author_id === user.id ? 'mine' : ''} ${c.author_role === 'coach' ? 'coach' : ''}${since && utc(c.created_at) < utc(since) ? ' earlier' : ''}`}>
          <div className="bubble-meta">
            {c.author_name} · {new Date(`${c.created_at.replace(' ', 'T')}Z`).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="bubble-body">{c.body}</div>
        </div>
        </div>
      ))}
      {since && data?.comments?.length > 0 && utc(data.comments.at(-1).created_at) < utc(since) && (
        <div className="thread-divider tiny muted">New video uploaded — messages above were about the previous one</div>
      )}
      <form className="thread-form" onSubmit={send}>
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder || (user.role === 'coach' ? 'Write feedback…' : 'Message your coach…')}
        />
        <button className="btn primary" disabled={busy || !body.trim()}>Send</button>
      </form>
      {err && <p className="error">{err}</p>}
    </div>
  );
}

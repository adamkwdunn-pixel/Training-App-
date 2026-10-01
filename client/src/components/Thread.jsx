import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useApi } from '../util.js';

/** Feedback thread between coach and athlete, on a workout, a video, or general. */
export default function Thread({ athleteId, type = 'general', targetId, placeholder }) {
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
      {data?.comments?.map((c) => (
        <div key={c.id} className={`bubble ${c.author_id === user.id ? 'mine' : ''} ${c.author_role === 'coach' ? 'coach' : ''}`}>
          <div className="bubble-meta">
            {c.author_name} · {new Date(`${c.created_at.replace(' ', 'T')}Z`).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="bubble-body">{c.body}</div>
        </div>
      ))}
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

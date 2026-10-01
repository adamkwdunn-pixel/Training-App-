import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { fmtDate, useApi } from '../util.js';
import { Empty, Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';

export default function CoachHome() {
  const { user } = useAuth();
  const { data, error, reload } = useApi('/inbox');
  if (!data) return <Loading error={error} />;
  const nothing = !data.logs.length && !data.videos.length && !data.flags.length && !data.messages.length;

  const resolve = async (id) => {
    await api(`/events/${id}/resolve`, { method: 'POST' });
    reload();
  };

  return (
    <>
      <PageHeader title={`Hi ${user.name.split(' ')[0]}`} sub="What needs your attention" />
      {nothing && (
        <Empty>
          All caught up. Share your team code <strong className="code">{user.invite_code}</strong> so athletes can join, then
          build a <Link to="/programs">program</Link>.
        </Empty>
      )}

      {data.videos.length > 0 && (
        <section>
          <h2>Form checks to review <span className="count">{data.videos.length}</span></h2>
          <div className="list">
            {data.videos.map((v) => (
              <Link key={v.id} to={`/videos/${v.id}`} className="row">
                <Icon name="play" />
                <div className="grow">
                  <strong>{v.athlete_name}</strong> — {v.exercise_name || 'General'}
                  {v.note && <div className="muted small">“{v.note}”</div>}
                </div>
                <span className="muted small">{fmtDate(v.created_at)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {data.flags.length > 0 && (
        <section>
          <h2>Flagged by your rules <span className="count warn">{data.flags.length}</span></h2>
          <div className="list">
            {data.flags.map((f) => (
              <div key={f.id} className="row">
                <Icon name="flag" />
                <div className="grow">
                  <strong>{f.athlete_name}</strong> — {f.exercise_name}
                  <div className="small">{f.summary}</div>
                  {f.workout_log_id && <Link className="small" to={`/logs/${f.workout_log_id}`}>View session</Link>}
                </div>
                <button className="btn small" onClick={() => resolve(f.id)}>Done</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.messages.length > 0 && (
        <section>
          <h2>Messages <span className="count">{data.messages.length}</span></h2>
          <div className="list">
            {data.messages.map((m) => (
              <Link key={m.id} className="row" to={m.target_type === 'video' ? `/videos/${m.target_id}` : m.target_type === 'workout' ? `/logs/${m.target_id}` : `/athletes/${m.athlete_id}?tab=messages`}>
                <Icon name="chat" />
                <div className="grow">
                  <strong>{m.athlete_name}</strong>
                  <div className="small clamp">{m.body}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {data.logs.length > 0 && (
        <section>
          <h2>New sessions logged <span className="count">{data.logs.length}</span></h2>
          <div className="list">
            {data.logs.map((l) => (
              <Link key={l.id} to={`/logs/${l.id}`} className="row">
                <Icon name="check" />
                <div className="grow">
                  <strong>{l.athlete_name}</strong> — {l.title}
                  {l.session_rpe != null && <span className="muted small"> · sRPE {l.session_rpe}</span>}
                </div>
                <span className="muted small">{fmtDate(l.performed_on)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

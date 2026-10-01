import { Link } from 'react-router-dom';
import { fmtDate, useApi } from '../util.js';
import { Empty, Loading, PageHeader } from '../components/Bits.jsx';

export default function History() {
  const { data, error } = useApi('/logs');
  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHeader title="Training log" />
      {data.logs.length === 0 && <Empty>Your completed sessions will appear here.</Empty>}
      <div className="list">
        {data.logs.map((l) => (
          <Link key={l.id} to={`/logs/${l.id}`} className="row">
            <div className="grow">
              <strong>{l.title}</strong>
              <div className="muted small">{l.set_count} sets{l.session_rpe != null ? ` · sRPE ${l.session_rpe}` : ''}{l.comment_count ? ` · 💬 ${l.comment_count}` : ''}</div>
            </div>
            <span className="muted small">{fmtDate(l.performed_on)}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

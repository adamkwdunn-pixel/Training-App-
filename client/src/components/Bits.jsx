import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

export function PageHeader({ title, back, children, sub }) {
  return (
    <div className="page-header">
      <div className="page-title">
        {back && (
          <Link to={back} className="icon-btn" aria-label="Back">
            <Icon name="back" />
          </Link>
        )}
        <div>
          <h1>{title}</h1>
          {sub && <p className="muted small">{sub}</p>}
        </div>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function Loading({ error }) {
  return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Badge({ children, tone = '' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

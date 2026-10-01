import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useApi } from '../util.js';
import { pushStatus } from '../push.js';
import { Empty, Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';

const ICON = {
  session: 'check', form_check: 'video', message: 'chat', comment: 'chat', checkin: 'heart', reminder: 'heart',
  injury: 'alert', test: 'trophy', data: 'scale', flag: 'flag', join: 'users', program: 'calendar',
};

export function timeAgo(sqlDate) {
  const t = new Date(`${sqlDate.replace(' ', 'T')}Z`).getTime();
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function Notifications() {
  const nav = useNavigate();
  const { live } = useAuth();
  const { data, error, reload } = useApi('/notifications');
  const [push, setPush] = useState(null);
  useEffect(() => {
    pushStatus().then(setPush).catch(() => setPush('unsupported'));
  }, []);

  if (!data) return <Loading error={error} />;
  const open = async (n) => {
    if (!n.read) await api('/notifications/read', { method: 'POST', body: { ids: [n.id] } });
    live.refresh();
    if (n.link) nav(n.link);
    else reload();
  };
  const readAll = async () => {
    await api('/notifications/read', { method: 'POST', body: {} });
    reload();
    live.refresh();
  };

  return (
    <>
      <PageHeader title="Notifications">
        {data.unread > 0 && <button className="btn small" onClick={readAll}>Mark all read</button>}
        <Link to="/settings/notifications" className="icon-btn outlined" aria-label="Notification settings"><Icon name="sliders" /></Link>
      </PageHeader>

      {push && push !== 'on' && push !== 'unsupported' && (
        <Link to="/settings/notifications" className="card flat row" style={{ border: '1px solid var(--line)', marginBottom: 14 }}>
          <Icon name="bell" />
          <div className="grow">
            <strong>Get these on your phone</strong>
            <div className="small muted">{push === 'needs-install' ? 'Add the app to your home screen first, then turn on notifications.' : 'Turn on push notifications for this device.'}</div>
          </div>
          <Icon name="right" size={18} />
        </Link>
      )}

      {data.notifications.length === 0 && <Empty>Nothing yet. You’ll see sessions, form checks, messages and more here.</Empty>}
      <div className="list">
        {data.notifications.map((n) => (
          <button key={n.id} className={`row notif ${n.read ? '' : 'unread'}`} onClick={() => open(n)}>
            <span className="notif-icon"><Icon name={ICON[n.type] || 'bell'} size={18} /></span>
            <div className="grow">
              <div className="notif-title">{n.title}</div>
              {n.body && <div className="small muted clamp">{n.body}</div>}
              <div className="tiny faint">{timeAgo(n.created_at)}</div>
            </div>
            {!n.read && <span className="dot-new" />}
          </button>
        ))}
      </div>
    </>
  );
}

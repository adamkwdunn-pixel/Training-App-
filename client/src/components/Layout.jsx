import { NavLink } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import Icon from './Icon.jsx';

const COACH_NAV = [
  { to: '/', label: 'Inbox', icon: 'inbox' },
  { to: '/athletes', label: 'Athletes', icon: 'users' },
  { to: '/programs', label: 'Programs', icon: 'calendar' },
  { to: '/videos', label: 'Videos', icon: 'video' },
  { to: '/rules', label: 'Rules', icon: 'sliders', desktopOnly: false },
  { to: '/exercises', label: 'Exercises', icon: 'list', desktopOnly: true },
];
const ATHLETE_NAV = [
  { to: '/', label: 'Today', icon: 'bolt' },
  { to: '/program', label: 'Program', icon: 'calendar' },
  { to: '/videos', label: 'Form checks', icon: 'video' },
  { to: '/progress', label: 'Progress', icon: 'chart' },
  { to: '/messages', label: 'Coach', icon: 'chat' },
];

export default function Layout({ children }) {
  const { user } = useAuth();
  const nav = user.role === 'coach' ? COACH_NAV : ATHLETE_NAV;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/icon.svg" alt="" width="32" height="32" />
          <span>Squad Training</span>
        </div>
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="side-link">
              <Icon name={n.icon} /> {n.label}
            </NavLink>
          ))}
          {user.role === 'athlete' && (
            <NavLink to="/history" className="side-link"><Icon name="list" /> Training log</NavLink>
          )}
          <NavLink to="/profile" className="side-link"><Icon name="user" /> {user.name}</NavLink>
        </nav>
      </aside>
      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="" width="26" height="26" />
          <span>Squad Training</span>
        </div>
        <div className="topbar-links">
          {user.role === 'coach' && <NavLink to="/exercises" className="icon-btn" aria-label="Exercises"><Icon name="list" /></NavLink>}
          {user.role === 'athlete' && <NavLink to="/history" className="icon-btn" aria-label="Training log"><Icon name="list" /></NavLink>}
          <NavLink to="/profile" className="icon-btn" aria-label="Profile"><Icon name="user" /></NavLink>
        </div>
      </header>
      <main className="content">{children}</main>
      <nav className="tabbar">
        {nav.filter((n) => !n.desktopOnly).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="tab">
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

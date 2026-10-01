import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import Icon from './Icon.jsx';

// The app is split into sections; each has sub-pages shown as pills under the header.
const ATHLETE_SECTIONS = [
  {
    key: 'training', label: 'Training', icon: 'bolt', to: '/',
    match: ['/', '/program', '/session', '/history', '/logs', '/videos', '/progress'],
    subs: [
      { to: '/', label: 'Today' },
      { to: '/program', label: 'Program' },
      { to: '/history', label: 'Log' },
      { to: '/videos', label: 'Form checks' },
      { to: '/progress', label: 'Progress' },
    ],
  },
  {
    key: 'nutrition', label: 'Nutrition', icon: 'apple', to: '/nutrition', match: ['/nutrition'],
    subs: [{ to: '/nutrition', label: 'Food log' }, { to: '/nutrition/targets', label: 'Targets' }, { to: '/nutrition/weight', label: 'Bodyweight' }],
  },
  {
    key: 'recovery', label: 'Recovery', icon: 'heart', to: '/recovery', match: ['/recovery'],
    subs: [{ to: '/recovery', label: 'Check-in' }, { to: '/recovery/injuries', label: 'Injuries' }, { to: '/recovery/protocols', label: 'Protocols' }],
  },
  { key: 'testing', label: 'Testing', icon: 'trophy', to: '/testing', match: ['/testing'], subs: [] },
];

const COACH_SECTIONS = [
  {
    key: 'squad', label: 'Squad', icon: 'users', to: '/', match: ['/', '/athletes'],
    subs: [{ to: '/', label: 'Inbox' }, { to: '/athletes', label: 'Athletes' }],
  },
  {
    key: 'training', label: 'Training', icon: 'bolt', to: '/programs', match: ['/programs', '/videos', '/rules', '/exercises', '/logs'],
    subs: [
      { to: '/programs', label: 'Programs' },
      { to: '/videos', label: 'Form checks' },
      { to: '/rules', label: 'Progression rules' },
      { to: '/exercises', label: 'Exercises' },
    ],
  },
  { key: 'nutrition', label: 'Nutrition', icon: 'apple', to: '/nutrition', match: ['/nutrition'], subs: [] },
  {
    key: 'recovery', label: 'Recovery', icon: 'heart', to: '/recovery', match: ['/recovery'],
    subs: [{ to: '/recovery', label: 'Readiness & injuries' }, { to: '/recovery/protocols', label: 'Protocols' }],
  },
  { key: 'testing', label: 'Testing', icon: 'trophy', to: '/testing', match: ['/testing'], subs: [] },
];

function sectionFor(sections, path) {
  let best = null;
  let bestLen = -1;
  for (const s of sections) {
    for (const m of s.match) {
      const hit = m === '/' ? path === '/' : path === m || path.startsWith(`${m}/`);
      if (hit && m.length > bestLen) {
        best = s;
        bestLen = m.length;
      }
    }
  }
  return best;
}

export function Brand({ big }) {
  return (
    <div className={`brand ${big ? 'big' : ''}`}>
      <span className="brand-mark"><Icon name="ball" size={big ? 24 : 17} /></span>
      <span>Squad Training</span>
    </div>
  );
}

export default function Layout({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const sections = user.role === 'coach' ? COACH_SECTIONS : ATHLETE_SECTIONS;
  const current = sectionFor(sections, pathname);
  const subs = current?.subs || [];
  const isActiveSection = (s) => s === current;

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav>
          {sections.map((s) => (
            <div key={s.key}>
              <NavLink to={s.to} className={() => `side-link ${isActiveSection(s) ? 'active' : ''}`}>
                <Icon name={s.icon} /> {s.label}
              </NavLink>
              {isActiveSection(s) && s.subs.length > 1 && (
                <div className="side-sub">
                  {s.subs.map((n) => <NavLink key={n.to} to={n.to} end>{n.label}</NavLink>)}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          {user.role === 'athlete' && <NavLink to="/messages" className="side-link"><Icon name="chat" /> Coach chat</NavLink>}
          <NavLink to="/profile" className="side-link"><Icon name="user" /> {user.name}</NavLink>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="topbar-row">
            <Brand />
            <div className="topbar-links">
              {user.role === 'athlete' && <NavLink to="/messages" className="icon-btn" aria-label="Coach chat"><Icon name="chat" /></NavLink>}
              <NavLink to="/profile" className="icon-btn" aria-label="Profile"><Icon name="user" /></NavLink>
            </div>
          </div>
          {subs.length > 1 && (
            <nav className="subnav" aria-label={`${current.label} pages`}>
              {subs.map((n) => <NavLink key={n.to} to={n.to} end className="pill">{n.label}</NavLink>)}
            </nav>
          )}
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="tabbar">
        {sections.map((s) => (
          <NavLink key={s.key} to={s.to} className={() => `tab ${isActiveSection(s) ? 'active' : ''}`}>
            <span className="tab-icon"><Icon name={s.icon} /></span>
            <span>{s.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

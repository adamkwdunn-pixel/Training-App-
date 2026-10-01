import { useEffect } from 'react';
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
    subs: [{ to: '/nutrition', label: 'Targets' }, { to: '/nutrition/weight', label: 'Bodyweight' }, { to: '/nutrition/bodyfat', label: 'Body fat' }],
  },
  {
    key: 'recovery', label: 'Recovery', icon: 'heart', to: '/recovery', match: ['/recovery'],
    subs: [{ to: '/recovery', label: 'Check-in' }, { to: '/recovery/injuries', label: 'Injuries' }, { to: '/recovery/protocols', label: 'Protocols' }],
  },
  { key: 'testing', label: 'Testing', icon: 'trophy', to: '/testing', match: ['/testing'], subs: [] },
  // Visible to everyone, but athletes only ever get the "For coaches only" page here.
  { key: 'coach', label: 'Coach', icon: 'lock', to: '/coach', match: ['/coach'], subs: [] },
];

// The Coach tab is only ever built for coach accounts (and the API refuses everyone else).
const COACH_SECTIONS = [
  {
    key: 'training', label: 'Training', icon: 'bolt', to: '/', match: ['/', '/videos', '/logs'],
    subs: [{ to: '/', label: 'Inbox' }, { to: '/videos', label: 'Form checks' }],
  },
  { key: 'nutrition', label: 'Nutrition', icon: 'apple', to: '/nutrition', match: ['/nutrition'], subs: [] },
  { key: 'recovery', label: 'Recovery', icon: 'heart', to: '/recovery', match: ['/recovery'], subs: [] },
  { key: 'testing', label: 'Testing', icon: 'trophy', to: '/testing', match: ['/testing'], subs: [] },
  {
    key: 'coach', label: 'Coach', icon: 'clipboard', to: '/coach', match: ['/coach', '/athletes'],
    subs: [
      { to: '/coach', label: 'Programs' },
      { to: '/athletes', label: 'Athletes' },
      { to: '/coach/rules', label: 'Progression rules' },
      { to: '/coach/exercises', label: 'Exercises' },
      { to: '/coach/protocols', label: 'Protocols' },
    ],
  },
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

/** The sub-page a path belongs to: exact match, else the longest sub whose path is a prefix. */
function activeSub(subs, path) {
  let best = null;
  for (const n of subs) {
    const hit = path === n.to || (n.to !== '/' && path.startsWith(`${n.to}/`));
    if (hit && (!best || n.to.length > best.to.length)) best = n;
  }
  return best;
}

export function Brand({ big }) {
  if (big) return <img className="brand-lockup" src="/logo.png" alt="AD Rugby Coaching" />;
  return (
    <div className="brand">
      <img className="brand-mark-img" src="/logo-mark.png" alt="" />
      <span>AD Rugby Coaching</span>
    </div>
  );
}

export default function Layout({ children }) {
  const { user, live, system } = useAuth();
  const { pathname } = useLocation();
  // Re-check the unread count whenever the screen changes.
  useEffect(() => {
    live.refresh();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const bell = (cls) => (
    <NavLink to="/notifications" className={cls} aria-label={`Notifications${live.unread ? ` (${live.unread} unread)` : ''}`}>
      <span className="bell"><Icon name="bell" />{live.unread > 0 && <span className="bell-count">{live.unread > 99 ? '99+' : live.unread}</span>}</span>
      {cls === 'side-link' && 'Notifications'}
    </NavLink>
  );
  const sections = user.role === 'coach' ? COACH_SECTIONS : ATHLETE_SECTIONS;
  const current = sectionFor(sections, pathname);
  const subs = current?.subs || [];
  const sub = activeSub(subs, pathname);
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
                  {s.subs.map((n) => <NavLink key={n.to} to={n.to} className={() => (n === sub ? 'active' : '')}>{n.label}</NavLink>)}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          {bell('side-link')}
          {user.role === 'athlete' && <NavLink to="/messages" className="side-link"><Icon name="chat" /> Coach chat</NavLink>}
          <NavLink to="/profile" className="side-link"><Icon name="user" /> {user.name}</NavLink>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="topbar-row">
            <Brand />
            <div className="topbar-links">
              {bell('icon-btn')}
              {user.role === 'athlete' && <NavLink to="/messages" className="icon-btn" aria-label="Coach chat"><Icon name="chat" /></NavLink>}
              <NavLink to="/profile" className="icon-btn" aria-label="Profile"><Icon name="user" /></NavLink>
            </div>
          </div>
          {subs.length > 1 && (
            <nav className="subnav" aria-label={`${current.label} pages`}>
              {subs.map((n) => <NavLink key={n.to} to={n.to} className={() => `pill ${n === sub ? 'active' : ''}`}>{n.label}</NavLink>)}
            </nav>
          )}
        </header>
        <main className="content">
          {system?.storage?.persistent === false && (
            <NavLink to="/profile" className="storage-warning">
              <Icon name="alert" />
              <span><strong>Data isn’t being saved permanently.</strong> Anything entered now will be lost on the next update. Tap for details.</span>
            </NavLink>
          )}
          {children}
        </main>
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

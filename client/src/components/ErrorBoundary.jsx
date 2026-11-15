import { Component } from 'react';
import { getToken } from '../api.js';

/** Clear progress saved on this device for the page that broke (session drafts, unsaved editor changes). */
function clearSavedHere() {
  try {
    const path = window.location.pathname;
    const id = path.match(/(\d+)\/?$/)?.[1];
    for (const k of Object.keys(localStorage)) {
      if (id && (k.startsWith('session-draft-') || k.startsWith('day-draft-')) && k.endsWith(`-${id}`)) localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
}

/**
 * If a page fails to draw, show what to do instead of a blank screen, and tell the server so the coach
 * (and whoever maintains the app) can see what went wrong.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try {
      const token = getToken();
      fetch('/api/client-errors', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: String(error?.message || error), stack: String(error?.stack || '').slice(0, 2000), component: String(info?.componentStack || '').slice(0, 1500), path: window.location.pathname }),
      }).catch(() => {});
    } catch {
      /* best effort */
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card stack" role="alert" style={{ marginTop: 16 }}>
        <h2 style={{ margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: '1.15rem' }}>This page didn’t load properly</h2>
        <p className="small" style={{ margin: 0 }}>Your coach has been sent the details automatically. Try these:</p>
        <button className="btn primary" onClick={() => window.location.reload()}>Try again</button>
        <button className="btn" onClick={() => { clearSavedHere(); window.location.reload(); }}>Reset this page &amp; try again</button>
        <p className="tiny muted" style={{ margin: 0 }}>Reset clears any unsaved progress this phone kept for this page. Anything already saved to the app stays.</p>
        <a className="btn ghost" href="/">Go to the home page</a>
        <p className="tiny muted" style={{ margin: 0 }}>Error: {String(this.state.error?.message || this.state.error)}</p>
      </div>
    );
  }
}

import { useAuth } from '../App.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

/** What anyone who isn't a coach sees in the Coach area. */
export default function CoachOnly() {
  const { user, signIn } = useAuth();
  const switchView = async () => {
    const out = await api('/me/switch', { method: 'POST' });
    signIn(out.token, out.user);
  };
  return (
    <div className="coach-only">
      <span className="coach-only-icon"><Icon name="lock" size={30} /></span>
      <h1>For coaches only</h1>
      <p className="muted">Programs, progression models and exercise libraries are managed by your coach.</p>
      {user.linked_user_id && <button className="btn primary" onClick={switchView}>Switch to coach view</button>}
    </div>
  );
}

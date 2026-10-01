import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import CoachHome from './pages/CoachHome.jsx';
import Athletes from './pages/Athletes.jsx';
import AthleteDetail from './pages/AthleteDetail.jsx';
import Programs from './pages/Programs.jsx';
import ProgramEditor from './pages/ProgramEditor.jsx';
import DayEditor from './pages/DayEditor.jsx';
import Rules from './pages/Rules.jsx';
import Exercises from './pages/Exercises.jsx';
import Videos from './pages/Videos.jsx';
import VideoView from './pages/VideoView.jsx';
import LogView from './pages/LogView.jsx';
import AthleteHome from './pages/AthleteHome.jsx';
import MyProgram from './pages/MyProgram.jsx';
import Session from './pages/Session.jsx';
import History from './pages/History.jsx';
import Progress from './pages/Progress.jsx';
import Messages from './pages/Messages.jsx';
import Profile from './pages/Profile.jsx';
import { MyBodyFat, MyTargets, MyWeight, NutritionSquad } from './pages/NutritionPages.jsx';
import { MyCheckIn, MyInjuries, MyProtocols, ProtocolLibrary, RecoverySquad } from './pages/RecoveryPages.jsx';
import { MyTesting, TestingSquad } from './pages/TestingPages.jsx';
import Notifications from './pages/Notifications.jsx';
import NotificationSettings from './pages/NotificationSettings.jsx';
import CoachOnly from './pages/CoachOnly.jsx';
import SetPassword from './pages/SetPassword.jsx';
import { applyUpdate, useLive } from './live.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
  const live = useLive(!!me);
  const navigate = useNavigate();

  // Tapping a push notification while the app is open: go straight to the right screen.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMsg = (e) => e.data?.type === 'navigate' && navigate(e.data.url);
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [navigate]);

  // Keep the server's copy of this user's timezone current, so reminders arrive at their local time.
  useEffect(() => {
    if (!me?.user) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) api('/notifications/prefs', { method: 'PUT', body: { timezone: tz } }).catch(() => {});
  }, [me?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    if (!getToken()) return setMe(null);
    try {
      setMe(await api('/me'));
    } catch {
      setMe(null);
    }
  };

  useEffect(() => {
    refresh();
    const onExpired = () => setMe(null);
    window.addEventListener('auth-expired', onExpired);
    return () => window.removeEventListener('auth-expired', onExpired);
  }, []);

  const auth = {
    live,
    system: me?.system,
    user: me?.user,
    coach: me?.coach,
    refresh,
    signIn: (token, user) => {
      setToken(token);
      setMe({ user, coach: null });
      refresh();
    },
    signOut: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      setToken(null);
      setMe(null);
    },
  };

  const banner = live.updateReady && <UpdateBanner />;
  if (me === undefined) return <div className="splash">Loading…</div>;
  if (!me) return <AuthContext.Provider value={auth}>{banner}<Login /></AuthContext.Provider>;
  if (me.user.must_change_password) return <AuthContext.Provider value={auth}><SetPassword onDone={refresh} /></AuthContext.Provider>;

  const isCoach = me.user.role === 'coach';
  return (
    <AuthContext.Provider value={auth}>
      {banner}
      <Layout>
        <Routes>
          {isCoach ? (
            <>
              <Route path="/" element={<CoachHome />} />
              <Route path="/athletes" element={<Athletes />} />
              <Route path="/athletes/:id" element={<AthleteDetail />} />
              <Route path="/athletes/:athleteId/session/:dayId" element={<Session />} />
              <Route path="/nutrition" element={<NutritionSquad />} />
              <Route path="/recovery" element={<RecoverySquad />} />
              <Route path="/testing" element={<TestingSquad />} />
              {/* Coach tab: program building and libraries. Only exists for coach accounts. */}
              <Route path="/coach" element={<Programs />} />
              <Route path="/coach/programs/:id" element={<ProgramEditor />} />
              <Route path="/coach/programs/:id/days/:dayId" element={<DayEditor />} />
              <Route path="/coach/rules" element={<Rules />} />
              <Route path="/coach/exercises" element={<Exercises />} />
              <Route path="/coach/protocols" element={<ProtocolLibrary />} />
            </>
          ) : (
            <>
              <Route path="/" element={<AthleteHome />} />
              <Route path="/program" element={<MyProgram />} />
              <Route path="/session/:dayId" element={<Session />} />
              <Route path="/history" element={<History />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/nutrition" element={<MyTargets />} />
              <Route path="/nutrition/weight" element={<MyWeight />} />
              <Route path="/nutrition/bodyfat" element={<MyBodyFat />} />
              <Route path="/recovery" element={<MyCheckIn />} />
              <Route path="/recovery/injuries" element={<MyInjuries />} />
              <Route path="/recovery/protocols" element={<MyProtocols />} />
              <Route path="/testing" element={<MyTesting />} />
              <Route path="/coach/*" element={<CoachOnly />} />
              <Route path="/coach" element={<CoachOnly />} />
            </>
          )}
          <Route path="/videos" element={<Videos />} />
          <Route path="/videos/:id" element={<VideoView />} />
          <Route path="/logs/:id" element={<LogView />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AuthContext.Provider>
  );
}

function UpdateBanner() {
  return (
    <button className="update-banner" onClick={applyUpdate}>
      <span><strong>New version available</strong></span>
      <span className="update-btn">Update</span>
    </button>
  );
}

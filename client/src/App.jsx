import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
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

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out

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

  if (me === undefined) return <div className="splash">Loading…</div>;
  if (!me) return <AuthContext.Provider value={auth}><Login /></AuthContext.Provider>;

  const isCoach = me.user.role === 'coach';
  return (
    <AuthContext.Provider value={auth}>
      <Layout>
        <Routes>
          {isCoach ? (
            <>
              <Route path="/" element={<CoachHome />} />
              <Route path="/athletes" element={<Athletes />} />
              <Route path="/athletes/:id" element={<AthleteDetail />} />
              <Route path="/athletes/:athleteId/session/:dayId" element={<Session />} />
              <Route path="/programs" element={<Programs />} />
              <Route path="/programs/:id" element={<ProgramEditor />} />
              <Route path="/programs/:id/days/:dayId" element={<DayEditor />} />
              <Route path="/rules" element={<Rules />} />
              <Route path="/exercises" element={<Exercises />} />
            </>
          ) : (
            <>
              <Route path="/" element={<AthleteHome />} />
              <Route path="/program" element={<MyProgram />} />
              <Route path="/session/:dayId" element={<Session />} />
              <Route path="/history" element={<History />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/messages" element={<Messages />} />
            </>
          )}
          <Route path="/videos" element={<Videos />} />
          <Route path="/videos/:id" element={<VideoView />} />
          <Route path="/logs/:id" element={<LogView />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AuthContext.Provider>
  );
}

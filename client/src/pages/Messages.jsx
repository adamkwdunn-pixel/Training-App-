import { useAuth } from '../App.jsx';
import PushPrompt from '../components/PushPrompt.jsx';
import { PageHeader } from '../components/Bits.jsx';
import Thread from '../components/Thread.jsx';

export default function Messages() {
  const { user, coach } = useAuth();
  return (
    <>
      <PageHeader title={coach ? `Chat with ${coach.name}` : 'Coach'} sub="Questions, availability, niggles — anything not tied to one session" />
      {user?.role !== 'coach' && <PushPrompt reason="when your coach replies" />}
      <Thread athleteId={user.id} type="general" />
    </>
  );
}

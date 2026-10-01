import { useAuth } from '../App.jsx';
import { PageHeader } from '../components/Bits.jsx';
import Thread from '../components/Thread.jsx';

export default function Messages() {
  const { user, coach } = useAuth();
  return (
    <>
      <PageHeader title={coach ? `Chat with ${coach.name}` : 'Coach'} sub="Questions, availability, niggles — anything not tied to one session" />
      <Thread athleteId={user.id} type="general" />
    </>
  );
}

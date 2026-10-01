import { useAuth } from '../App.jsx';
import { useApi } from '../util.js';
import { Loading, PageHeader } from '../components/Bits.jsx';
import MaxesTable from '../components/MaxesTable.jsx';
import ProgressView from '../components/ProgressView.jsx';

export default function Progress() {
  const { user } = useAuth();
  const { data, error, reload } = useApi(`/athletes/${user.id}`);
  const { data: ex } = useApi('/exercises');
  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHeader title="Progress" />
      <section>
        <h2>My maxes</h2>
        <p className="muted small">Your % and RIR loads are worked out from these. Update after a test day.</p>
        <MaxesTable athleteId={user.id} states={data.states} exercises={ex?.exercises} onChange={reload} />
      </section>
      <section>
        <h2>Trends</h2>
        <ProgressView athleteId={user.id} />
      </section>
    </>
  );
}

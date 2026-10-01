import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { fmtDate, useApi } from '../util.js';
import { Empty, Loading, PageHeader } from '../components/Bits.jsx';

export default function MyProgram() {
  const { user } = useAuth();
  const { data, error } = useApi(`/athletes/${user.id}/plan`);
  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHeader title="My program" />
      {data.assignments.length === 0 && <Empty>No program assigned yet.</Empty>}
      {data.assignments.map((asg) => {
        const weeks = [...new Set(asg.days.map((d) => d.week))];
        return (
          <div key={asg.id}>
            <h2>{asg.program_name}</h2>
            {asg.description && <p className="muted small">{asg.description}</p>}
            {weeks.map((w) => (
              <section key={w}>
                <h3>Week {w}</h3>
                <div className="list">
                  {asg.days.filter((d) => d.week === w).map((d) => (
                    <Link key={d.id} to={d.log_id ? `/logs/${d.log_id}` : `/session/${d.id}`} className="row">
                      <span className={`dotmark ${d.log_id ? 'done' : ''}`} />
                      <div className="grow">
                        <strong>Day {d.day}</strong> · {d.title}
                        <div className="muted small">{d.exercise_count} exercises{d.done_on ? ` · done ${fmtDate(d.done_on)}` : ''}</div>
                      </div>
                      {asg.next_day?.id === d.id && <span className="badge info">Next</span>}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        );
      })}
    </>
  );
}

import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { describeRx, fmtDate, today, useApi } from '../util.js';
import { Empty, Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';
import { ScoreChip } from '../components/Ring.jsx';
import { fmtSleep } from '../../../shared/sleep.js';

export default function AthleteHome() {
  const { user, coach } = useAuth();
  const { data: plan, error } = useApi(`/athletes/${user.id}/plan`);
  const { data: inbox } = useApi('/inbox');
  const { data: ready } = useApi(`/athletes/${user.id}/readiness?days=2&today=${today()}`);
  const { data: food } = useApi(`/athletes/${user.id}/food?date=${today()}`);

  if (!plan) return <Loading error={error} />;
  const active = plan.assignments;

  return (
    <>
      <PageHeader title={`Hi ${user.name.split(' ')[0]}`} sub={coach ? `Coached by ${coach.name}` : 'Not linked to a coach'} />

      <div className="grid2" style={{ marginBottom: 6 }}>
        <Link to="/recovery" className="card flat row" style={{ margin: 0, border: '1px solid var(--line)' }}>
          {ready?.today ? <ScoreChip score={ready.today.score} /> : <Icon name="heart" />}
          <div className="grow">
            <strong>{ready?.today ? 'Readiness logged' : 'Daily check-in'}</strong>
            <div className="small muted">
              {ready?.sleep_debt?.nights_logged ? `Sleep debt ${fmtSleep(ready.sleep_debt.debt_hours)} (14 days)` : ready?.today ? 'Tap to update' : 'Sleep, soreness, energy — 30 seconds'}
            </div>
          </div>
          {!ready?.today && <span className="dot-new" />}
        </Link>
        <Link to="/nutrition" className="card flat row" style={{ margin: 0, border: '1px solid var(--line)' }}>
          <Icon name="apple" />
          <div className="grow">
            <strong className="tabular">{Math.round(food?.totals.kcal || 0)}{food?.targets.kcal ? ` / ${food.targets.kcal}` : ''} kcal today</strong>
            <div className="small muted">{food?.targets.protein ? `Protein ${Math.round(food.totals.protein)} / ${food.targets.protein} g · tap to log food` : 'Tap to log what you’ve eaten'}</div>
          </div>
        </Link>
      </div>

      {active.length === 0 && <Empty>No program yet — your coach will assign one soon.</Empty>}
      {active.map((asg) => (
        <section key={asg.id}>
          <h2>{asg.program_name} <span className="muted small">{asg.completed}/{asg.days.length} sessions</span></h2>
          <div className="progressbar"><div style={{ width: `${(asg.completed / Math.max(1, asg.days.length)) * 100}%` }} /></div>
          {asg.next_day ? (
            <Link to={`/session/${asg.next_day.id}`} className="card next-session">
              <div className="muted small">Next up · Week {asg.next_day.week}, Day {asg.next_day.day}</div>
              <h3>{asg.next_day.title}</h3>
              <ul>
                {asg.next_day.prescriptions.map((r) => (
                  <li key={r.id}>
                    <span>{r.block && <span className="block-tag">{r.block}</span>}{r.exercise_name}</span>
                    <span className="muted small">{describeRx(r)}{r.target_load != null ? ` · ${r.target_load} kg` : ''}</span>
                  </li>
                ))}
              </ul>
              <span className="btn primary block"><Icon name="bolt" /> Start session</span>
            </Link>
          ) : (
            <Empty>Program complete! 🎉 Check in with your coach for what’s next.</Empty>
          )}
        </section>
      ))}

      {inbox?.feedback?.length > 0 && (
        <section>
          <h2>From your coach</h2>
          <div className="list">
            {inbox.feedback.slice(0, 5).map((c) => (
              <Link key={c.id} className="row" to={c.target_type === 'video' ? `/videos/${c.target_id}` : c.target_type === 'workout' ? `/logs/${c.target_id}` : '/messages'}>
                <Icon name="chat" />
                <div className="grow">
                  <div className="clamp">{c.body}</div>
                  <div className="muted small">{c.target_type === 'video' ? 'On your form check' : c.target_type === 'workout' ? 'On your session' : 'Message'} · {fmtDate(c.created_at)}</div>
                </div>
                {!c.read_by_recipient && <span className="dot-new" />}
              </Link>
            ))}
          </div>
        </section>
      )}

      {inbox?.events?.length > 0 && (
        <section>
          <h2>Program updates</h2>
          <div className="list">
            {inbox.events.slice(0, 6).map((e) => (
              <div key={e.id} className="row">
                <Icon name="chart" />
                <div className="grow"><strong>{e.exercise_name}</strong> — {e.summary}<div className="muted small">{fmtDate(e.created_at)}</div></div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

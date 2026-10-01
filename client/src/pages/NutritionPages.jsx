import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { fmtDate, useApi } from '../util.js';
import { Empty, Loading, PageHeader } from '../components/Bits.jsx';
import { BodyFat, Bodyweight, NutritionTargets } from '../components/Nutrition.jsx';

export function MyTargets() {
  const { user } = useAuth();
  return (<><PageHeader title="Targets" sub="Calories and macros from the equations — adjust and see it update" /><NutritionTargets athleteId={user.id} /></>);
}
export function MyWeight() {
  const { user } = useAuth();
  return (<><PageHeader title="Bodyweight" sub="Daily weigh-ins and your trend" /><Bodyweight athleteId={user.id} /></>);
}
export function MyBodyFat() {
  const { user } = useAuth();
  return (<><PageHeader title="Body fat" sub="Calipers or US Navy tape method" /><BodyFat athleteId={user.id} /></>);
}

const GOAL = { lose: 'Lose', maintain: 'Maintain', gain: 'Gain' };

export function NutritionSquad() {
  const { data, error } = useApi('/nutrition/squad');
  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHeader title="Nutrition" sub="Targets, bodyweight trends and body composition" />
      {data.athletes.length === 0 && <Empty>No athletes yet.</Empty>}
      {data.athletes.length > 0 && (
        <div className="card" style={{ padding: '6px 8px' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Athlete</th><th>Goal</th><th>Calories</th><th>Protein</th><th>BW (7-d avg)</th><th>Rate kg/wk</th><th>Body fat</th><th>Lean</th></tr>
              </thead>
              <tbody>
                {data.athletes.map((a) => {
                  const target = a.goal === 'maintain' ? 0 : a.goal === 'gain' ? a.rate : -a.rate;
                  const off = a.rate_28d != null && Math.abs(a.rate_28d - target) > 0.25;
                  return (
                    <tr key={a.id}>
                      <td><Link to={`/athletes/${a.id}?tab=nutrition`}>{a.name}</Link>{a.position && <div className="tiny muted">{a.position}</div>}</td>
                      <td>{GOAL[a.goal]}{a.goal !== 'maintain' ? <span className="muted tiny"> {a.rate}/wk</span> : ''}</td>
                      <td>{a.targets.kcal ?? <span className="muted tiny">needs profile</span>}{a.targets.overridden && <span className="tiny muted"> (set)</span>}</td>
                      <td>{a.targets.protein != null ? `${a.targets.protein} g` : '—'}</td>
                      <td>{a.trend ?? '—'}{a.last_weigh_in && <div className="tiny muted">{fmtDate(a.last_weigh_in)}</div>}</td>
                      <td style={{ color: off ? 'var(--warn)' : undefined }}>{a.rate_28d != null ? `${a.rate_28d > 0 ? '+' : ''}${a.rate_28d}` : '—'}</td>
                      <td>{a.body_fat_pct != null ? `${a.body_fat_pct}%` : '—'}{a.body_fat_on && <div className="tiny muted">{fmtDate(a.body_fat_on)}</div>}</td>
                      <td>{a.lean_mass ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="tiny muted">Rate is the 4-week bodyweight trend; amber means more than 0.25 kg/week away from the athlete’s goal.</p>
    </>
  );
}

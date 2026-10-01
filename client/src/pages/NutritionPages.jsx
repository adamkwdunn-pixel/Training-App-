import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { useApi } from '../util.js';
import { Empty, Loading, PageHeader } from '../components/Bits.jsx';
import { Bodyweight, FoodLog, NutritionTargets } from '../components/Nutrition.jsx';

export function MyFood() {
  const { user } = useAuth();
  return (<><PageHeader title="Food log" /><FoodLog athleteId={user.id} /></>);
}
export function MyTargets() {
  const { user } = useAuth();
  return (<><PageHeader title="Targets" sub="Mifflin-St Jeor energy needs, adjusted for your goal" /><NutritionTargets athleteId={user.id} /></>);
}
export function MyWeight() {
  const { user } = useAuth();
  return (<><PageHeader title="Bodyweight" /><Bodyweight athleteId={user.id} /></>);
}

const GOAL = { lose: 'Lose', maintain: 'Maintain', gain: 'Gain' };

export function NutritionSquad() {
  const { data, error } = useApi('/nutrition/squad');
  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHeader title="Nutrition" sub="Targets vs the last 7 days of logged intake" />
      {data.athletes.length === 0 && <Empty>No athletes yet.</Empty>}
      {data.athletes.length > 0 && (
        <div className="card" style={{ padding: '6px 8px' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Athlete</th><th>Goal</th><th>Target</th><th>7-day avg</th><th>Protein</th><th>Days logged</th><th>BW</th><th>28 d</th></tr>
              </thead>
              <tbody>
                {data.athletes.map((a) => {
                  const diff = a.avg_kcal && a.targets.kcal ? a.avg_kcal - a.targets.kcal : null;
                  return (
                    <tr key={a.id}>
                      <td><Link to={`/athletes/${a.id}?tab=nutrition`}>{a.name}</Link></td>
                      <td>{GOAL[a.goal]}{a.goal !== 'maintain' ? <span className="muted tiny"> {a.rate}/wk</span> : ''}</td>
                      <td>{a.targets.kcal ?? <span className="muted tiny">needs profile</span>}</td>
                      <td>{a.avg_kcal ?? '—'}{diff != null && <span className={`tiny ${Math.abs(diff) > 300 ? 'muted' : 'faint'}`}> {diff > 0 ? '+' : ''}{diff}</span>}</td>
                      <td>{a.avg_protein ?? '—'}{a.targets.protein ? <span className="faint tiny"> / {a.targets.protein}</span> : ''}</td>
                      <td>{a.days_logged}/7</td>
                      <td>{a.bodyweight ?? '—'}</td>
                      <td>{a.weight_change_28d != null ? `${a.weight_change_28d > 0 ? '+' : ''}${a.weight_change_28d}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

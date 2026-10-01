import { useEffect, useState } from 'react';
import { useApi } from '../util.js';
import LineChart from './LineChart.jsx';

/** Pick an exercise and see its trend: e1RM / top set for lifts, best time or result for speed & power. */
export default function ProgressView({ athleteId }) {
  const { data: list } = useApi(`/athletes/${athleteId}/history`);
  const [exerciseId, setExerciseId] = useState('');
  useEffect(() => {
    if (!exerciseId && list?.exercises?.length) setExerciseId(String(list.exercises[0].id));
  }, [list, exerciseId]);
  const { data } = useApi(exerciseId ? `/athletes/${athleteId}/history?exercise_id=${exerciseId}` : null);

  if (!list) return null;
  if (!list.exercises.length) return <p className="muted">Progress charts appear once sessions are logged.</p>;
  const ex = list.exercises.find((e) => String(e.id) === exerciseId);

  return (
    <div className="stack">
      <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
        {list.exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      {data && ex && (
        <div className="charts">
          {ex.metric === 'load' && (
            <>
              <LineChart points={data.points} yKey="e1rm" label="Estimated 1RM" unit=" kg" />
              <LineChart points={data.points} yKey="top_weight" label="Top set" unit=" kg" />
              <LineChart points={data.points} yKey="volume" label="Volume (kg × reps)" />
            </>
          )}
          {ex.metric === 'time' && <LineChart points={data.points} yKey="best_time" label="Best time" unit=" s" lowerIsBetter />}
          {['distance', 'height', 'velocity', 'reps'].includes(ex.metric) && (
            <LineChart points={data.points} yKey="best_result" label="Best result" />
          )}
        </div>
      )}
    </div>
  );
}

import { CATEGORIES, METRIC_LABELS } from '../util.js';

/** The exercise form fields, shared by the coach's library and athletes adding a swap mid-session. */
export default function ExerciseFields({ value, onChange, cuesLabel = 'Coaching cues' }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <div className="grid2">
        <label>Name<input required value={value.name} onChange={set('name')} /></label>
        <label>
          Category
          <select value={value.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Athletes record
          <select value={value.metric} onChange={set('metric')}>
            {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Demo video link<input type="url" value={value.demo_url || ''} onChange={set('demo_url')} placeholder="https://youtube.com/…" /></label>
      </div>
      <label>{cuesLabel}<textarea rows={2} value={value.cues || ''} onChange={set('cues')} /></label>
    </>
  );
}

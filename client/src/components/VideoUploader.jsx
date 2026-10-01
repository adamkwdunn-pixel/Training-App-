import { useState } from 'react';
import { uploadVideo } from '../api.js';
import Icon from './Icon.jsx';

/** Pick or record a video on the phone and upload it as a form check. */
export default function VideoUploader({ exercises, athleteId, defaultExerciseId, workoutLogId, onDone }) {
  const [file, setFile] = useState(null);
  const [exerciseId, setExerciseId] = useState(defaultExerciseId || '');
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setErr('');
    setProgress(0);
    try {
      await uploadVideo(file, { exercise_id: exerciseId, note, athlete_id: athleteId, workout_log_id: workoutLogId }, setProgress);
      setFile(null);
      setNote('');
      setProgress(null);
      onDone?.();
    } catch (e2) {
      setErr(e2.message);
      setProgress(null);
    }
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <label className="file-drop">
        <Icon name="camera" size={28} />
        <span>{file ? file.name : 'Record or choose a video'}</span>
        <input type="file" accept="video/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      {exercises && (
        <label>
          Exercise
          <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
            <option value="">— Not specific —</option>
            {exercises.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
      )}
      <label>
        Note for your coach
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Set 3, felt my back round" />
      </label>
      {progress != null && <progress value={progress} max={1} />}
      {err && <p className="error">{err}</p>}
      <button className="btn primary" disabled={!file || progress != null}>
        {progress != null ? `Uploading ${Math.round(progress * 100)}%` : 'Upload form check'}
      </button>
    </form>
  );
}

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadFiles } from '../api.js';
import { Badge } from './Bits.jsx';
import Icon from './Icon.jsx';

const OK_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MB = 1024 * 1024;

const loadLabel = (x) => {
  if (x.load_type === 'percent' && x.percent != null) return `${x.percent}%${x.rir != null ? ` · RIR ${x.rir}` : ''}`;
  if (x.load_type === 'rir' && x.rir != null) return `RIR ${x.rir}`;
  if (x.load_type === 'rpe' && x.rpe != null) return `RPE ${x.rpe}`;
  if (x.load_type === 'fixed' && x.fixed_load != null) return `${x.fixed_load} kg`;
  if (x.load_type === 'bodyweight') return 'BW';
  return x.target || '';
};

/** Drag a PDF or photos of a written program here; AI turns it into a program you can check, then create. */
export default function ProgramImport({ enabled }) {
  const nav = useNavigate();
  const input = useRef(null);
  const [files, setFiles] = useState([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(1);

  const add = (list) => {
    setErr('');
    const all = [...list];
    const bad = all.filter((f) => !OK_TYPES.includes(f.type));
    const good = all.filter((f) => OK_TYPES.includes(f.type));
    if (bad.length) setErr(`${bad.map((f) => f.name).join(', ')}: use a PDF, JPG or PNG. (iPhone HEIC photos — take a screenshot of the photo instead.)`);
    setFiles((cur) => [...cur, ...good].slice(0, 10));
  };
  const read = async () => {
    setErr('');
    if (files.reduce((t, f) => t + f.size, 0) > 30 * MB) return setErr('Those files add up to more than 30 MB — try fewer pages at once.');
    setBusy(true);
    try {
      const { draft: d } = await uploadFiles('/programs/import', files);
      setDraft(d);
      setOpen(1);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    setErr('');
    setBusy(true);
    try {
      const { program } = await api('/programs/import/create', { method: 'POST', body: { draft } });
      nav(`/coach/programs/${program.id}`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  const reset = () => { setDraft(null); setFiles([]); setErr(''); };

  if (!enabled) {
    return (
      <div className="card dropzone disabled">
        <Icon name="upload" />
        <div><strong>Import a program from a PDF or photo</strong><div className="small muted">Needs the AI key (ANTHROPIC_API_KEY) set in Render — the same one used for food estimates.</div></div>
      </div>
    );
  }

  if (draft) {
    const sessions = draft.weeks.reduce((t, w) => t + w.days.length, 0);
    return (
      <div className="card stack">
        <div className="inline-form" style={{ alignItems: 'center' }}>
          <h3 className="grow" style={{ margin: 0 }}>Check the import</h3>
          <Badge tone="info">{draft.weeks.length} weeks · {sessions} sessions</Badge>
        </div>
        <label>Program name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>Description<textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        {draft.warnings.length > 0 && (
          <div className="import-warn">
            <strong className="small"><Icon name="alert" size={16} /> Worth checking</strong>
            <ul className="small">{draft.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        {draft.new_exercises.length > 0 && (
          <p className="small muted" style={{ margin: 0 }}>
            New to your exercise library (will be added): {draft.new_exercises.join(', ')}
          </p>
        )}
        <div className="import-weeks">
          {draft.weeks.map((w) => (
            <div key={w.week} className="import-week">
              <button className="import-week-head" onClick={() => setOpen(open === w.week ? 0 : w.week)} aria-expanded={open === w.week}>
                <strong>Week {w.week}</strong>
                <span className="small muted grow">{w.days.map((d) => d.title).join(' · ')}</span>
                <Icon name={open === w.week ? 'up' : 'down'} size={16} />
              </button>
              {open === w.week && w.days.map((d) => (
                <div key={d.day} className="import-day">
                  <div className="small"><strong>{d.title}</strong>{d.notes ? <span className="muted"> — {d.notes}</span> : null}</div>
                  {d.exercises.map((x, i) => (
                    <div key={i} className="kv tiny">
                      <span>{x.block ? <span className="muted">{x.block} </span> : null}{x.name}{x.new ? <span className="new-tag"> new</span> : null}</span>
                      <span className="tabular muted">{x.sets != null ? `${x.sets} × ` : ''}{x.reps}{loadLabel(x) ? ` · ${loadLabel(x)}` : ''}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="tiny faint" style={{ margin: 0 }}>You can edit everything in the program builder after it’s created.</p>
        {err && <p className="error">{err}</p>}
        <div className="row-actions" style={{ marginTop: 0 }}>
          <button className="btn primary" disabled={busy || !draft.name.trim()} onClick={create}>{busy ? 'Creating…' : 'Create program'}</button>
          <button className="btn ghost" disabled={busy} onClick={reset}>Discard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card stack">
      <div
        className={`dropzone${over ? ' over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) add(e.dataTransfer.files); }}
      >
        <Icon name="upload" />
        <div>
          <strong>Import a program</strong>
          <div className="small muted">Drop a PDF or photos/screenshots of a written program here, or tap to choose. AI reads it and builds the program for you to check.</div>
        </div>
        <input ref={input} type="file" multiple hidden accept=".pdf,image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {files.length > 0 && (
        <div className="list">
          {files.map((f, i) => (
            <div key={i} className="row">
              <Icon name={f.type === 'application/pdf' ? 'clipboard' : 'camera'} size={18} />
              <div className="grow small clamp">{f.name}<span className="muted"> · {(f.size / MB).toFixed(1)} MB</span></div>
              {!busy && <button className="icon-btn" onClick={() => setFiles(files.filter((_, k) => k !== i))} aria-label={`Remove ${f.name}`}><Icon name="trash" size={16} /></button>}
            </div>
          ))}
        </div>
      )}
      {err && <p className="error">{err}</p>}
      {files.length > 0 && (
        <button className="btn primary" disabled={busy} onClick={read}>
          {busy ? 'Reading your program… this can take a minute or two' : `✨ Read ${files.length > 1 ? `these ${files.length} files` : 'this file'}`}
        </button>
      )}
    </div>
  );
}

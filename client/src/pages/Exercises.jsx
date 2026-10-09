import { useState } from 'react';
import { api } from '../api.js';
import { CATEGORIES, METRIC_LABELS, useApi } from '../util.js';
import ExerciseFields from '../components/ExerciseFields.jsx';
import { Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';

const blank = { name: '', category: 'strength', metric: 'load', demo_url: '', cues: '', main: false };

export default function Exercises() {
  const { data, error, reload } = useApi('/exercises');
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const body = { ...editing, main_lift: editing.main ? 1 : 0 };
      if (editing.id) await api(`/exercises/${editing.id}`, { method: 'PUT', body });
      else await api('/exercises', { method: 'POST', body });
      setEditing(null);
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  };
  const del = async () => {
    if (!confirm(`Delete ${editing.name}?`)) return;
    try {
      await api(`/exercises/${editing.id}`, { method: 'DELETE' });
      setEditing(null);
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  if (!data) return <Loading error={error} />;
  const list = data.exercises.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <PageHeader title="Exercise library" sub="“Main” movements stay as programmed; athletes can swap the rest mid-session">
        <button className="btn primary" onClick={() => setEditing({ ...blank })}><Icon name="plus" /> New</button>
      </PageHeader>

      {editing && (
        <form className="card stack" onSubmit={save}>
          <ExerciseFields value={editing} onChange={setEditing} />
          <label className="row switch-row" style={{ padding: 0, border: 0 }}>
            <span className="grow">
              <strong className="small">Main movement</strong>
              <span className="tiny muted" style={{ display: 'block' }}>Athletes can’t swap it out mid-session. Big lifts and speed/power work start as main; accessories can be swapped.</span>
            </span>
            <input type="checkbox" className="switch" checked={!!editing.main} onChange={(e) => setEditing({ ...editing, main: e.target.checked })} />
          </label>
          {editing.created_by_name && <p className="tiny muted" style={{ margin: 0 }}>Added by {editing.created_by_name} as a swap.</p>}
          {err && <p className="error">{err}</p>}
          <div className="row-actions">
            <button className="btn primary">Save</button>
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
            <span className="grow" />
            {editing.id && <button type="button" className="btn danger ghost" onClick={del}>Delete</button>}
          </div>
        </form>
      )}

      <input className="search" placeholder="Search exercises…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {CATEGORIES.map((c) => {
        const items = list.filter((e) => e.category === c);
        if (!items.length) return null;
        return (
          <section key={c}>
            <h2>{c[0].toUpperCase() + c.slice(1)}</h2>
            <div className="list">
              {items.map((e) => (
                <button key={e.id} className="row" onClick={() => setEditing({ ...e })}>
                  <div className="grow">
                    <strong>{e.name}</strong> <span className="muted small">· {METRIC_LABELS[e.metric]}</span>
                    {e.main && <span className="badge" style={{ marginLeft: 6 }}>Main</span>}
                    {e.created_by_name && <span className="muted tiny"> · added by {e.created_by_name}</span>}
                    {e.cues && <div className="muted small clamp">{e.cues}</div>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

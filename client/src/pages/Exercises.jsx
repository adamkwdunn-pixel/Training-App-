import { useState } from 'react';
import { api } from '../api.js';
import { CATEGORIES, METRIC_LABELS, useApi } from '../util.js';
import { Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';

const blank = { name: '', category: 'strength', metric: 'load', demo_url: '', cues: '' };

export default function Exercises() {
  const { data, error, reload } = useApi('/exercises');
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      if (editing.id) await api(`/exercises/${editing.id}`, { method: 'PUT', body: editing });
      else await api('/exercises', { method: 'POST', body: editing });
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
      <PageHeader title="Exercise library">
        <button className="btn primary" onClick={() => setEditing({ ...blank })}><Icon name="plus" /> New</button>
      </PageHeader>

      {editing && (
        <form className="card stack" onSubmit={save}>
          <div className="grid2">
            <label>Name<input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label>
              Category
              <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>
              Athletes record
              <select value={editing.metric} onChange={(e) => setEditing({ ...editing, metric: e.target.value })}>
                {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Demo video link<input type="url" value={editing.demo_url || ''} onChange={(e) => setEditing({ ...editing, demo_url: e.target.value })} placeholder="https://youtube.com/…" /></label>
          </div>
          <label>Coaching cues<textarea rows={2} value={editing.cues || ''} onChange={(e) => setEditing({ ...editing, cues: e.target.value })} /></label>
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

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../util.js';
import { Empty, Loading, PageHeader } from '../components/Bits.jsx';
import Icon from '../components/Icon.jsx';

export default function Programs() {
  const nav = useNavigate();
  const { data, error } = useApi('/programs');
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name: '', description: '', weeks: 4, days_per_week: 3 });

  const create = async (e) => {
    e.preventDefault();
    const { program } = await api('/programs', { method: 'POST', body: f });
    nav(`/coach/programs/${program.id}`);
  };

  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHeader title="Programs" sub="Coach only — build, edit and assign training programs">
        <button className="btn primary" onClick={() => setCreating(!creating)}><Icon name="plus" /> New</button>
      </PageHeader>
      {creating && (
        <form className="card stack" onSubmit={create}>
          <label>Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Pre-season block 1 — Forwards" /></label>
          <label>Description<textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <div className="grid2">
            <label>Weeks<input type="number" min={1} max={52} value={f.weeks} onChange={(e) => setF({ ...f, weeks: e.target.value })} /></label>
            <label>Sessions per week<input type="number" min={0} max={7} value={f.days_per_week} onChange={(e) => setF({ ...f, days_per_week: e.target.value })} /></label>
          </div>
          <button className="btn primary">Create program</button>
        </form>
      )}
      {data.programs.length === 0 && !creating && <Empty>No programs yet. Create one, add sessions, then assign it to athletes.</Empty>}
      <div className="list">
        {data.programs.map((p) => (
          <Link key={p.id} to={`/coach/programs/${p.id}`} className="row">
            <Icon name="calendar" />
            <div className="grow">
              <strong>{p.name}</strong>
              <div className="muted small">{p.weeks} weeks · {p.day_count} sessions · {p.athlete_count} athletes</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

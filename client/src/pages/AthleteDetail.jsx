import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDate, today, useApi } from '../util.js';
import { Badge, Loading, PageHeader } from '../components/Bits.jsx';
import MaxesTable from '../components/MaxesTable.jsx';
import ProgressView from '../components/ProgressView.jsx';
import Thread from '../components/Thread.jsx';
import Icon from '../components/Icon.jsx';

const TABS = ['overview', 'program', 'log', 'videos', 'progress', 'messages', 'settings'];

export default function AthleteDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview';
  const { data, error, reload } = useApi(`/athletes/${id}`);
  const { data: ex } = useApi('/exercises');

  if (!data) return <Loading error={error} />;
  const a = data.athlete;

  return (
    <>
      <PageHeader title={a.name} back="/athletes" sub={[a.position, a.bodyweight && `${a.bodyweight} kg`, a.email].filter(Boolean).join(' · ')} />
      <div className="tabs scroll-x">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setParams({ tab: t }, { replace: true })}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <section>
            <h2>Maxes &amp; load adjustments</h2>
            <p className="muted small">% and RIR loads are calculated from the max. Your progression rules move these numbers automatically after each session.</p>
            <MaxesTable athleteId={a.id} states={data.states} exercises={ex?.exercises} onChange={reload} />
          </section>
          <section>
            <h2>Rule activity</h2>
            {data.events.length === 0 && <p className="muted small">Nothing yet.</p>}
            <div className="list">
              {data.events.map((e) => (
                <div key={e.id} className="row">
                  {e.flagged ? <Icon name="flag" /> : <Icon name="sliders" />}
                  <div className="grow">
                    <strong>{e.exercise_name}</strong> — {e.summary}
                    <div className="muted small">{e.rule_name}{e.matched && e.matched !== 'manual' ? ` · ${e.matched}` : ''} · {fmtDate(e.created_at)}</div>
                  </div>
                  {e.workout_log_id && <Link className="small" to={`/logs/${e.workout_log_id}`}>Session</Link>}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {tab === 'program' && <ProgramTab athlete={a} assignments={data.assignments} reload={reload} />}
      {tab === 'log' && <LogTab athleteId={a.id} />}
      {tab === 'videos' && <VideosTab athleteId={a.id} />}
      {tab === 'progress' && <ProgressView athleteId={a.id} />}
      {tab === 'messages' && (
        <section>
          <h2>Messages with {a.name.split(' ')[0]}</h2>
          <Thread athleteId={a.id} type="general" />
        </section>
      )}
      {tab === 'settings' && <SettingsTab athlete={a} reload={reload} />}
    </>
  );
}

function ProgramTab({ athlete, assignments, reload }) {
  const { data: programs } = useApi('/programs');
  const { data: rules } = useApi('/rules');
  const { data: plan, reload: reloadPlan } = useApi(`/athletes/${athlete.id}/plan`);
  const [f, setF] = useState({ program_id: '', rule_id: '', start_date: today(), replace_active: true });

  const assign = async (e) => {
    e.preventDefault();
    await api('/assignments', { method: 'POST', body: { ...f, athlete_ids: [athlete.id] } });
    reload();
    reloadPlan();
  };
  const patch = async (asgId, body) => {
    await api(`/assignments/${asgId}`, { method: 'PATCH', body });
    reload();
    reloadPlan();
  };

  return (
    <>
      <section>
        <h2>Assigned programs</h2>
        {assignments.length === 0 && <p className="muted small">No program assigned yet.</p>}
        <div className="list">
          {assignments.map((asg) => (
            <div key={asg.id} className="row wrap">
              <div className="grow">
                <Link to={`/programs/${asg.program_id}`}><strong>{asg.program_name}</strong></Link>{' '}
                {asg.active ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>}
                <div className="muted small">From {fmtDate(asg.start_date)}</div>
              </div>
              <label className="small">
                Progression rule
                <select value={asg.rule_id || ''} onChange={(e) => patch(asg.id, { rule_id: e.target.value || null })}>
                  <option value="">None</option>
                  {rules?.rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <button className="btn small ghost" onClick={() => patch(asg.id, { active: !asg.active })}>{asg.active ? 'Pause' : 'Activate'}</button>
            </div>
          ))}
        </div>
      </section>

      <form className="card stack" onSubmit={assign}>
        <h3>Assign a program</h3>
        <div className="grid2">
          <label>
            Program
            <select required value={f.program_id} onChange={(e) => setF({ ...f, program_id: e.target.value })}>
              <option value="">Choose…</option>
              {programs?.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>
            Progression rule
            <select value={f.rule_id} onChange={(e) => setF({ ...f, rule_id: e.target.value })}>
              <option value="">None</option>
              {rules?.rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label>Start date<input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></label>
          <label className="check">
            <input type="checkbox" checked={f.replace_active} onChange={(e) => setF({ ...f, replace_active: e.target.checked })} />
            Replace current program
          </label>
        </div>
        <button className="btn primary">Assign</button>
      </form>

      {plan?.assignments.map((asg) => (
        <section key={asg.id}>
          <h2>{asg.program_name} <span className="muted small">{asg.completed}/{asg.days.length} done</span></h2>
          <div className="list">
            {asg.days.map((d) => (
              <Link key={d.id} to={d.log_id ? `/logs/${d.log_id}` : `/athletes/${athlete.id}/session/${d.id}`} className="row">
                <span className={`dotmark ${d.log_id ? 'done' : ''}`} />
                <div className="grow">
                  <strong>W{d.week} · D{d.day}</strong> {d.title}
                  <div className="muted small">{d.exercise_count} exercises{d.done_on ? ` · done ${fmtDate(d.done_on)}` : ''}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function LogTab({ athleteId }) {
  const { data } = useApi(`/logs?athlete_id=${athleteId}`);
  if (!data) return <Loading />;
  if (!data.logs.length) return <p className="muted">No sessions logged yet.</p>;
  return (
    <div className="list">
      {data.logs.map((l) => (
        <Link key={l.id} to={`/logs/${l.id}`} className="row">
          <div className="grow">
            <strong>{l.title}</strong> {!l.coach_seen && <Badge tone="info">New</Badge>}
            <div className="muted small">{l.set_count} sets{l.session_rpe != null ? ` · sRPE ${l.session_rpe}` : ''}{l.comment_count ? ` · ${l.comment_count} comments` : ''}</div>
          </div>
          <span className="muted small">{fmtDate(l.performed_on)}</span>
        </Link>
      ))}
    </div>
  );
}

function VideosTab({ athleteId }) {
  const { data } = useApi(`/videos?athlete_id=${athleteId}`);
  if (!data) return <Loading />;
  if (!data.videos.length) return <p className="muted">No form checks uploaded yet.</p>;
  return (
    <div className="list">
      {data.videos.map((v) => (
        <Link key={v.id} to={`/videos/${v.id}`} className="row">
          <Icon name="play" />
          <div className="grow">
            <strong>{v.exercise_name || 'General'}</strong> {v.status === 'pending' ? <Badge tone="info">To review</Badge> : <Badge tone="ok">Reviewed</Badge>}
            {v.note && <div className="muted small">“{v.note}”</div>}
          </div>
          <span className="muted small">{fmtDate(v.created_at)}</span>
        </Link>
      ))}
    </div>
  );
}

function SettingsTab({ athlete, reload }) {
  const nav = useNavigate();
  const [f, setF] = useState({
    position: athlete.position || '', bodyweight: athlete.bodyweight || '', load_increment: athlete.load_increment, notes: athlete.notes || '',
  });
  const [saved, setSaved] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    await api(`/athletes/${athlete.id}`, { method: 'PATCH', body: f });
    setSaved(true);
    reload();
  };
  const remove = async () => {
    if (!confirm(`Remove ${athlete.name} from your squad? Their history is kept.`)) return;
    await api(`/athletes/${athlete.id}`, { method: 'DELETE' });
    nav('/athletes');
  };
  return (
    <form className="card stack" onSubmit={save}>
      <div className="grid2">
        <label>Position<input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></label>
        <label>Bodyweight (kg)<input type="number" step="0.1" inputMode="decimal" value={f.bodyweight} onChange={(e) => setF({ ...f, bodyweight: e.target.value })} /></label>
        <label>
          Round loads to (kg)
          <select value={f.load_increment} onChange={(e) => setF({ ...f, load_increment: e.target.value })}>
            {[0.5, 1, 1.25, 2, 2.5, 5].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      </div>
      <label>Coach notes (private)<textarea rows={4} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Injury history, goals, availability…" /></label>
      <div className="row-actions">
        <button className="btn primary">Save</button>
        {saved && <span className="muted small">Saved</span>}
        <span className="grow" />
        <button type="button" className="btn danger ghost" onClick={remove}>Remove from squad</button>
      </div>
    </form>
  );
}

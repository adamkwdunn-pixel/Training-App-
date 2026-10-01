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
import { BodyFat, Bodyweight, NutritionTargets } from '../components/Nutrition.jsx';
import { AssignedProtocols, Injuries, ReadinessFor } from '../components/Recovery.jsx';
import TestingView from '../components/Testing.jsx';
import LoginDetails from '../components/LoginDetails.jsx';
import FoodLog from '../components/FoodLog.jsx';
import { fmtSleep } from '../../../shared/sleep.js';

const TABS = ['overview', 'details', 'program', 'log', 'videos', 'progress', 'nutrition', 'recovery', 'testing', 'messages'];

export default function AthleteDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') === 'settings' ? 'details' : params.get('tab');
  const tab = TABS.includes(requested) ? requested : 'overview';
  const { data, error, reload } = useApi(`/athletes/${id}?today=${today()}`);
  const { data: ex } = useApi('/exercises');

  if (!data) return <Loading error={error} />;
  const a = data.athlete;

  return (
    <>
      <PageHeader title={a.name} back="/athletes" sub={[a.position, data.snapshot?.age != null && `${data.snapshot.age} yrs`, a.email].filter(Boolean).join(' · ')} />
      <div className="tabs scroll-x">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setParams({ tab: t }, { replace: true })}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <Snapshot s={data.snapshot} go={(t) => setParams({ tab: t }, { replace: true })} />
          {a.notes && (
            <button className="card flat row" style={{ border: '1px solid var(--line-soft)', width: '100%' }} onClick={() => setParams({ tab: 'details' }, { replace: true })}>
              <Icon name="clipboard" />
              <div className="grow"><div className="stat-label">Coach notes</div><div className="small clamp">{a.notes}</div></div>
            </button>
          )}
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
      {tab === 'nutrition' && <NutritionTab athleteId={a.id} />}
      {tab === 'recovery' && (
        <>
          <section><h2>Injuries</h2><Injuries athleteId={a.id} /></section>
          <section><h2>Assigned protocols</h2><AssignedProtocols athleteId={a.id} /></section>
          <section><ReadinessFor athleteId={a.id} /></section>
        </>
      )}
      {tab === 'testing' && <TestingView athleteId={a.id} />}
      {tab === 'messages' && (
        <section>
          <h2>Messages with {a.name.split(' ')[0]}</h2>
          <Thread athleteId={a.id} type="general" />
        </section>
      )}
      {tab === 'details' && <DetailsTab athlete={a} reload={reload} />}
    </>
  );
}

function NutritionTab({ athleteId }) {
  const [view, setView] = useState('targets');
  return (
    <>
      <div className="segmented" style={{ maxWidth: 520 }}>
        {[['food', 'Food log'], ['targets', 'Targets'], ['weight', 'Bodyweight'], ['bodyfat', 'Body fat']].map(([k, l]) => (
          <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>
        ))}
      </div>
      {view === 'targets' && <NutritionTargets athleteId={athleteId} />}
      {view === 'food' && <FoodLog athleteId={athleteId} />}
      {view === 'weight' && <Bodyweight athleteId={athleteId} />}
      {view === 'bodyfat' && <BodyFat athleteId={athleteId} />}
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
                <Link to={`/coach/programs/${asg.program_id}`}><strong>{asg.program_name}</strong></Link>{' '}
                {asg.active ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>}
                <div className="muted small">From {fmtDate(asg.start_date)}</div>
              </div>
              <label className="small">
                Progression model
                <select value={asg.rule_id || ''} onChange={(e) => patch(asg.id, { rule_id: e.target.value || null })}>
                  <option value="">Program default</option>
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
            Progression model
            <select value={f.rule_id} onChange={(e) => setF({ ...f, rule_id: e.target.value })}>
              <option value="">Program default</option>
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

function DetailsTab({ athlete, reload }) {
  const nav = useNavigate();
  const init = () => ({
    name: athlete.name || '', email: athlete.email || '', position: athlete.position || '', sex: athlete.sex || '',
    birth_date: athlete.birth_date || '', height_cm: athlete.height_cm ?? '', bodyweight: athlete.bodyweight ?? '',
    load_increment: athlete.load_increment, notes: athlete.notes || '',
  });
  const [f, setF] = useState(init);
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => {
    setF({ ...f, [k]: e.target.value });
    setMsg('');
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      await api(`/athletes/${athlete.id}`, { method: 'PATCH', body: { ...f, today: today() } });
      setMsg('Saved ✓');
      reload();
    } catch (e2) {
      setMsg(e2.message);
    }
  };
  const [loginSent, setLoginSent] = useState(null);
  const sendLogin = async () => {
    if (!confirm(`Create a new temporary password for ${athlete.name} and send it to ${athlete.email}? Their current password stops working.`)) return;
    setLoginSent({ ...(await api(`/athletes/${athlete.id}/send-login`, { method: 'POST' })), name: athlete.name });
  };
  const remove = async () => {
    if (!confirm(`Remove ${athlete.name} from your squad? Their history is kept.`)) return;
    await api(`/athletes/${athlete.id}`, { method: 'DELETE' });
    nav('/athletes');
  };
  return (
    <form className="card stack" onSubmit={save}>
      <h3>Personal details</h3>
      <div className="grid2">
        <label>Name<input required value={f.name} onChange={set('name')} /></label>
        <label>Email (their login)<input required type="email" value={f.email} onChange={set('email')} /></label>
        <label>Position<input value={f.position} onChange={set('position')} placeholder="e.g. Tighthead prop" /></label>
        <label>
          Sex
          <select value={f.sex} onChange={set('sex')}>
            <option value="">—</option><option value="male">Male</option><option value="female">Female</option>
          </select>
        </label>
        <label>Date of birth<input type="date" value={f.birth_date} onChange={set('birth_date')} /></label>
        <label>Height (cm)<input type="number" inputMode="decimal" min={120} max={230} value={f.height_cm} onChange={set('height_cm')} /></label>
      </div>
      <h3 style={{ marginTop: 6 }}>Training</h3>
      <div className="grid2">
        <label>Bodyweight (kg)<input type="number" step="0.1" inputMode="decimal" value={f.bodyweight} onChange={set('bodyweight')} /><span className="tiny faint" style={{ fontWeight: 500 }}>A change is saved as today’s weigh-in.</span></label>
        <label>
          Round loads to (kg)
          <select value={f.load_increment} onChange={set('load_increment')}>
            {[0.5, 1, 1.25, 2, 2.5, 5].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      </div>
      <label>Coach notes (private — athletes never see these)<textarea rows={5} value={f.notes} onChange={set('notes')} placeholder="Goals, injury history, availability, selection notes…" /></label>
      <p className="tiny faint" style={{ margin: 0 }}>Maxes are on the Overview tab, targets on Nutrition, tests on Testing.</p>
      <div className="row-actions">
        <button className="btn primary">Save details</button>
        {msg && <span className="muted small">{msg}</span>}
        <span className="grow" />
        <button type="button" className="btn danger ghost" onClick={remove}>Remove from squad</button>
      </div>
      {!athlete.linked_user_id && (
        <div className="stack" style={{ marginTop: 18 }}>
          <div className="divider" />
          <div className="inline-form wrap">
            <div className="grow"><strong>Login details</strong><div className="small muted">{athlete.email}</div></div>
            <button type="button" className="btn small" onClick={sendLogin}>Send new login details</button>
          </div>
          {loginSent && <LoginDetails details={loginSent} onClose={() => setLoginSent(null)} />}
        </div>
      )}
    </form>
  );
}

/** Key numbers at a glance; each tile jumps to the tab with the detail. */
function Snapshot({ s, go }) {
  if (!s) return null;
  const debt = s.sleep_debt;
  const tone = { low: 'var(--good)', moderate: 'var(--warn)', high: 'var(--bad)' };
  const tiles = [
    { label: 'Bodyweight', value: s.bodyweight_trend ?? s.bodyweight, unit: 'kg', sub: s.bodyweight_rate != null ? `${s.bodyweight_rate > 0 ? '+' : ''}${s.bodyweight_rate} kg/wk` : s.bodyweight_trend ? '7-day avg' : null, tab: 'nutrition' },
    { label: 'Body fat', value: s.body_fat_pct, unit: '%', sub: s.lean_mass ? `lean ${s.lean_mass} kg` : null, tab: 'nutrition' },
    { label: 'Readiness (7 d)', value: s.readiness_7d, unit: '/100', sub: `${s.checkins_7d} check-ins`, tab: 'recovery' },
    { label: 'Sleep debt', value: debt?.nights_logged ? fmtSleep(debt.debt_hours) : null, sub: debt?.nights_logged ? 'last 14 days' : 'no sleep logged', color: debt?.nights_logged ? tone[debt.level] : null, tab: 'recovery' },
    { label: 'Sessions (7 d)', value: s.sessions_7d, sub: s.last_session ? `last ${fmtDate(s.last_session)}` : 'none yet', tab: 'log' },
    { label: 'Program', value: s.program || '—', small: true, sub: s.injuries.length ? `⚠ ${s.injuries.map((i) => i.area).join(', ')}` : 'no injuries', color: s.injuries.length ? 'var(--warn)' : null, tab: s.injuries.length ? 'recovery' : 'program' },
  ];
  return (
    <div className="snapshot">
      {tiles.map((t) => (
        <button key={t.label} className="snap-tile" onClick={() => go(t.tab)}>
          <span className="stat-label">{t.label}</span>
          <span className={t.small ? 'snap-value small-value' : 'snap-value'} style={t.color && !t.small ? { color: t.color } : undefined}>
            {t.value ?? '—'}{t.value != null && t.unit && <small>{t.unit}</small>}
          </span>
          {t.sub && <span className="tiny" style={{ color: t.small && t.color ? t.color : 'var(--muted)' }}>{t.sub}</span>}
        </button>
      ))}
    </div>
  );
}

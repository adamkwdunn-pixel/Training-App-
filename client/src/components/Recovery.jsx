import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { fmtDate, today, useApi } from '../util.js';
import { Badge, Empty, Loading } from './Bits.jsx';
import Icon from './Icon.jsx';
import LineChart from './LineChart.jsx';
import { ScoreChip } from './Ring.jsx';
import Thread from './Thread.jsx';
import { fmtSleep, joinSleep, splitSleep } from '../../../shared/sleep.js';

/** Daily readiness questionnaire (one per day, can be edited the same day). */
export function CheckIn({ athleteId }) {
  const { data: meta } = useApi('/recovery/meta');
  const { data, reload } = useApi(`/athletes/${athleteId}/readiness?today=${today()}`);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  if (!meta || !data) return <Loading />;
  const done = data.today;
  const form = f || (done ? { ...done, ...sleepParts(done.sleep_hours) } : { sleep_h: '', sleep_m: '' });
  const set = (k, v) => setF({ ...form, [k]: v });
  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const { sleep_h: h, sleep_m: m, ...rest } = form;
      await api(`/athletes/${athleteId}/readiness`, { method: 'POST', body: { ...rest, sleep_hours: joinSleep(h, m), day: today() } });
      setF(null);
      reload();
    } catch (e2) {
      setMsg(e2.message);
    }
  };

  return (
    <>
      {done && !f && (
        <div className="card">
          <div className="inline-form">
            <div className="grow">
              <div className="stat-label">Today’s readiness</div>
              <div className="num-big">{done.score}<span className="muted small"> / 100</span></div>
            </div>
            <ScoreChip score={done.score} />
          </div>
          <p className="small muted" style={{ margin: '10px 0 0' }}>
            {done.score >= 70 ? 'Good to go — train as planned.' : done.score >= 50 ? 'A bit flat. Warm up well and listen to your body.' : 'Low readiness — your coach can see this and may adjust today.'}
          </p>
          <button className="btn small" style={{ marginTop: 12 }} onClick={() => setF({ ...done, ...sleepParts(done.sleep_hours) })}>Edit today’s answers</button>
        </div>
      )}
      {(!done || f) && (
        <form className="card stack" onSubmit={submit}>
          <h3>How are you today?</h3>
          <div>
            <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Time asleep last night</div>
            <div className="sleep-pick">
              <select aria-label="Hours" value={form.sleep_h ?? ''} onChange={(e) => setF({ ...form, sleep_h: e.target.value, sleep_m: form.sleep_m === '' ? '0' : form.sleep_m })}>
                <option value="">–</option>
                {Array.from({ length: 15 }, (_, h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <span>hours</span>
              <select aria-label="Minutes" value={form.sleep_m ?? ''} onChange={(e) => set('sleep_m', e.target.value)}>
                <option value="">–</option>
                {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
              </select>
              <span>min</span>
            </div>
          </div>
          {Object.entries(meta.items).map(([k, [label, lo, hi]]) => (
            <div key={k}>
              <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
              <div className="scale">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button type="button" key={v} className={Number(form[k]) === v ? 'on' : ''} onClick={() => set(k, v)}>{v}</button>
                ))}
              </div>
              <div className="scale-ends"><span>{lo}</span><span>{hi}</span></div>
            </div>
          ))}
          <label>Anything else? <input value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Optional — illness, travel, exams…" /></label>
          {msg && <p className="error">{msg}</p>}
          <button className="btn primary">Submit check-in</button>
        </form>
      )}
      {data.sleep_debt && <SleepDebtMeter debt={data.sleep_debt} />}
      <ReadinessHistory entries={data.entries} />
    </>
  );
}

const sleepParts = (hours) => {
  const { h, m } = splitSleep(hours);
  return { sleep_h: h === '' ? '' : String(h), sleep_m: m === '' ? '' : String(m) };
};

const DEBT_LABEL = { low: 'Low', moderate: 'Building up', high: 'High' };
const DEBT_MAX = 10; // the meter's full scale, in hours

/** Rolling 14-day sleep debt: every night under 7 h 30 min adds its shortfall. */
export function SleepDebtMeter({ debt, compact = false }) {
  const pct = Math.min(100, (debt.debt_hours / DEBT_MAX) * 100);
  return (
    <div className={`card sleep-debt ${debt.level}`}>
      <div className="inline-form" style={{ alignItems: 'flex-end' }}>
        <div className="grow">
          <div className="stat-label">Sleep debt · last {debt.days} days</div>
          <div className="num-big">{debt.debt_hours ? fmtSleep(debt.debt_hours) : '0 h'}</div>
        </div>
        <span className={`badge debt-${debt.level}`}>{DEBT_LABEL[debt.level]}</span>
      </div>
      <div className="debt-track" role="meter" aria-valuemin={0} aria-valuemax={DEBT_MAX} aria-valuenow={debt.debt_hours} aria-label="Sleep debt">
        <div className="debt-fill" style={{ width: `${pct}%` }} />
        <span className="debt-tick" style={{ left: '20%' }} />
        <span className="debt-tick" style={{ left: '50%' }} />
      </div>
      <div className="debt-scale tiny faint"><span>0 h</span><span>2 h</span><span>5 h</span><span>10 h+</span></div>
      {!compact && (
        <p className="small muted" style={{ margin: '10px 0 0' }}>
          {debt.nights_logged === 0
            ? 'Log your sleep in the check-in to see your sleep debt.'
            : `${debt.nights_short} of ${debt.nights_logged} logged night${debt.nights_logged === 1 ? '' : 's'} under ${fmtSleep(debt.target)}${debt.avg_hours != null ? ` · average ${fmtSleep(debt.avg_hours)}` : ''}. Every night under ${fmtSleep(debt.target)} adds the shortfall; it drops off after ${debt.days} days.`}
        </p>
      )}
    </div>
  );
}

export function ReadinessHistory({ entries }) {
  if (!entries.length) return null;
  return (
    <>
      <h2>Last 4 weeks</h2>
      <LineChart points={entries} yKey="score" xKey="day" label="Readiness score" />
      <div className="list" style={{ marginTop: 14 }}>
        {[...entries].reverse().slice(0, 10).map((r) => (
          <div key={r.id} className="row">
            <ScoreChip score={r.score} />
            <div className="grow">
              <div className="small">{fmtDate(r.day)}{r.sleep_hours != null && <span className="muted"> · {fmtSleep(r.sleep_hours)} sleep</span>}</div>
              <div className="tiny muted">Sleep {r.sleep_quality} · Energy {r.energy} · Soreness {r.soreness} · Stress {r.stress} · Mood {r.mood}{r.notes ? ` · “${r.notes}”` : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function ReadinessFor({ athleteId }) {
  const { data } = useApi(`/athletes/${athleteId}/readiness?days=28&today=${today()}`);
  if (!data) return <Loading />;
  if (!data.entries.length) return <p className="muted small">No check-ins yet.</p>;
  return (
    <>
      {data.sleep_debt && <SleepDebtMeter debt={data.sleep_debt} />}
      <ReadinessHistory entries={data.entries} />
    </>
  );
}

const AREAS = ['Hamstring', 'Quad', 'Calf', 'Groin / adductor', 'Hip', 'Knee', 'Ankle', 'Foot', 'Lower back', 'Upper back', 'Neck', 'Shoulder', 'Elbow', 'Wrist / hand', 'Chest / ribs', 'Head / concussion', 'Other'];
const AVAIL_TONE = { full: 'ok', modified: 'warn', unavailable: 'bad' };
const STATUS_LABEL = { new: 'New', monitoring: 'Monitoring', rehab: 'Rehab', resolved: 'Resolved' };

/** Injury reports with a thread to the coach. */
export function Injuries({ athleteId }) {
  const { user } = useAuth();
  const isCoach = user.role === 'coach';
  const { data, error, reload } = useApi(`/athletes/${athleteId}/injuries`);
  const { data: meta } = useApi('/recovery/meta');
  const [reporting, setReporting] = useState(false);
  const [open, setOpen] = useState(null);
  if (!data || !meta) return <Loading error={error} />;
  const active = data.injuries.filter((i) => i.status !== 'resolved');
  const past = data.injuries.filter((i) => i.status === 'resolved');

  return (
    <>
      {!reporting && <button className="btn primary block" onClick={() => setReporting(true)} style={{ marginBottom: 14 }}><Icon name="alert" /> Report {isCoach ? 'an' : 'a new'} injury</button>}
      {reporting && <InjuryForm athleteId={athleteId} meta={meta} onDone={() => { setReporting(false); reload(); }} />}
      {active.length === 0 && !reporting && <Empty>No current injuries. 💪</Empty>}
      {active.map((i) => <InjuryCard key={i.id} i={i} meta={meta} isCoach={isCoach} open={open === i.id} onToggle={() => setOpen(open === i.id ? null : i.id)} onChange={reload} />)}
      {past.length > 0 && (
        <>
          <h2>Resolved</h2>
          {past.map((i) => <InjuryCard key={i.id} i={i} meta={meta} isCoach={isCoach} open={open === i.id} onToggle={() => setOpen(open === i.id ? null : i.id)} onChange={reload} />)}
        </>
      )}
    </>
  );
}

function InjuryForm({ athleteId, meta, onDone }) {
  const [f, setF] = useState({ area: '', other: '', side: 'left', pain: 3, availability: 'modified', description: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api(`/athletes/${athleteId}/injuries`, { method: 'POST', body: { ...f, area: f.area === 'Other' ? f.other : f.area } });
      onDone();
    } catch (e2) {
      setErr(e2.message);
    }
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h3>Report an injury</h3>
      <div className="grid2">
        <label>
          Body area
          <select required value={f.area} onChange={set('area')}>
            <option value="">Choose…</option>
            {AREAS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        {f.area === 'Other' && <label>Describe area<input required value={f.other} onChange={set('other')} /></label>}
        <label>
          Side
          <select value={f.side} onChange={set('side')}>
            <option value="left">Left</option><option value="right">Right</option><option value="both">Both</option><option value="n/a">N/A</option>
          </select>
        </label>
      </div>
      <label>
        Pain right now: <strong style={{ color: '#fff' }}>{f.pain} / 10</strong>
        <input type="range" min={0} max={10} value={f.pain} onChange={set('pain')} />
      </label>
      <label>
        Can you train?
        <div className="segmented" style={{ marginBottom: 0 }}>
          {Object.entries(meta.availability).map(([k, v]) => (
            <button type="button" key={k} className={f.availability === k ? 'on' : ''} onClick={() => setF({ ...f, availability: k })}>{v.replace(' training', '')}</button>
          ))}
        </div>
      </label>
      <label>What happened?<textarea rows={3} value={f.description} onChange={set('description')} placeholder="How and when it happened, what aggravates it…" /></label>
      {err && <p className="error">{err}</p>}
      <div className="row-actions" style={{ marginTop: 0 }}>
        <button className="btn primary">Send to coach</button>
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

function InjuryCard({ i, meta, isCoach, open, onToggle, onChange }) {
  const [pain, setPain] = useState(i.pain ?? 0);
  const patch = async (body) => {
    await api(`/injuries/${i.id}`, { method: 'PATCH', body });
    onChange();
  };
  const del = async () => {
    if (!confirm('Delete this injury record?')) return;
    await api(`/injuries/${i.id}`, { method: 'DELETE' });
    onChange();
  };
  return (
    <div className="card">
      <button className="row" style={{ padding: 0 }} onClick={onToggle}>
        <div className="grow">
          <div className="inline-form wrap" style={{ gap: 6 }}>
            <strong>{i.area}{i.side && i.side !== 'n/a' ? ` (${i.side})` : ''}</strong>
            <Badge tone={i.status === 'new' ? 'info' : i.status === 'resolved' ? '' : 'solid'}>{STATUS_LABEL[i.status]}</Badge>
            <Badge tone={AVAIL_TONE[i.availability]}>{meta.availability[i.availability]}</Badge>
          </div>
          <div className="small muted">Reported {fmtDate(i.reported_on)} · pain {i.pain ?? '—'}/10{i.comment_count ? ` · ${i.comment_count} messages` : ''}</div>
        </div>
        <Icon name={open ? 'up' : 'down'} size={18} />
      </button>
      {open && (
        <div className="stack" style={{ marginTop: 14 }}>
          {i.description && <p className="small" style={{ margin: 0 }}>{i.description}</p>}
          {i.status !== 'resolved' && (
            <>
              <label>
                Pain today: <strong style={{ color: '#fff' }}>{pain} / 10</strong>
                <input type="range" min={0} max={10} value={pain} onChange={(e) => setPain(Number(e.target.value))} onMouseUp={() => patch({ pain })} onTouchEnd={() => patch({ pain })} onKeyUp={() => patch({ pain })} />
              </label>
              <div className="segmented" style={{ marginBottom: 0 }}>
                {Object.entries(meta.availability).map(([k, v]) => (
                  <button type="button" key={k} className={i.availability === k ? 'on' : ''} onClick={() => patch({ availability: k })}>{v.replace(' training', '')}</button>
                ))}
              </div>
            </>
          )}
          {isCoach && (
            <div className="chips">
              {meta.statuses.map((s) => (
                <button key={s} type="button" className={`chip ${i.status === s ? 'on' : ''}`} onClick={() => patch({ status: s })}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
          )}
          {!isCoach && i.status !== 'resolved' && <button className="btn small" onClick={() => patch({ status: 'resolved' })}><Icon name="check" size={16} /> Mark as recovered</button>}
          <Thread athleteId={i.athlete_id} type="injury" targetId={i.id} placeholder={isCoach ? 'Advice, rehab plan, return-to-play steps…' : 'Update your coach…'} />
          {isCoach && <button className="btn small ghost danger" onClick={del} style={{ alignSelf: 'flex-start' }}>Delete record</button>}
        </div>
      )}
    </div>
  );
}

/** Protocols the coach has assigned; athletes tick them off each day. */
export function AssignedProtocols({ athleteId }) {
  const { user } = useAuth();
  const isCoach = user.role === 'coach';
  const { data, error, reload } = useApi(`/athletes/${athleteId}/protocols?today=${today()}`);
  const [open, setOpen] = useState(null);
  if (!data) return <Loading error={error} />;
  if (!data.protocols.length) return <Empty>{isCoach ? 'No protocols assigned. Assign one from Coach → Protocols.' : 'No stretching or rehab protocols assigned yet.'}</Empty>;
  const toggle = async (p) => {
    await api(`/protocol-assignments/${p.id}/complete`, { method: 'POST', body: { done: !p.done_today, day: today() } });
    reload();
  };
  const remove = async (p) => {
    if (!confirm(`Remove “${p.name}” from this athlete?`)) return;
    await api(`/protocol-assignments/${p.id}`, { method: 'PATCH', body: { active: false } });
    reload();
  };
  return (
    <div className="tiles">
      {data.protocols.map((p) => (
        <div key={p.id} className="card stack">
          <div className="inline-form" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <Badge>{p.category}</Badge>
              <h3 style={{ marginTop: 8 }}>{p.name}</h3>
              <div className="small muted">{[p.frequency, `${p.done_7d}× in the last 7 days`].filter(Boolean).join(' · ')}</div>
            </div>
            {!isCoach && (
              <button className={`check-btn ${p.done_today ? 'on' : ''}`} onClick={() => toggle(p)} aria-label="Done today"><Icon name="check" /></button>
            )}
          </div>
          {p.note && <p className="small" style={{ margin: 0 }}>📝 {p.note}</p>}
          {open === p.id || data.protocols.length === 1 ? (
            <>
              {p.description && <p className="small muted" style={{ margin: 0 }}>{p.description}</p>}
              <ol className="protocol-items">
                {p.items.map((it, k) => (
                  <li key={k}>
                    <div className="grow">
                      <div>{it.name}</div>
                      <div className="small muted">{[it.dose, it.notes].filter(Boolean).join(' · ')}</div>
                      {it.video_url && <a className="small" href={it.video_url} target="_blank" rel="noreferrer">Watch demo ↗</a>}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <button className="btn small" onClick={() => setOpen(p.id)}>Show {p.items.length} exercises</button>
          )}
          {!isCoach && <button className={`btn ${p.done_today ? '' : 'primary'}`} onClick={() => toggle(p)}>{p.done_today ? 'Done today ✓' : 'Mark done today'}</button>}
          {isCoach && <button className="btn small ghost danger" onClick={() => remove(p)}>Unassign</button>}
        </div>
      ))}
    </div>
  );
}

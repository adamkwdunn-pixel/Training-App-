import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { fmtDate, today, useApi } from '../util.js';
import { ageFrom, nutritionTargets, weeklyRate } from '../../../shared/nutrition.js';
import { METHODS, SITES, TAPE, composition, jacksonPollock, navyBodyFat, sitesFor } from '../../../shared/bodyfat.js';
import { Empty, Loading } from './Bits.jsx';
import Icon from './Icon.jsx';
import LineChart from './LineChart.jsx';

const KCAL_PER_KG = 7700;
const fmt = (n, d = 0) => (n == null ? '—' : Number(n).toFixed(d));

/* ======================================================================
   Targets: the equations, live, with adjustable macros
   ====================================================================== */
export function NutritionTargets({ athleteId }) {
  const { user } = useAuth();
  const isCoach = user.role === 'coach';
  const { data, error, setData } = useApi(`/athletes/${athleteId}/nutrition`);
  const { data: meta } = useApi('/nutrition/meta');
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');

  const p = data?.profile;
  const form = f || (p && {
    sex: p.sex || '', birth_date: p.birth_date || '', height_cm: p.height_cm ?? '', weight: p.weight ?? '',
    activity: p.activity, goal: p.goal, rate: p.rate, bmr_equation: p.bmr_equation, macro_mode: p.macro_mode,
    protein_g_per_kg: p.protein_g_per_kg, fat_g_per_kg: p.fat_g_per_kg, protein_pct: p.protein_pct, fat_pct: p.fat_pct,
    kcal_override: p.kcal_override ?? '',
  });
  // Recalculate on every change so the athlete sees the effect before saving.
  const t = useMemo(() => form && nutritionTargets({
    ...form, height: Number(form.height_cm) || null, weight: Number(form.weight) || null, age: ageFrom(form.birth_date),
    lean_mass: p?.body_fat_pct != null && form.weight ? composition(Number(form.weight), p.body_fat_pct).lean_mass : null,
    kcal_override: form.kcal_override === '' ? null : Number(form.kcal_override),
  }), [form, p]);

  if (!data || !meta) return <Loading error={error} />;
  const set = (k, v) => {
    setF({ ...form, [k]: v });
    setMsg('');
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      const out = await api(`/athletes/${athleteId}/nutrition/profile`, { method: 'PUT', body: { ...form, kcal_override: form.kcal_override === '' ? null : form.kcal_override } });
      setData({ ...data, profile: out.profile, targets: out.targets });
      setF(null);
      setMsg('Saved ✓');
    } catch (e2) {
      setMsg(e2.message);
    }
  };
  const age = ageFrom(form.birth_date);
  const w = Number(form.weight);
  const h = Number(form.height_cm);
  const ready = t && t.kcal != null;
  const carbPct = 100 - Number(form.protein_pct) - Number(form.fat_pct);

  return (
    <form onSubmit={save}>
      {/* ---- results ---- */}
      {ready ? (
        <div className="card">
          <div className="grid4">
            <div className="stat"><span className="stat-label">Calories</span><span className="stat-value">{t.kcal}<small>kcal</small></span></div>
            <div className="stat"><span className="stat-label">Protein</span><span className="stat-value">{t.protein ?? '—'}<small>g</small></span><span className="tiny muted">{t.per_kg ? `${t.per_kg.protein} g/kg · ` : ''}{t.pct.protein}%</span></div>
            <div className="stat"><span className="stat-label">Carbs</span><span className="stat-value">{t.carbs ?? '—'}<small>g</small></span><span className="tiny muted">{t.per_kg ? `${t.per_kg.carbs} g/kg · ` : ''}{t.pct.carbs}%</span></div>
            <div className="stat"><span className="stat-label">Fat</span><span className="stat-value">{t.fat ?? '—'}<small>g</small></span><span className="tiny muted">{t.per_kg ? `${t.per_kg.fat} g/kg · ` : ''}{t.pct.fat}%</span></div>
          </div>
          <MacroBar pct={t.pct} />
          {t.warnings.map((x) => <p key={x} className="small" style={{ color: 'var(--warn)', margin: '10px 0 0' }}>{x}</p>)}
        </div>
      ) : (
        <div className="empty">Enter {t?.missing?.join(', ') || 'your details'} below to calculate targets.</div>
      )}

      {/* ---- the working ---- */}
      {ready && (
        <div className="card">
          <h3>How it’s calculated</h3>
          <div className="equations">
            {t.equation === 'katch' ? (
              <Eq step="1" title="Resting energy — Katch-McArdle" formula="370 + 21.6 × lean mass (kg)"
                working={`370 + 21.6 × ${fmt(composition(w, p.body_fat_pct).lean_mass, 1)}`} result={`${t.bmr} kcal`} />
            ) : (
              <Eq step="1" title="Resting energy — Mifflin-St Jeor"
                formula={`10 × weight + 6.25 × height − 5 × age ${form.sex === 'female' ? '− 161' : '+ 5'}`}
                working={`10 × ${w} + 6.25 × ${h} − 5 × ${age} ${form.sex === 'female' ? '− 161' : '+ 5'}`} result={`${t.bmr} kcal`} />
            )}
            {t.tdee != null && <Eq step="2" title="Maintenance (TDEE)" formula="resting energy × activity factor" working={`${t.bmr} × ${form.activity}`} result={`${t.tdee} kcal`} />}
            {t.overridden ? (
              <Eq step="3" title="Target" formula="set by coach" working="" result={`${t.kcal} kcal`} />
            ) : (
              <Eq step="3" title={form.goal === 'maintain' ? 'Target — maintain' : `Target — ${form.goal} ${form.rate} kg / week`}
                formula={form.goal === 'maintain' ? 'maintenance' : `maintenance ${form.goal === 'gain' ? '+' : '−'} (rate × 7,700 kcal ÷ 7 days)`}
                working={form.goal === 'maintain' ? `${t.tdee}` : `${t.tdee} ${form.goal === 'gain' ? '+' : '−'} (${form.rate} × 7700 ÷ 7)`} result={`${t.kcal} kcal`} />
            )}
            <Eq step="4" title="Macros"
              formula={form.macro_mode === 'percent' ? 'protein & fat as % of calories (4 / 9 kcal per g); carbs = the rest' : 'protein & fat in g per kg; carbs = remaining calories ÷ 4'}
              working={form.macro_mode === 'percent'
                ? `P ${form.protein_pct}% · F ${form.fat_pct}% · C ${carbPct}%`
                : `P ${form.protein_g_per_kg} × ${w} · F ${form.fat_g_per_kg} × ${w} · C (${t.kcal} − ${t.protein}×4 − ${t.fat}×9) ÷ 4`}
              result={`${t.protein} / ${t.carbs} / ${t.fat} g`} />
          </div>
        </div>
      )}

      {/* ---- inputs ---- */}
      <div className="card stack">
        <h3>Goal</h3>
        <div className="segmented" style={{ marginBottom: 0 }}>
          {[['lose', 'Lose'], ['maintain', 'Maintain'], ['gain', 'Gain']].map(([v, l]) => (
            <button type="button" key={v} className={form.goal === v ? 'on' : ''} onClick={() => set('goal', v)}>{l}</button>
          ))}
        </div>
        {form.goal !== 'maintain' && (
          <Slider label={`Rate: ${form.rate} kg per week`} hint={`≈ ${Math.round((form.rate * KCAL_PER_KG) / 7)} kcal / day ${form.goal === 'gain' ? 'surplus' : 'deficit'}`}
            min={0.1} max={1} step={0.05} value={form.rate} onChange={(v) => set('rate', v)} />
        )}

        <h3 style={{ marginTop: 8 }}>About {isCoach ? 'the athlete' : 'you'}</h3>
        <div className="grid2">
          <label>
            Sex
            <select value={form.sex} onChange={(e) => set('sex', e.target.value)}>
              <option value="">Choose…</option><option value="male">Male</option><option value="female">Female</option>
            </select>
          </label>
          <label>Date of birth<input type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} /></label>
          <label>Height (cm)<input type="number" inputMode="decimal" min={120} max={230} value={form.height_cm} onChange={(e) => set('height_cm', e.target.value)} /></label>
          <label>Bodyweight (kg)<input type="number" inputMode="decimal" step="0.1" min={30} max={250} value={form.weight} onChange={(e) => set('weight', e.target.value)} /></label>
        </div>
        <label>
          Activity level
          <select value={form.activity} onChange={(e) => set('activity', Number(e.target.value))}>
            {meta.activity.map((a) => <option key={a.value} value={a.value}>{a.label} (×{a.value})</option>)}
          </select>
        </label>
        <label>
          Resting energy equation
          <select value={form.bmr_equation} onChange={(e) => set('bmr_equation', e.target.value)}>
            {Object.entries(meta.equations).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <p className="tiny muted" style={{ margin: '-6px 0 0' }}>
          {p.body_fat_pct != null
            ? `Latest body fat ${p.body_fat_pct}% (${fmtDate(p.body_fat_on)}). Katch-McArdle uses lean mass, so it suits very muscular athletes better.`
            : 'Katch-McArdle needs a body fat measurement (Nutrition → Body fat).'}
        </p>

        <h3 style={{ marginTop: 8 }}>Macros</h3>
        <div className="segmented" style={{ marginBottom: 0 }}>
          {Object.entries(meta.macro_modes).map(([k, v]) => (
            <button type="button" key={k} className={form.macro_mode === k ? 'on' : ''} onClick={() => set('macro_mode', k)}>{v.replace('Grams per kg bodyweight', 'g per kg')}</button>
          ))}
        </div>
        {form.macro_mode === 'percent' ? (
          <>
            <Slider label={`Protein: ${form.protein_pct}%`} min={10} max={50} step={1} value={form.protein_pct} onChange={(v) => set('protein_pct', v)} />
            <Slider label={`Fat: ${form.fat_pct}%`} min={10} max={50} step={1} value={form.fat_pct} onChange={(v) => set('fat_pct', v)} />
            <div className="kv small"><span className="muted">Carbohydrate (the rest)</span><span>{carbPct}%</span></div>
          </>
        ) : (
          <>
            <Slider label={`Protein: ${form.protein_g_per_kg} g/kg`} hint="Athletes: 1.6–2.2 g/kg; higher when cutting" min={1.2} max={3.2} step={0.1} value={form.protein_g_per_kg} onChange={(v) => set('protein_g_per_kg', v)} />
            <Slider label={`Fat: ${form.fat_g_per_kg} g/kg`} hint="Usually 0.8–1.2 g/kg" min={0.5} max={2} step={0.1} value={form.fat_g_per_kg} onChange={(v) => set('fat_g_per_kg', v)} />
            <div className="kv small"><span className="muted">Carbohydrate (the rest)</span><span>{t?.per_kg ? `${t.per_kg.carbs} g/kg` : '—'}</span></div>
          </>
        )}
        {isCoach && (
          <label>
            Coach calorie override (optional)
            <input type="number" inputMode="numeric" value={form.kcal_override} onChange={(e) => set('kcal_override', e.target.value)} placeholder="Leave empty to use the equations" />
          </label>
        )}
        {!isCoach && p.kcal_override && <p className="small muted" style={{ margin: 0 }}>Your coach has set your calories to {p.kcal_override} kcal.</p>}
      </div>

      <div className="save-bar">
        <span className="small muted">{msg || (f ? 'Unsaved changes' : 'Targets saved')}</span>
        <button className="btn primary" disabled={!f}>Save targets</button>
      </div>
    </form>
  );
}

function Eq({ step, title, formula, working, result }) {
  return (
    <div className="eq">
      <span className="eq-step">{step}</span>
      <div className="grow">
        <div className="small" style={{ fontWeight: 600 }}>{title}</div>
        <div className="tiny muted">{formula}</div>
        {working && <div className="tiny eq-working">{working}</div>}
      </div>
      <strong className="tabular eq-result">{result}</strong>
    </div>
  );
}

function Slider({ label, hint, min, max, step, value, onChange }) {
  return (
    <label>
      <span style={{ color: 'var(--text)' }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="tiny faint" style={{ fontWeight: 500 }}>{hint}</span>}
    </label>
  );
}

function MacroBar({ pct }) {
  return (
    <div className="macro-bar" aria-label="Macro split">
      <div style={{ width: `${pct.protein}%` }}><span>P {pct.protein}%</span></div>
      <div style={{ width: `${pct.carbs}%` }}><span>C {pct.carbs}%</span></div>
      <div style={{ width: `${pct.fat}%` }}><span>F {pct.fat}%</span></div>
    </div>
  );
}

/* ======================================================================
   Bodyweight: weigh-ins, 7-day trend, rate vs goal
   ====================================================================== */
const RANGES = [['4w', 28], ['12w', 84], ['6m', 182], ['All', 100000]];

export function Bodyweight({ athleteId }) {
  const { data, error, reload } = useApi(`/athletes/${athleteId}/nutrition`);
  const [w, setW] = useState('');
  const [date, setDate] = useState(today());
  const [range, setRange] = useState(84);
  const [showAll, setShowAll] = useState(false);
  const [err, setErr] = useState('');
  if (!data) return <Loading error={error} />;

  const add = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api(`/athletes/${athleteId}/bodyweight`, { method: 'POST', body: { weight: w, measured_on: date } });
      setW('');
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  };
  const del = async (d) => {
    if (!confirm(`Delete the weigh-in on ${fmtDate(d)}?`)) return;
    await api(`/athletes/${athleteId}/bodyweight/${d}`, { method: 'DELETE' });
    reload();
  };

  const p = data.profile;
  const all = data.weights;
  const cutoff = new Date(Date.now() - range * 864e5).toISOString().slice(0, 10);
  const shown = all.filter((x) => x.date >= cutoff);
  const target = p.goal === 'maintain' ? 0 : p.goal === 'gain' ? p.rate : -p.rate;
  const rate = data.rate_28d;
  const latest = all.at(-1);
  const rate7 = weeklyRate(all, 14);
  const onTrack = rate == null ? null : p.goal === 'maintain' ? Math.abs(rate) <= 0.25 : Math.abs(rate - target) <= 0.25;

  return (
    <>
      <form className="card inline-form wrap" onSubmit={add}>
        <input className="grow" required type="number" inputMode="decimal" step="0.1" placeholder="Weight (kg)" value={w} onChange={(e) => setW(e.target.value)} style={{ minWidth: 140 }} />
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} style={{ width: 'auto' }} />
        <button className="btn primary">Log weigh-in</button>
        {err && <p className="error" style={{ flexBasis: '100%' }}>{err}</p>}
      </form>

      {all.length === 0 ? (
        <Empty>No weigh-ins yet. Weigh in first thing in the morning, after the toilet and before food, 3–7 times a week.</Empty>
      ) : (
        <>
          <div className="grid4" style={{ marginBottom: 14 }}>
            <div className="card flat stat" style={{ margin: 0 }}><span className="stat-label">Latest</span><span className="stat-value">{latest.weight}<small>kg</small></span><span className="tiny muted">{fmtDate(latest.date)}</span></div>
            <div className="card flat stat" style={{ margin: 0 }}><span className="stat-label">7-day average</span><span className="stat-value">{latest.trend}<small>kg</small></span></div>
            <div className="card flat stat" style={{ margin: 0 }}>
              <span className="stat-label">Rate (4 wk)</span>
              <span className="stat-value">{rate == null ? '—' : `${rate > 0 ? '+' : ''}${rate}`}<small>kg/wk</small></span>
              {rate7 != null && <span className="tiny muted">last 2 wk: {rate7 > 0 ? '+' : ''}{rate7}</span>}
            </div>
            <div className="card flat stat" style={{ margin: 0 }}>
              <span className="stat-label">Goal</span>
              <span className="stat-value">{p.goal === 'maintain' ? '±0' : `${target > 0 ? '+' : ''}${target}`}<small>kg/wk</small></span>
              {onTrack != null && <span className={`tiny ${onTrack ? '' : 'muted'}`} style={{ color: onTrack ? 'var(--good)' : 'var(--warn)' }}>{onTrack ? 'On track' : rate == null ? '' : 'Off target'}</span>}
            </div>
          </div>

          <div className="tabs">
            {RANGES.map(([l, d]) => <button key={l} className={range === d ? 'on' : ''} onClick={() => setRange(d)}>{l}</button>)}
          </div>
          <LineChart points={shown} yKey="weight" trendKey="trend" label="7-day average" unit=" kg" lowerIsBetter={p.goal === 'lose'} />
          <p className="tiny faint" style={{ margin: '6px 4px 0' }}>Dots are individual weigh-ins; the line is the 7-day average, which smooths out water and food swings.</p>
          <WeeklyChange weights={all} />

          <h2>Weigh-ins</h2>
          <div className="list">
            {[...all].reverse().slice(0, showAll ? undefined : 10).map((x, i, arr) => {
              const prev = arr[i + 1];
              const d = prev ? Math.round((x.weight - prev.weight) * 10) / 10 : null;
              return (
                <div key={x.date} className="row">
                  <span className="grow muted small">{fmtDate(x.date)}</span>
                  {d != null && <span className="tiny faint tabular">{d > 0 ? '+' : ''}{d}</span>}
                  <strong className="tabular">{x.weight} kg</strong>
                  <button className="icon-btn" onClick={() => del(x.date)} aria-label="Delete"><Icon name="trash" size={16} /></button>
                </div>
              );
            })}
            {!showAll && all.length > 10 && <button className="row muted" onClick={() => setShowAll(true)}>Show all {all.length} weigh-ins</button>}
          </div>
        </>
      )}
    </>
  );
}

/** Week-by-week average and change, the clearest view of a trend. */
function WeeklyChange({ weights }) {
  const weeks = useMemo(() => {
    const by = new Map();
    for (const w of weights) {
      const d = new Date(`${w.date}T00:00:00`);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
      const k = d.toISOString().slice(0, 10);
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(w.weight);
    }
    const out = [...by.entries()].map(([week, ws]) => ({ week, avg: Math.round((ws.reduce((a, b) => a + b, 0) / ws.length) * 10) / 10, n: ws.length }));
    return out.map((w, i) => ({ ...w, change: i ? Math.round((w.avg - out[i - 1].avg) * 100) / 100 : null })).slice(-8).reverse();
  }, [weights]);
  if (weeks.length < 2) return null;
  const maxAbs = Math.max(0.1, ...weeks.map((w) => Math.abs(w.change || 0)));
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>Weekly averages <span className="tiny muted" style={{ fontWeight: 500 }}>(week starting)</span></h3>
      {weeks.map((w) => (
        <div key={w.week} className="week-row">
          <span className="small muted">{new Date(`${w.week}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
          <strong className="tabular">{w.avg.toFixed(1)}</strong>
          <div className="delta-track">
            {w.change != null && <div className={`delta ${w.change >= 0 ? 'pos' : 'neg'}`} style={{ width: `${(Math.abs(w.change) / maxAbs) * 50}%` }} />}
          </div>
          <span className="tabular small" style={{ width: 52, textAlign: 'right' }}>{w.change == null ? '' : `${w.change > 0 ? '+' : ''}${w.change}`}</span>
        </div>
      ))}
    </div>
  );
}

/* ======================================================================
   Body fat: calipers (Jackson-Pollock) or US Navy tape method
   ====================================================================== */
export function BodyFat({ athleteId }) {
  const { data, error, reload } = useApi(`/athletes/${athleteId}/bodycomp`);
  const [method, setMethod] = useState('jp7');
  const [vals, setVals] = useState({});
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [explain, setExplain] = useState(false);
  const [trendMethod, setTrendMethod] = useState(null);

  if (!data) return <Loading error={error} />;
  const prof = data.profile;
  const age = prof.age;
  const missing = [!prof.sex && 'sex', age == null && 'date of birth', !prof.height_cm && method === 'navy' && 'height'].filter(Boolean);
  const set = (k, v) => setVals({ ...vals, [k]: v });

  const sites = sitesFor(method, prof.sex);
  const preview = method === 'navy'
    ? navyBodyFat({ sex: prof.sex, height: prof.height_cm, neck: vals.neck, waist: vals.waist, hip: vals.hip })
    : method === 'other' ? (Number(vals.body_fat_pct) || null)
      : jacksonPollock({ method, sex: prof.sex, age, sites: vals })?.pct ?? null;
  const sum = method.startsWith('jp') ? jacksonPollock({ method, sex: prof.sex, age, sites: vals })?.sum : null;
  const wNum = Number(weight) || prof.weight;
  const comp = composition(wNum, preview);

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api(`/athletes/${athleteId}/bodycomp`, {
        method: 'POST',
        body: { method, measured_on: date, weight: weight || undefined, notes, sites: vals, ...vals },
      });
      setVals({});
      setNotes('');
      setWeight('');
      setMsg('Saved ✓');
      reload();
    } catch (e2) {
      setMsg(e2.message);
    }
  };
  const del = async (m) => {
    if (!confirm(`Delete the ${fmtDate(m.measured_on)} measurement?`)) return;
    await api(`/bodycomp/${m.id}`, { method: 'DELETE' });
    reload();
  };

  const ms = data.measurements;
  const latest = ms.at(-1);
  // Different methods give different numbers, so trends are drawn one method at a time.
  const usedMethods = [...new Set(ms.map((m) => m.method))];
  const chartMethod = usedMethods.includes(trendMethod) ? trendMethod : latest?.method;
  const series = ms.filter((m) => m.method === chartMethod);

  return (
    <>
      {latest && (
        <div className="grid4" style={{ marginBottom: 14 }}>
          <div className="card flat stat" style={{ margin: 0 }}><span className="stat-label">Body fat</span><span className="stat-value">{latest.body_fat_pct}<small>%</small></span><span className="tiny muted">{fmtDate(latest.measured_on)}</span></div>
          <div className="card flat stat" style={{ margin: 0 }}><span className="stat-label">Lean mass</span><span className="stat-value">{fmt(latest.lean_mass, 1)}<small>kg</small></span></div>
          <div className="card flat stat" style={{ margin: 0 }}><span className="stat-label">Fat mass</span><span className="stat-value">{fmt(latest.fat_mass, 1)}<small>kg</small></span></div>
          <div className="card flat stat" style={{ margin: 0 }}><span className="stat-label">Method</span><span className="small" style={{ fontWeight: 600 }}>{METHODS[latest.method]}</span>{latest.sum_mm != null && <span className="tiny muted">Σ {latest.sum_mm} mm</span>}</div>
        </div>
      )}

      <form className="card stack" onSubmit={save}>
        <h3>New measurement</h3>
        <div className="chips">
          {[['jp7', 'Calipers · 7-site'], ['jp3', 'Calipers · 3-site'], ['navy', 'US Navy tape'], ['other', 'Other']].map(([k, l]) => (
            <button type="button" key={k} className={`chip ${method === k ? 'on' : ''}`} onClick={() => { setMethod(k); setVals({}); setMsg(''); }}>{l}</button>
          ))}
        </div>
        <button type="button" className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setExplain(!explain)}>
          <Icon name={explain ? 'up' : 'down'} size={16} /> How {method === 'navy' ? 'the US Navy method' : method === 'other' ? 'other methods compare' : 'the caliper method'} works
        </button>
        {explain && <Explainer method={method} sex={prof.sex} />}

        {missing.length > 0 && method !== 'other' ? (
          <p className="small" style={{ color: 'var(--warn)', margin: 0 }}>Add {missing.join(', ')} in Nutrition → Targets first — the equations need them.</p>
        ) : (
          <>
            {method === 'navy' && (
              <div className="grid2">
                {['neck', 'waist', ...(prof.sex === 'female' ? ['hip'] : [])].map((k) => (
                  <label key={k}>
                    {TAPE[k].label} (cm)
                    <input required type="number" inputMode="decimal" step="0.1" value={vals[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
                    <span className="tiny faint" style={{ fontWeight: 500 }}>{TAPE[k].how}</span>
                  </label>
                ))}
                <div className="small muted" style={{ alignSelf: 'center' }}>Height {prof.height_cm} cm (from your profile)</div>
              </div>
            )}
            {method.startsWith('jp') && (
              <div className="grid2">
                {sites.map((k) => (
                  <label key={k}>
                    {SITES[k].label} (mm)
                    <input required type="number" inputMode="decimal" step="0.5" value={vals[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
                    <span className="tiny faint" style={{ fontWeight: 500 }}>{SITES[k].how}</span>
                  </label>
                ))}
              </div>
            )}
            {method === 'other' && (
              <div className="grid2">
                <label>Body fat %<input required type="number" inputMode="decimal" step="0.1" value={vals.body_fat_pct ?? ''} onChange={(e) => set('body_fat_pct', e.target.value)} /></label>
                <label>Source<input value={vals.source ?? ''} onChange={(e) => set('source', e.target.value)} placeholder="e.g. DEXA scan" /></label>
              </div>
            )}
            <div className="grid2">
              <label>Date<input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
              <label>Bodyweight today (kg)<input type="number" inputMode="decimal" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={prof.weight ? `${prof.weight} (latest)` : ''} /></label>
            </div>
            <label>Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — who measured, time of day…" /></label>

            <div className="result-box">
              <div>
                <div className="stat-label">Estimated body fat</div>
                <div className="num-big">{preview != null ? preview : '—'}<span className="small muted">%</span></div>
              </div>
              <div className="small muted tabular" style={{ textAlign: 'right' }}>
                {sum != null && <div>Σ skinfolds {sum} mm</div>}
                {comp.lean_mass != null && <div>Lean {comp.lean_mass} kg · Fat {comp.fat_mass} kg</div>}
              </div>
            </div>
            <div className="inline-form">
              <button className="btn primary" disabled={preview == null}>Save measurement</button>
              {msg && <span className="small muted">{msg}</span>}
            </div>
          </>
        )}
      </form>

      {ms.length > 0 && (
        <>
          <h2>Trends</h2>
          {usedMethods.length > 1 && (
            <div className="tabs scroll-x">
              {usedMethods.map((m) => <button key={m} className={m === chartMethod ? 'on' : ''} onClick={() => setTrendMethod(m)}>{METHODS[m].replace('Calipers — Jackson-Pollock', 'Calipers').replace(' (tape measure)', '')}</button>)}
            </div>
          )}
          <div className="charts">
            <LineChart points={series} yKey="body_fat_pct" xKey="measured_on" label="Body fat %" unit="%" lowerIsBetter />
            <LineChart points={series} yKey="lean_mass" xKey="measured_on" label="Lean mass" unit=" kg" />
            {series.some((m) => m.sum_mm != null) && <LineChart points={series} yKey="sum_mm" xKey="measured_on" label="Sum of skinfolds" unit=" mm" lowerIsBetter />}
          </div>
          <h2>History</h2>
          <div className="list">
            {[...ms].reverse().map((m) => (
              <div key={m.id} className="row">
                <div className="grow">
                  <strong className="tabular">{m.body_fat_pct}%</strong>
                  <span className="muted small"> · {METHODS[m.method]}{m.sum_mm != null ? ` · Σ ${m.sum_mm} mm` : ''}</span>
                  <div className="tiny muted">{fmtDate(m.measured_on)}{m.bodyweight ? ` · ${m.bodyweight} kg · lean ${m.lean_mass} kg` : ''}{m.created_by_name ? ` · by ${m.created_by_name}` : ''}{m.notes ? ` · ${m.notes}` : ''}</div>
                </div>
                <button className="icon-btn" onClick={() => del(m)} aria-label="Delete"><Icon name="trash" size={16} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Explainer({ method, sex }) {
  if (method === 'navy') {
    return (
      <div className="explain small">
        <p><strong>What it is.</strong> A tape-measure method developed by Hodgdon and Beckett at the US Naval Health Research Center (1984). It was built by measuring sailors’ body fat by underwater weighing, then finding which body circumferences predicted it best.</p>
        <p><strong>How it works.</strong> Fat collects around the waist (and hips in women), while the neck mostly reflects frame and muscle. So the bigger your waist is relative to your neck, the higher the predicted body fat. Height scales the result to body size. The equation uses logarithms of those measurements:</p>
        <p className="formula-line">{sex === 'female'
          ? '%BF = 495 ÷ (1.29579 − 0.35004 × log₁₀(waist + hip − neck) + 0.22100 × log₁₀(height)) − 450'
          : '%BF = 495 ÷ (1.0324 − 0.19077 × log₁₀(waist − neck) + 0.15456 × log₁₀(height)) − 450'}</p>
        <p>The “495 ÷ … − 450” part is the Siri equation, which turns estimated body density into a body fat percentage.</p>
        <p><strong>Accuracy.</strong> Typically within about ±3–4% of lab methods for most people. Heavily muscled athletes with thick necks (front-rowers!) tend to read <em>lower</em> than they really are, and athletes carrying a lot of abdominal muscle or bloating can read higher.</p>
        <p><strong>Getting reliable numbers.</strong> Measure in the morning before food, with a non-stretch tape snug on the skin but not compressing it. Take each measurement 2–3 times and use the average. The trend over time matters more than any single reading.</p>
      </div>
    );
  }
  if (method === 'other') {
    return (
      <div className="explain small">
        <p>Use this to record a result from another method — e.g. a DEXA scan (the most accurate widely available option), Bod Pod, or bioimpedance scales/InBody (convenient but strongly affected by hydration).</p>
        <p>Different methods give different numbers for the same person, so compare like with like when tracking change.</p>
      </div>
    );
  }
  return (
    <div className="explain small">
      <p><strong>How it works.</strong> Calipers measure the thickness of a pinched fold of skin and the fat just under it. Jackson and Pollock measured hundreds of people by underwater weighing and produced equations that predict <em>body density</em> from the sum of the skinfolds, age and sex. Body density is then converted to body fat % with the Siri equation: %BF = 495 ÷ density − 450.</p>
      <p><strong>3-site vs 7-site.</strong> The 3-site version is quicker ({sex === 'female' ? 'triceps, suprailiac, thigh' : 'chest, abdomen, thigh'}). The 7-site version samples more of the body, so it’s a bit more reliable for athletes whose fat is distributed unevenly.</p>
      <p><strong>Tip for coaches.</strong> Many S&amp;C staff track the <em>sum of skinfolds in mm</em> rather than %, because it avoids the equation’s error entirely. Both are saved here.</p>
      <p><strong>Technique.</strong> Measure on the right side of the body with the athlete relaxed. Pinch the fold firmly with thumb and finger about 1 cm above the site, apply the calipers, and read after 1–2 seconds. Take each site 2–3 times and average them (redo if readings differ by more than 1–2 mm). Use the same tester, same calipers and same time of day each time — before training, not after.</p>
    </div>
  );
}

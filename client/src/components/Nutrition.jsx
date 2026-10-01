import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { today, useApi } from '../util.js';
import { Loading } from './Bits.jsx';
import Icon from './Icon.jsx';
import LineChart from './LineChart.jsx';
import Ring, { Bar } from './Ring.jsx';

const r0 = (n) => Math.round(n || 0);
const shift = (d, days) => {
  const x = new Date(`${d}T00:00:00`);
  x.setDate(x.getDate() + days);
  return x.toISOString().slice(0, 10);
};
const dayLabel = (d) => (d === today() ? 'Today' : d === shift(today(), -1) ? 'Yesterday' : new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }));

/** Day view: calories ring, macro bars, meals, add food, MyFitnessPal import. */
export function FoodLog({ athleteId }) {
  const [date, setDate] = useState(today());
  const { data, error, reload } = useApi(`/athletes/${athleteId}/nutrition?date=${date}`);
  const { data: meta } = useApi('/nutrition/meta');
  const [adding, setAdding] = useState(null); // meal name

  if (!data || !meta) return <Loading error={error} />;
  const t = data.targets;
  const tot = data.totals;
  const left = t.kcal ? t.kcal - tot.kcal : null;
  const del = async (id) => {
    await api(`/food/${id}`, { method: 'DELETE' });
    reload();
  };
  const meals = [...meta.meals, ...new Set(data.entries.map((e) => e.meal).filter((m) => !meta.meals.includes(m)))];

  return (
    <>
      <div className="date-switch">
        <button className="icon-btn outlined" onClick={() => setDate(shift(date, -1))} aria-label="Previous day"><Icon name="left" /></button>
        <strong>{dayLabel(date)}</strong>
        <button className="icon-btn outlined" onClick={() => setDate(shift(date, 1))} disabled={date >= today()} aria-label="Next day"><Icon name="right" /></button>
      </div>

      <div className="card">
        <div className="ring-wrap">
          <Ring value={tot.kcal} max={t.kcal || tot.kcal || 1}>
            <strong>{left != null ? r0(Math.abs(left)) : r0(tot.kcal)}</strong>
            <span className="tiny muted">{left == null ? 'kcal eaten' : left >= 0 ? 'kcal left' : 'kcal over'}</span>
          </Ring>
          <div className="macros">
            {[['Calories', 'kcal', ''], ['Protein', 'protein', 'g'], ['Carbs', 'carbs', 'g'], ['Fat', 'fat', 'g']].map(([label, k, u]) => (
              <div key={k}>
                <div className="macro-top"><span>{label}</span><span className="tabular muted">{r0(tot[k])}{t[k] ? ` / ${t[k]}` : ''} {u}</span></div>
                <Bar value={tot[k]} max={t[k] || 0} />
              </div>
            ))}
          </div>
        </div>
        {t.missing?.length > 0 && !t.kcal && <p className="small muted" style={{ marginBottom: 0 }}>Add your {t.missing.join(', ')} in Targets to get calorie and macro goals.</p>}
      </div>

      {meals.map((m) => {
        const items = data.entries.filter((e) => e.meal === m);
        if (!items.length && !meta.meals.slice(0, 4).includes(m) && adding !== m) return null;
        const kcal = items.reduce((s, e) => s + e.kcal, 0);
        return (
          <div key={m} className="meal">
            <div className="meal-head">
              <h3>{m}</h3>
              <span className="small muted tabular">{r0(kcal)} kcal</span>
            </div>
            <div className="list">
              {items.map((e) => (
                <div key={e.id} className="row">
                  <div className="grow">
                    <div>{e.name}{e.quantity && <span className="muted"> · {e.quantity}</span>}</div>
                    <div className="tiny muted tabular">P {r0(e.protein)} · C {r0(e.carbs)} · F {r0(e.fat)}</div>
                  </div>
                  <span className="tabular">{r0(e.kcal)}</span>
                  <button className="icon-btn" onClick={() => del(e.id)} aria-label="Remove"><Icon name="trash" size={16} /></button>
                </div>
              ))}
              {adding !== m && (
                <button className="row muted" onClick={() => setAdding(m)}><Icon name="plus" size={18} /> Add food</button>
              )}
            </div>
            {adding === m && <AddFood athleteId={athleteId} date={date} meal={m} meals={meta.meals} recent={data.recent} onDone={() => { setAdding(null); reload(); }} />}
          </div>
        );
      })}

      <MfpImport athleteId={athleteId} onDone={reload} />
    </>
  );
}

function AddFood({ athleteId, date, meal, meals, recent, onDone }) {
  const blank = { name: '', quantity: '', kcal: '', protein: '', carbs: '', fat: '', meal };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (entry) => {
    setErr('');
    try {
      await api(`/athletes/${athleteId}/food`, { method: 'POST', body: { ...entry, eaten_on: date } });
      onDone();
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); save(f); }}>
      {recent.length > 0 && (
        <div>
          <div className="tiny muted" style={{ marginBottom: 6 }}>QUICK ADD</div>
          <div className="chips">
            {recent.slice(0, 10).map((r) => (
              <button type="button" key={`${r.name}${r.quantity}`} className="chip" onClick={() => save({ ...r, meal: f.meal })}>
                {r.name}{r.quantity ? ` · ${r.quantity}` : ''} <span className="muted">{r0(r.kcal)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid2">
        <label>Food<input required autoFocus value={f.name} onChange={set('name')} placeholder="e.g. Chicken breast" /></label>
        <label>Amount<input value={f.quantity} onChange={set('quantity')} placeholder="e.g. 200 g" /></label>
      </div>
      <div className="grid4">
        <label>Calories<input type="number" inputMode="decimal" value={f.kcal} onChange={set('kcal')} placeholder="auto" /></label>
        <label>Protein g<input type="number" inputMode="decimal" value={f.protein} onChange={set('protein')} /></label>
        <label>Carbs g<input type="number" inputMode="decimal" value={f.carbs} onChange={set('carbs')} /></label>
        <label>Fat g<input type="number" inputMode="decimal" value={f.fat} onChange={set('fat')} /></label>
      </div>
      <label>
        Meal
        <select value={f.meal} onChange={set('meal')}>{meals.map((m) => <option key={m}>{m}</option>)}</select>
      </label>
      {err && <p className="error">{err}</p>}
      <div className="row-actions" style={{ marginTop: 0 }}>
        <button className="btn primary">Add</button>
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
        <span className="tiny muted">Leave calories empty to calculate from macros.</span>
      </div>
    </form>
  );
}

function MfpImport({ athleteId, onDone }) {
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg('Importing…');
    try {
      const out = await api(`/athletes/${athleteId}/food/import-mfp`, { method: 'POST', body: { csv: await file.text() } });
      setMsg(`Imported ${out.imported} meals across ${out.days} day${out.days === 1 ? '' : 's'} (${out.from} → ${out.to}).`);
      onDone();
    } catch (e2) {
      setMsg(e2.message);
    }
    e.target.value = '';
  };
  return (
    <div className="card soft">
      <button className="row" style={{ padding: 0 }} onClick={() => setOpen(!open)}>
        <Icon name="upload" />
        <div className="grow"><strong>Import from MyFitnessPal</strong><div className="small muted">Bring in your logged meals</div></div>
        <Icon name={open ? 'up' : 'down'} size={18} />
      </button>
      {open && (
        <div className="stack" style={{ marginTop: 14 }}>
          <ol className="small muted" style={{ margin: 0, paddingLeft: '1.2rem' }}>
            <li>On myfitnesspal.com go to <strong>Reports → Export data</strong> (needs Premium) and pick a date range.</li>
            <li>Open the emailed zip and find the <strong>Nutrition Summary</strong> CSV file.</li>
            <li>Upload it here. Re-importing the same days replaces them, so nothing is counted twice.</li>
          </ol>
          <label className="file-drop">
            <Icon name="upload" />
            <span>Choose MyFitnessPal CSV</span>
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
          </label>
          {msg && <p className="small">{msg}</p>}
        </div>
      )}
    </div>
  );
}

/** Mifflin-St Jeor calculator + goal setting. */
export function NutritionTargets({ athleteId }) {
  const { user } = useAuth();
  const isCoach = user.role === 'coach';
  const { data, error, setData } = useApi(`/athletes/${athleteId}/nutrition`);
  const { data: meta } = useApi('/nutrition/meta');
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');

  if (!data || !meta) return <Loading error={error} />;
  const p = data.profile;
  const form = f || {
    sex: p.sex || '', birth_date: p.birth_date || '', height_cm: p.height_cm || '', weight: p.weight || '',
    activity: p.activity, goal: p.goal, rate: p.rate, protein_g_per_kg: p.protein_g_per_kg, fat_pct: p.fat_pct, kcal_override: p.kcal_override || '',
  };
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
  const t = data.targets;

  return (
    <>
      {t.kcal ? (
        <div className="card">
          <div className="grid4">
            <div className="stat"><span className="stat-label">Daily target</span><span className="stat-value">{t.kcal}<small>kcal</small></span></div>
            <div className="stat"><span className="stat-label">Protein</span><span className="stat-value">{t.protein ?? '—'}<small>g</small></span></div>
            <div className="stat"><span className="stat-label">Carbs</span><span className="stat-value">{t.carbs ?? '—'}<small>g</small></span></div>
            <div className="stat"><span className="stat-label">Fat</span><span className="stat-value">{t.fat}<small>g</small></span></div>
          </div>
          <div className="divider" style={{ margin: '16px 0 10px' }} />
          <div className="formula small">
            {t.bmr != null && <div className="kv"><span className="muted">Resting energy (Mifflin-St Jeor)</span><span>{t.bmr} kcal</span></div>}
            {t.tdee != null && <div className="kv"><span className="muted">× activity {p.activity} = maintenance</span><span>{t.tdee} kcal</span></div>}
            {t.adjust ? <div className="kv"><span className="muted">{p.goal === 'gain' ? 'Surplus' : 'Deficit'} for {p.rate} kg / week</span><span>{t.adjust > 0 ? '+' : ''}{t.adjust} kcal</span></div> : null}
            {t.overridden && <div className="kv"><span className="muted">Set by coach</span><span>{t.kcal} kcal</span></div>}
          </div>
        </div>
      ) : (
        <div className="empty">Fill in the details below to calculate calorie and macro targets.</div>
      )}

      <form className="card stack" onSubmit={save}>
        <h3>Goal</h3>
        <div className="segmented" style={{ marginBottom: 0 }}>
          {[['lose', 'Lose'], ['maintain', 'Maintain'], ['gain', 'Gain']].map(([v, l]) => (
            <button type="button" key={v} className={form.goal === v ? 'on' : ''} onClick={() => set('goal', v)}>{l}</button>
          ))}
        </div>
        {form.goal !== 'maintain' && (
          <label>
            Rate
            <select value={form.rate} onChange={(e) => set('rate', e.target.value)}>
              {[0.1, 0.25, 0.5, 0.75, 1].map((v) => <option key={v} value={v}>{v} kg per week (≈ {Math.round((v * 7700) / 7)} kcal / day)</option>)}
            </select>
          </label>
        )}
        <h3 style={{ marginTop: 6 }}>About {isCoach ? 'the athlete' : 'you'}</h3>
        <div className="grid2">
          <label>
            Sex
            <select required value={form.sex} onChange={(e) => set('sex', e.target.value)}>
              <option value="">Choose…</option><option value="male">Male</option><option value="female">Female</option>
            </select>
          </label>
          <label>Date of birth<input required type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} /></label>
          <label>Height (cm)<input required type="number" inputMode="decimal" min={120} max={230} value={form.height_cm} onChange={(e) => set('height_cm', e.target.value)} /></label>
          <label>Bodyweight (kg)<input required type="number" inputMode="decimal" step="0.1" min={30} max={250} value={form.weight} onChange={(e) => set('weight', e.target.value)} /></label>
        </div>
        <label>
          Activity level
          <select value={form.activity} onChange={(e) => set('activity', e.target.value)}>
            {meta.activity.map((a) => <option key={a.value} value={a.value}>{a.label} (×{a.value})</option>)}
          </select>
        </label>
        <div className="grid2">
          <label>Protein (g per kg)<input type="number" inputMode="decimal" step="0.1" min={1} max={3.5} value={form.protein_g_per_kg} onChange={(e) => set('protein_g_per_kg', e.target.value)} /></label>
          <label>Fat (% of calories)<input type="number" inputMode="numeric" min={10} max={50} value={form.fat_pct} onChange={(e) => set('fat_pct', e.target.value)} /></label>
        </div>
        {isCoach && (
          <label>
            Coach calorie override (optional)
            <input type="number" inputMode="numeric" value={form.kcal_override} onChange={(e) => set('kcal_override', e.target.value)} placeholder="Leave empty to use the calculation" />
          </label>
        )}
        <div className="row-actions" style={{ marginTop: 0 }}>
          <button className="btn primary">Save &amp; calculate</button>
          {msg && <span className="small muted">{msg}</span>}
        </div>
      </form>
    </>
  );
}

export function Bodyweight({ athleteId }) {
  const { data, error, reload } = useApi(`/athletes/${athleteId}/nutrition`);
  const [w, setW] = useState('');
  const [date, setDate] = useState(today());
  if (!data) return <Loading error={error} />;
  const add = async (e) => {
    e.preventDefault();
    await api(`/athletes/${athleteId}/bodyweight`, { method: 'POST', body: { weight: w, measured_on: date } });
    setW('');
    reload();
  };
  const ws = data.weights;
  const goal = data.profile.goal;
  return (
    <>
      <form className="card inline-form wrap" onSubmit={add}>
        <input className="grow" required type="number" inputMode="decimal" step="0.1" placeholder="Weight (kg)" value={w} onChange={(e) => setW(e.target.value)} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 'auto' }} />
        <button className="btn primary">Log weigh-in</button>
      </form>
      <p className="small muted">Weigh in first thing in the morning, after the toilet, before food. Goal: <strong>{goal === 'lose' ? 'lose' : goal === 'gain' ? 'gain' : 'maintain'} weight</strong>.</p>
      <LineChart points={ws} yKey="weight" label="Bodyweight" unit=" kg" lowerIsBetter={goal === 'lose'} />
      {ws.length > 0 && (
        <div className="list" style={{ marginTop: 14 }}>
          {[...ws].reverse().slice(0, 14).map((x) => (
            <div key={x.date} className="row"><span className="grow muted">{new Date(`${x.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span><strong className="tabular">{x.weight} kg</strong></div>
          ))}
        </div>
      )}
    </>
  );
}

/** Two-week intake vs target, for the coach's athlete page. */
export function IntakeTrend({ athleteId }) {
  const { data } = useApi(`/athletes/${athleteId}/nutrition`);
  if (!data) return null;
  return (
    <div className="charts">
      <LineChart points={data.week} yKey="kcal" label="Calories (14 days)" target={data.targets.kcal} />
      <LineChart points={data.week} yKey="protein" label="Protein g (14 days)" target={data.targets.protein} />
    </div>
  );
}

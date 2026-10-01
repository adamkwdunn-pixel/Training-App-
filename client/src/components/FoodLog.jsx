import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { today, useApi } from '../util.js';
import { useAuth } from '../App.jsx';
import { Badge, Loading } from './Bits.jsx';
import Icon from './Icon.jsx';
import Ring, { Bar } from './Ring.jsx';

const r0 = (n) => Math.round(n || 0);
const shift = (d, days) => {
  const x = new Date(`${d}T00:00:00`);
  x.setDate(x.getDate() + days);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const dayLabel = (d) => (d === today() ? 'Today' : d === shift(today(), -1) ? 'Yesterday' : new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }));
const guessMeal = () => {
  const h = new Date().getHours();
  return h < 10 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snack';
};

/** Day view: describe what you ate, get an AI estimate, log it, and see the day against your targets. */
export default function FoodLog({ athleteId }) {
  const { user } = useAuth();
  const [date, setDate] = useState(today());
  const { data, error, reload } = useApi(`/athletes/${athleteId}/food?date=${date}`);
  const { data: meta } = useApi('/nutrition/meta');
  if (!data || !meta) return <Loading error={error} />;
  const t = data.targets;
  const tot = data.totals;
  const left = t.kcal ? t.kcal - tot.kcal : null;
  const meals = meta.meals.filter((m) => data.entries.some((e) => e.meal === m));

  const del = async (id) => {
    if (!confirm('Remove this from the log?')) return;
    await api(`/food/${id}`, { method: 'DELETE' });
    reload();
  };

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
            {[['Calories', 'kcal', ''], ['Protein', 'protein', ' g'], ['Carbs', 'carbs', ' g'], ['Fat', 'fat', ' g']].map(([label, k, u]) => (
              <div key={k}>
                <div className="macro-top"><span>{label}</span><span className="tabular muted">{r0(tot[k])}{t[k] ? ` / ${t[k]}` : ''}{u}</span></div>
                <Bar value={tot[k]} max={t[k] || 0} />
              </div>
            ))}
          </div>
        </div>
        {!t.kcal && (
          <p className="small muted" style={{ margin: '12px 0 0' }}>
            {user.role === 'coach' ? 'Set up targets on the Targets tab to compare intake with their goal.' : <>Set up your <Link to="/nutrition/targets">targets</Link> to see how this compares with your goal.</>}
          </p>
        )}
      </div>

      <AddMeal athleteId={athleteId} date={date} meals={meta.meals} aiEnabled={meta.ai_enabled} onSaved={reload} />

      {data.entries.length === 0 && <p className="muted small" style={{ textAlign: 'center' }}>Nothing logged for {dayLabel(date).toLowerCase()} yet.</p>}
      {meals.map((m) => {
        const list = data.entries.filter((e) => e.meal === m);
        return (
          <div key={m} className="meal">
            <div className="meal-head">
              <h3>{m}</h3>
              <span className="small muted tabular">{r0(list.reduce((s, e) => s + e.kcal, 0))} kcal</span>
            </div>
            <div className="list">
              {list.map((e) => <MealRow key={e.id} e={e} onDelete={() => del(e.id)} />)}
            </div>
          </div>
        );
      })}
    </>
  );
}

function MealRow({ e, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <button className="grow meal-row-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="clamp">{e.description}</div>
        <div className="tiny muted tabular">
          {r0(e.kcal)} kcal · P {r0(e.protein)} · C {r0(e.carbs)} · F {r0(e.fat)}
          {e.source === 'ai' ? ' · AI estimate' : ''}
        </div>
        {open && e.items.length > 0 && (
          <div className="meal-items">
            {e.items.map((i, k) => (
              <div key={k} className="kv tiny"><span>{i.name}{i.quantity ? <span className="muted"> · {i.quantity}</span> : null}</span><span className="tabular">{r0(i.kcal)} kcal</span></div>
            ))}
          </div>
        )}
      </button>
      <button className="icon-btn" onClick={onDelete} aria-label="Remove"><Icon name="trash" size={16} /></button>
    </div>
  );
}

function AddMeal({ athleteId, date, meals, aiEnabled, onSaved }) {
  const [text, setText] = useState('');
  const [meal, setMeal] = useState(guessMeal);
  const [est, setEst] = useState(null);
  const [vals, setVals] = useState(null); // editable totals
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [manual, setManual] = useState(!aiEnabled);

  const estimate = async () => {
    setErr('');
    setBusy(true);
    try {
      const { estimate: e } = await api(`/athletes/${athleteId}/food/estimate`, { method: 'POST', body: { text } });
      setEst(e);
      setVals({ ...e.totals });
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setErr('');
    try {
      await api(`/athletes/${athleteId}/food`, {
        method: 'POST',
        body: { eaten_on: date, meal, description: text, items: est?.items || [], ...vals, source: est ? 'ai' : 'manual' },
      });
      setText('');
      setEst(null);
      setVals(null);
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    }
  };
  const setV = (k) => (e) => setVals({ ...(vals || { kcal: '', protein: '', carbs: '', fat: '' }), [k]: e.target.value });

  return (
    <div className="card stack">
      <div className="inline-form" style={{ alignItems: 'center' }}>
        <h3 className="grow" style={{ margin: 0 }}>What did you eat?</h3>
        <select value={meal} onChange={(e) => setMeal(e.target.value)} style={{ width: 'auto' }} aria-label="Meal">
          {meals.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <textarea
        rows={3}
        value={text}
        onChange={(e) => { setText(e.target.value); setEst(null); }}
        placeholder="e.g. A chicken sandwich with about 100 g chicken breast, two slices of wholemeal bread, some mayonnaise and lettuce"
      />
      {aiEnabled && !est && (
        <button className="btn primary" disabled={busy || text.trim().length < 3} onClick={estimate}>
          {busy ? 'Estimating…' : '✨ Estimate calories & macros'}
        </button>
      )}
      {!aiEnabled && <p className="tiny muted" style={{ margin: 0 }}>AI estimates aren’t switched on yet, so enter the numbers yourself.</p>}

      {est && (
        <div className="estimate">
          <div className="inline-form">
            <strong className="grow">Estimate</strong>
            <Badge tone={{ high: 'ok', medium: 'info', low: 'warn' }[est.confidence]}>{est.confidence} confidence</Badge>
          </div>
          {est.items.map((i, k) => (
            <div key={k} className="kv small">
              <span>{i.name}<span className="muted"> · {i.quantity}</span></span>
              <span className="tabular muted">{i.kcal} kcal · P{i.protein} C{i.carbs} F{i.fat}</span>
            </div>
          ))}
          {est.assumptions.length > 0 && (
            <ul className="tiny muted assumptions">{est.assumptions.map((a, k) => <li key={k}>{a}</li>)}</ul>
          )}
          <p className="tiny faint" style={{ margin: 0 }}>Estimates are approximate. Adjust the totals below if you know better, or add more detail and estimate again.</p>
        </div>
      )}

      {(est || manual) && (
        <div className="grid4">
          <label>Calories<input type="number" inputMode="numeric" value={vals?.kcal ?? ''} onChange={setV('kcal')} placeholder={est ? '' : 'auto'} /></label>
          <label>Protein g<input type="number" inputMode="numeric" value={vals?.protein ?? ''} onChange={setV('protein')} /></label>
          <label>Carbs g<input type="number" inputMode="numeric" value={vals?.carbs ?? ''} onChange={setV('carbs')} /></label>
          <label>Fat g<input type="number" inputMode="numeric" value={vals?.fat ?? ''} onChange={setV('fat')} /></label>
        </div>
      )}
      {err && <p className="error">{err}</p>}
      {(est || manual) && (
        <div className="row-actions" style={{ marginTop: 0 }}>
          <button className="btn primary" disabled={!text.trim()} onClick={save}>Add to {meal.toLowerCase()}</button>
          {est && <button className="btn ghost" onClick={() => { setEst(null); setVals(null); }}>Re-estimate</button>}
        </div>
      )}
      {aiEnabled && !est && !manual && (
        <button className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setManual(true)}>Enter numbers myself instead</button>
      )}
    </div>
  );
}

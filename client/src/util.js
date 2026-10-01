import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

/** Load data from the API; returns { data, error, loading, reload, setData }. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const load = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await api(path);
      setState({ data, error: null, loading: false });
    } catch (e) {
      setState({ data: null, error: e.message, loading: false });
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load, setData: (data) => setState((s) => ({ ...s, data })) };
}

export const fmtDate = (d) => {
  if (!d) return '—';
  const date = new Date(d.length <= 10 ? `${d}T00:00:00` : `${d.replace(' ', 'T')}Z`);
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};
export const fmtKg = (n) => (n == null ? '—' : `${Math.round(n * 10) / 10} kg`);
export const today = () => new Date().toISOString().slice(0, 10);

export const CATEGORIES = ['strength', 'power', 'speed', 'conditioning', 'mobility', 'other'];
export const METRIC_LABELS = { load: 'Weight × reps', time: 'Time (s)', distance: 'Distance (m)', height: 'Height (cm)', reps: 'Reps', velocity: 'Velocity (m/s)' };
export const LOAD_TYPES = {
  percent: '% of max',
  rir: 'Reps in reserve',
  rpe: 'RPE',
  fixed: 'Fixed kg',
  bodyweight: 'Bodyweight',
  none: 'No load',
};

/** One-line description of a prescription, e.g. "3 × 5 @ 2 RIR · 130 kg". */
export function describeRx(r) {
  const parts = [];
  if (r.sets || r.reps) parts.push([r.sets, r.reps].filter(Boolean).join(' × '));
  if (r.load_type === 'percent' && r.percent) parts.push(`@ ${r.percent}%`);
  if (r.load_type === 'rir' && r.rir != null) parts.push(`@ ${r.rir} RIR`);
  if (r.load_type === 'rpe' && r.rpe != null) parts.push(`@ RPE ${r.rpe}`);
  if (r.load_type === 'fixed' && r.fixed_load != null) parts.push(`@ ${r.fixed_load} kg`);
  if (r.load_type === 'bodyweight') parts.push('BW');
  if (r.target) parts.push(r.target);
  if (r.tempo) parts.push(`tempo ${r.tempo}`);
  if (r.rest_seconds) parts.push(`rest ${r.rest_seconds >= 60 ? `${Math.round((r.rest_seconds / 60) * 10) / 10} min` : `${r.rest_seconds}s`}`);
  return parts.join(' · ');
}

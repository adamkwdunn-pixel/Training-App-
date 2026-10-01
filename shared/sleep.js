// Sleep: hours/minutes formatting and a rolling sleep-debt meter. Shared by the server and the app.

export const SLEEP_TARGET_HOURS = 7.5; // nights under this add to sleep debt
export const DEBT_WINDOW_DAYS = 14;

/** 7.5 -> "7 h 30 min"; 8 -> "8 h"; 0.75 -> "45 min". */
export function fmtSleep(hours) {
  if (hours == null || hours === '' || Number.isNaN(Number(hours))) return '—';
  const total = Math.round(Number(hours) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Split decimal hours into whole hours and minutes (minutes rounded to the nearest 5). */
export function splitSleep(hours) {
  if (hours == null || hours === '') return { h: '', m: '' };
  let total = Math.round((Number(hours) * 60) / 5) * 5;
  return { h: Math.floor(total / 60), m: (total %= 60) };
}

export const joinSleep = (h, m) => (h === '' && m === '' ? null : Math.round((Number(h || 0) + Number(m || 0) / 60) * 10000) / 10000);

const dayNum = (d) => Math.round(new Date(`${d}T00:00:00Z`).getTime() / 864e5);

/**
 * Sleep debt over the last `days` days up to and including `today` (YYYY-MM-DD).
 * Every logged night under the target adds its shortfall; nights at or above it add nothing.
 * Returns hours of debt, plus context for the meter.
 */
export function sleepDebt(entries, today, { target = SLEEP_TARGET_HOURS, days = DEBT_WINDOW_DAYS } = {}) {
  const end = dayNum(today);
  const nights = entries.filter((e) => e.sleep_hours != null && e.sleep_hours !== '' && end - dayNum(e.day) >= 0 && end - dayNum(e.day) < days);
  const debt = nights.reduce((s, e) => s + Math.max(0, target - Number(e.sleep_hours)), 0);
  const avg = nights.length ? nights.reduce((s, e) => s + Number(e.sleep_hours), 0) / nights.length : null;
  const r = (n) => Math.round(n * 100) / 100;
  return {
    debt_hours: r(debt),
    nights_logged: nights.length,
    nights_short: nights.filter((e) => Number(e.sleep_hours) < target).length,
    avg_hours: avg == null ? null : r(avg),
    level: debt < 2 ? 'low' : debt < 5 ? 'moderate' : 'high',
    target, days,
  };
}

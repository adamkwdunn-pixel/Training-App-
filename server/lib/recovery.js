// Daily readiness questionnaire. Every item is scored 1-5: [label, what 1 means, what 5 means, higher is worse].
// Soreness and stress read naturally (1 = none / relaxed, 5 = very sore / very stressed), so they count
// in reverse towards the readiness score.
export const READINESS_ITEMS = {
  sleep_quality: ['Sleep quality', 'Terrible', 'Great', false],
  energy: ['Energy', 'Exhausted', 'Fresh', false],
  soreness: ['Muscle soreness', 'None', 'Very sore', true],
  stress: ['Stress', 'Relaxed', 'Very stressed', true],
  mood: ['Mood', 'Low', 'Great', false],
};

/** Readiness 0-100 from the 1-5 items; sleep under 7 h knocks a little off. */
export function readinessScore(r) {
  const vals = Object.entries(READINESS_ITEMS)
    .map(([k, [, , , reverse]]) => [Number(r[k]), reverse])
    .filter(([v]) => v >= 1 && v <= 5)
    .map(([v, reverse]) => (reverse ? 6 - v : v));
  if (!vals.length) return null;
  let score = ((vals.reduce((a, b) => a + b, 0) / vals.length - 1) / 4) * 100;
  const hours = Number(r.sleep_hours);
  if (hours > 0 && hours < 7) score -= (7 - hours) * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export const INJURY_STATUS = ['new', 'monitoring', 'rehab', 'resolved'];
export const AVAILABILITY = { full: 'Full training', modified: 'Modified training', unavailable: 'Unavailable' };

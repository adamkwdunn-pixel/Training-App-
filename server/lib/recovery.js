// Daily readiness questionnaire. Every item is scored 1-5 where 5 is best.
export const READINESS_ITEMS = {
  sleep_quality: ['Sleep quality', 'Terrible', 'Great'],
  energy: ['Energy', 'Exhausted', 'Fresh'],
  soreness: ['Muscle soreness', 'Very sore', 'None'],
  stress: ['Stress', 'Very stressed', 'Relaxed'],
  mood: ['Mood', 'Low', 'Great'],
};

/** Readiness 0-100 from the 1-5 items; sleep under 7 h knocks a little off. */
export function readinessScore(r) {
  const vals = Object.keys(READINESS_ITEMS).map((k) => Number(r[k])).filter((v) => v >= 1 && v <= 5);
  if (!vals.length) return null;
  let score = ((vals.reduce((a, b) => a + b, 0) / vals.length - 1) / 4) * 100;
  const hours = Number(r.sleep_hours);
  if (hours > 0 && hours < 7) score -= (7 - hours) * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export const INJURY_STATUS = ['new', 'monitoring', 'rehab', 'resolved'];
export const AVAILABILITY = { full: 'Full training', modified: 'Modified training', unavailable: 'Unavailable' };

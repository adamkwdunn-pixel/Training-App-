// Supersets are expressed through block labels: exercises next to each other that share a letter with a number
// (A1, A2, A3…) are done as one superset. Single exercises get a letter on its own (B, C…).

const LABEL = /^([A-Z])(\d+)?$/i;

/** links[i] is true when exercise i is supersetted with exercise i + 1. */
export function linksFrom(list) {
  const links = [];
  for (let i = 0; i < list.length - 1; i++) {
    const a = String(list[i].block || '').trim().match(LABEL);
    const b = String(list[i + 1].block || '').trim().match(LABEL);
    links.push(!!(a && b && a[2] && b[2] && a[1].toUpperCase() === b[1].toUpperCase()));
  }
  return links;
}

/** True when the labels are the app's own letters (or blank), so it's safe to re-letter them. */
export const isAutoLabelled = (list) => list.every((r) => !String(r.block || '').trim() || LABEL.test(String(r.block).trim()));

/** Re-letter every exercise from the links: A, B1, B2, C… */
export function relabel(list, links = linksFrom(list)) {
  const out = [];
  let letter = 0;
  for (let i = 0; i < list.length;) {
    let j = i;
    while (j < list.length - 1 && links[j]) j++;
    const L = String.fromCharCode(65 + (letter % 26));
    for (let k = i; k <= j; k++) out.push({ ...list[k], block: j > i ? `${L}${k - i + 1}` : L });
    letter++;
    i = j + 1;
  }
  return out;
}

/** Groups of indexes done together: [[0], [1, 2], [3]]. */
export function groupsOf(list) {
  const links = linksFrom(list);
  const groups = [];
  for (let i = 0; i < list.length;) {
    let j = i;
    while (j < list.length - 1 && links[j]) j++;
    groups.push(Array.from({ length: j - i + 1 }, (_, k) => i + k));
    i = j + 1;
  }
  return groups;
}

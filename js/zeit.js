// Datumshilfen. Tage als "JJJJ-MM-TT", Budgetmonate als "JJJJ-MM".
// Ein Budgetmonat heißt nach dem Kalendermonat, in dem er ENDET.

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];

const pad = (n) => String(n).padStart(2, '0');

export function isoTag(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function teile(iso) {
  const [j, m, t] = iso.split('-').map(Number);
  return { j, m, t };
}

export function tageImMonat(j, m) {
  return new Date(j, m, 0).getDate();
}

export function plusTage(iso, n) {
  const { j, m, t } = teile(iso);
  return isoTag(new Date(j, m - 1, t + n));
}

export function tageZwischen(a, b) {
  const A = teile(a), B = teile(b);
  return Math.round((Date.UTC(B.j, B.m - 1, B.t) - Date.UTC(A.j, A.m - 1, A.t)) / 86400000);
}

export function monatPlus(key, n) {
  const [j, m] = key.split('-').map(Number);
  const d = new Date(j, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Starttag in einem Kalendermonat, bei kurzen Monaten auf den letzten Tag begrenzt. */
function starttagIn(j, m, startTag) {
  return Math.min(startTag, tageImMonat(j, m));
}

/** Zeitraum eines Budgetmonats. */
export function zeitraum(key, startTag = 1) {
  const [j, m] = key.split('-').map(Number);
  if (startTag <= 1) {
    return { key, start: `${j}-${pad(m)}-01`, ende: `${j}-${pad(m)}-${pad(tageImMonat(j, m))}` };
  }
  const v = monatPlus(key, -1).split('-').map(Number);
  const start = `${v[0]}-${pad(v[1])}-${pad(starttagIn(v[0], v[1], startTag))}`;
  const ende = plusTage(`${j}-${pad(m)}-${pad(starttagIn(j, m, startTag))}`, -1);
  return { key, start, ende };
}

/** Zu welchem Budgetmonat gehört ein Tag? */
export function monatVon(iso, startTag = 1) {
  const { j, m, t } = teile(iso);
  const key = `${j}-${pad(m)}`;
  if (startTag <= 1) return key;
  return t >= starttagIn(j, m, startTag) ? monatPlus(key, 1) : key;
}

export function monatsName(key) {
  const [j, m] = key.split('-').map(Number);
  return `${MONATE[m - 1]} ${j}`;
}

export function kurzDatum(iso) {
  if (!iso) return '';
  const { j, m, t } = teile(iso);
  return `${pad(t)}.${pad(m)}.${j}`;
}

export function zeitstempel(ms) {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Verbleibende Tage im Zeitraum inklusive heute. */
export function restTage(heute, zr) {
  if (heute > zr.ende) return 0;
  const ab = heute < zr.start ? zr.start : heute;
  return tageZwischen(ab, zr.ende) + 1;
}

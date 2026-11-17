// Reine Rechenfunktionen ohne Browser-Abhängigkeit (in Node getestet).
import { tageZwischen } from './zeit.js';

export const RHYTHMEN = [
  { monate: 1, name: 'monatlich' },
  { monate: 3, name: 'vierteljährlich' },
  { monate: 6, name: 'halbjährlich' },
  { monate: 12, name: 'jährlich' },
];
export const rhythmusName = (m) => (RHYTHMEN.find((r) => r.monate === m) || RHYTHMEN[0]).name;

/**
 * Monatsanteil eines Postens in Cent. Restcents werden so auf die Monate eines
 * Zyklus verteilt, dass die Summe über den Zyklus exakt dem Betrag entspricht.
 * Beispiel: 100,00 € jährlich -> 8,33 / 8,33 / 8,34 / ... = genau 100,00 €.
 */
export function anteil(betrag, rhythmus, monatKey) {
  const r = rhythmus || 1;
  if (r === 1) return betrag;
  const m = Number(monatKey.split('-')[1]);
  const i = (m - 1) % r;
  return Math.floor(((i + 1) * betrag) / r) - Math.floor((i * betrag) / r);
}

/**
 * Kennzahlen eines Budgetmonats.
 * stamm = { einnahmen: [{betrag, aktiv}], fixkosten: [{betrag, rhythmus, aktiv}], sparbetrag }
 * buchungen = alle Buchungen DIESES Monats (stornierte werden ignoriert)
 */
export function monatsZahlen(stamm, buchungen, key) {
  const aktiveB = buchungen.filter((b) => b.status !== 'storniert');
  const festeEinnahmen = (stamm.einnahmen || []).filter((e) => e.aktiv !== false)
    .reduce((s, e) => s + e.betrag, 0);
  const zusatz = aktiveB.filter((b) => b.art === 'zusatzeinnahme').reduce((s, b) => s + b.betrag, 0);
  const fix = (stamm.fixkosten || []).filter((f) => f.aktiv !== false)
    .reduce((s, f) => s + anteil(f.betrag, f.rhythmus, key), 0);
  const spar = stamm.sparbetrag || 0;
  const ausgaben = aktiveB.filter((b) => b.art === 'ausgabe').reduce((s, b) => s + b.betrag, 0);
  const erstattungen = aktiveB.filter((b) => b.art === 'erstattung').reduce((s, b) => s + b.betrag, 0);
  const einnahmen = festeEinnahmen + zusatz;
  const variablesBudget = einnahmen - fix - spar;
  const verbraucht = ausgaben - erstattungen;
  const verfuegbar = einnahmen - fix - spar - ausgaben + erstattungen;
  const quote = variablesBudget > 0 ? verbraucht / variablesBudget : (verbraucht > 0 ? Infinity : 0);
  return { festeEinnahmen, zusatz, einnahmen, fix, spar, ausgaben, erstattungen,
    variablesBudget, verbraucht, verfuegbar, quote, ueberzogen: verfuegbar < 0 };
}

/** Ausgaben je Kategorie, Erstattungen mindern die jeweilige Kategorie. */
export function kategorienAuswertung(buchungen) {
  const map = new Map();
  for (const b of buchungen) {
    if (b.status === 'storniert' || b.art === 'zusatzeinnahme') continue;
    const k = b.kategorie || 'Sonstiges';
    const v = map.get(k) || { kategorie: k, ausgaben: 0, erstattungen: 0, netto: 0 };
    if (b.art === 'ausgabe') v.ausgaben += b.betrag; else v.erstattungen += b.betrag;
    v.netto = v.ausgaben - v.erstattungen;
    map.set(k, v);
  }
  return [...map.values()].sort((a, b) => b.netto - a.netto);
}

/** Gleiche Art, gleicher Betrag, Datum höchstens 2 Tage auseinander. */
export function findeDubletten(neu, vorhandene, toleranzTage = 2) {
  return vorhandene.filter((b) => b.id !== neu.id && b.status !== 'storniert'
    && b.art === neu.art && b.betrag === neu.betrag
    && Math.abs(tageZwischen(b.datum, neu.datum)) <= toleranzTage);
}

/** 0 = alles gut, sonst die höchste überschrittene Schwelle in Prozent. */
export function warnStufe(zahlen, schwellen = [80, 100]) {
  const p = zahlen.quote * 100;
  let stufe = 0;
  for (const s of [...schwellen].sort((a, b) => a - b)) if (p >= s) stufe = s;
  return stufe;
}

/** Rest pro Tag (abgerundet auf Cent, nie negativ geteilt). */
export function restProTag(verfuegbar, tage) {
  if (tage <= 0) return 0;
  if (verfuegbar <= 0) return 0;
  return Math.floor(verfuegbar / tage);
}

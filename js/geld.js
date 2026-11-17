// Geldbeträge werden überall als ganze Cent (Integer) geführt.

/** 123456 -> "1.234,56 €" ; -500 -> "−5,00 €" */
export function euro(cent, { vorzeichen = false } = {}) {
  if (!Number.isInteger(cent)) cent = Math.round(Number(cent) || 0);
  const neg = cent < 0;
  const abs = Math.abs(cent);
  const e = Math.floor(abs / 100);
  const c = String(abs % 100).padStart(2, '0');
  const tausender = String(e).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const zeichen = neg ? '−' : (vorzeichen && cent > 0 ? '+' : '');
  return `${zeichen}${tausender},${c} €`;
}

/** Betrag ohne Währungszeichen: "1.234,56" */
export function zahl(cent) {
  return euro(cent).replace(' €', '');
}

/**
 * Wandelt eine Eingabe in Cent um. Akzeptiert "12", "12,5", "1.234,56",
 * "12.50", "-3,20", "12,50 €", "EUR 12,50". Gibt null zurück, wenn nichts Lesbares drinsteht.
 */
export function parseEuro(text) {
  if (text == null) return null;
  if (typeof text === 'number') return Math.round(text * 100);
  let s = String(text).trim().replace(/\s|€|EUR/gi, '').replace('−', '-');
  if (!s) return null;
  let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  else if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  else if (s.startsWith('+')) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return null;
  let ganz, nach = '';
  const lk = s.lastIndexOf(','), lp = s.lastIndexOf('.');
  if (lk >= 0 && lk > lp) {
    ganz = s.slice(0, lk).replace(/\./g, '');
    nach = s.slice(lk + 1);
  } else if (lp >= 0 && lk < 0 && s.length - lp - 1 <= 2 && (s.match(/\./g) || []).length === 1) {
    // "12.50" -> Dezimalpunkt
    ganz = s.slice(0, lp);
    nach = s.slice(lp + 1);
  } else if (lp >= 0 && lp > lk) {
    // "1,234.56" (englisch) oder "1.234" (Tausenderpunkt)
    if (lk >= 0) { ganz = s.slice(0, lp).replace(/,/g, ''); nach = s.slice(lp + 1); }
    else ganz = s.replace(/\./g, '');
  } else {
    ganz = s;
  }
  if (ganz === '') ganz = '0';
  if (!/^\d+$/.test(ganz) || !/^\d{0,2}$/.test(nach)) return null;
  const cent = Number(ganz) * 100 + Number(nach.padEnd(2, '0') || 0);
  return neg ? -cent : cent;
}

export function summe(liste, feld = 'betrag') {
  return liste.reduce((s, x) => s + (typeof x === 'number' ? x : x[feld] || 0), 0);
}

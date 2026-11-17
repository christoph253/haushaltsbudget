// Wertet den erkannten Text eines Belegs aus (Kassenbon, Bestellbestätigung, Banking-Screenshot).
import { parseEuro } from './geld.js';
import { plusTage } from './zeit.js';

const BETRAG_RE = /([+\-−–]\s?)?(\d{1,3}(?:[.\s]\d{3})+|\d+)\s?[,]\s?(\d{2})(?!\d)\s*(€|EUR|EURO)?\s*([+\-−–])?/gi;
const MONATE = { jan: 1, feb: 2, mär: 3, mar: 3, maer: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12 };
const BEKANNTE_HAENDLER = ['REWE', 'EDEKA', 'ALDI SÜD', 'ALDI NORD', 'ALDI', 'LIDL', 'PENNY', 'NETTO', 'KAUFLAND', 'NORMA',
  'dm-drogerie markt', 'dm', 'ROSSMANN', 'Müller', 'Amazon', 'Zalando', 'OTTO', 'eBay', 'IKEA', 'H&M', 'C&A', 'PRIMARK',
  'DEICHMANN', 'ARAL', 'Shell', 'ESSO', 'JET', 'TotalEnergies', 'Apotheke', 'Tchibo', 'Thalia', 'MediaMarkt', 'Saturn',
  'TEDi', 'Action', 'Woolworth', 'Kik', 'Takko', 'Temu', 'Shein', 'Lieferando', 'McDonald\'s', 'Burger King', 'Globus', 'Hornbach', 'OBI', 'toom', 'BAUHAUS'];

const pad = (n) => String(n).padStart(2, '0');

function betraegeIn(zeile) {
  const out = [];
  for (const m of zeile.matchAll(BETRAG_RE)) {
    const roh = `${m[2].replace(/[.\s]/g, '')},${m[3]}`;
    let cent = parseEuro(roh);
    const neg = /[\-−–]/.test(m[1] || '') || /[\-−–]/.test(m[5] || '');
    const plus = /\+/.test(m[1] || '') || /\+/.test(m[5] || '');
    if (cent == null) continue;
    out.push({ cent, neg, plus, euro: !!m[4], index: m.index, laenge: m[0].length });
  }
  return out;
}

export function datumIn(zeile, heute) {
  const jahrHeute = Number(heute.slice(0, 4));
  let m = zeile.match(/(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)/);
  if (m) {
    const j = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 1 && Number(m[1]) <= 31) return `${j}-${pad(m[2])}-${pad(m[1])}`;
  }
  m = zeile.match(/(\d{1,2})\.\s?(jan|feb|m[äa]e?r|apr|mai|jun|jul|aug|sep|okt|oct|nov|dez|dec)[a-zä]*\.?\s?(\d{4})?/i);
  if (m) {
    const mon = MONATE[m[2].toLowerCase().replace('ä', 'ä')] || MONATE[m[2].toLowerCase().slice(0, 3)];
    let j = m[3] ? Number(m[3]) : jahrHeute;
    let iso = `${j}-${pad(mon)}-${pad(m[1])}`;
    if (!m[3] && iso > heute) iso = `${j - 1}-${pad(mon)}-${pad(m[1])}`;
    return iso;
  }
  m = zeile.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/\bheute\b/i.test(zeile)) return heute;
  if (/\bgestern\b/i.test(zeile)) return plusTage(heute, -1);
  if (/\bvorgestern\b/i.test(zeile)) return plusTage(heute, -2);
  return null;
}

function bekannterHaendler(text) {
  for (const h of BEKANNTE_HAENDLER) {
    const re = new RegExp(`(^|[^a-zäöü])${h.replace(/[.*+?^${}()|[\]\\&']/g, '\\$&')}([^a-zäöü]|$)`, 'i');
    if (re.test(text)) return h.length <= 4 ? h.toUpperCase() : h;
  }
  return null;
}

const ZEILE_UNWICHTIG = /^(\W|\d)*$|kassenbon|beleg|quittung|bon-nr|uhrzeit|datum|filiale|tel\.|telefon|www\.|ust|steuer|mwst|danke|bestellung|bestellnummer|rechnung/i;

function ersteNamensZeile(zeilen) {
  for (const z of zeilen.slice(0, 8)) {
    const t = z.replace(/[^\p{L}\s&.\-']/gu, ' ').replace(/\s+/g, ' ').trim();
    if (t.length >= 3 && /\p{L}{3,}/u.test(t) && !ZEILE_UNWICHTIG.test(z)) return t.slice(0, 40);
  }
  return '';
}

const SUMME_RE = /(gesamtsumme|gesamtbetrag|endbetrag|zu zahlen|zahlbetrag|zahlungsbetrag|bestellsumme|rechnungsbetrag|summe|gesamt|total|betrag)/i;

/**
 * text: erkannter Text; heute: "JJJJ-MM-TT"
 * Rückgabe: { typ: 'bon'|'bestellung'|'banking', posten: [{ betrag, haendler, datum, art }] }
 */
export function werteBelegAus(text, { heute, istScreenshot = false } = {}) {
  const zeilen = (text || '').split(/\r?\n/).map((z) => z.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const voll = zeilen.join('\n');
  const mitBetrag = zeilen.map((z) => ({ z, b: betraegeIn(z) }));
  const vorzeichenZeilen = mitBetrag.filter((x) => x.b.some((b) => b.neg || b.plus));
  const hatSumme = zeilen.some((z) => SUMME_RE.test(z));
  const istBestellung = /bestell|order|warenkorb|lieferung|versand/i.test(voll);

  // Banking-Liste: mehrere Zeilen mit Vorzeichen-Beträgen
  if (istScreenshot && vorzeichenZeilen.length >= 2 && !(hatSumme && istBestellung)) {
    const posten = [];
    let aktuellesDatum = null;
    for (let i = 0; i < zeilen.length; i++) {
      const z = zeilen[i];
      const b = mitBetrag[i].b.filter((x) => x.neg || x.plus);
      const d = datumIn(z, heute);
      if (!b.length) {
        if (d && z.replace(/[\d.\s]/g, '').length < 25) aktuellesDatum = d;
        continue;
      }
      const betrag = b.at(-1);
      let name = z.slice(0, betrag.index).replace(/[^\p{L}\d\s&.\-'/]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (name.replace(/[\d\s.]/g, '').length < 3) {
        for (let k = i - 1; k >= 0 && k >= i - 2; k--) {
          if (!mitBetrag[k].b.length && !datumIn(zeilen[k], heute)) { name = zeilen[k]; break; }
        }
      }
      posten.push({
        betrag: betrag.cent, art: betrag.plus ? 'erstattung' : 'ausgabe',
        haendler: (bekannterHaendler(name) || name).slice(0, 40),
        datum: d || aktuellesDatum || heute,
      });
    }
    if (posten.length) return { typ: 'banking', posten };
  }

  // Bon oder Bestellung: Gesamtbetrag suchen
  let betrag = null;
  for (let i = zeilen.length - 1; i >= 0; i--) {
    if (!SUMME_RE.test(zeilen[i]) || /zwischensumme|mwst|steuer|netto|rabatt|gespart|pfand/i.test(zeilen[i])) continue;
    const b = mitBetrag[i].b.length ? mitBetrag[i].b : (mitBetrag[i + 1]?.b || []);
    if (b.length) { betrag = b.at(-1).cent; if (/summe|zu zahlen|gesamt/i.test(zeilen[i])) break; }
  }
  if (betrag == null) {
    const alle = mitBetrag.flatMap((x) => x.b.map((b) => b.cent));
    if (alle.length) betrag = Math.max(...alle);
  }
  let datum = null;
  for (const z of zeilen) { datum = datumIn(z, heute); if (datum && datum <= heute) break; datum = null; }
  const haendler = bekannterHaendler(voll) || ersteNamensZeile(zeilen);
  if (betrag == null) return { typ: istBestellung ? 'bestellung' : 'bon', posten: [] };
  return { typ: istBestellung ? 'bestellung' : 'bon', posten: [{ betrag, haendler, datum: datum || heute, art: 'ausgabe' }] };
}

// Kontoumsätze (CSV der Sparkasse, auch andere deutsche Banken) einlesen und
// wiederkehrende Zahlungen erkennen. Läuft komplett auf dem Gerät.
import { parseEuro } from './geld.js';
import { tageZwischen, teile } from './zeit.js';
import { rateKategorie, haendlerSchluessel } from './kategorien-raten.js';

/** Bytes -> Text. Sparkasse liefert meist Windows-1252, manche Banken UTF-8. */
export function dekodiere(bytes) {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  return new TextDecoder('windows-1252').decode(bytes);
}

function csvZeilen(text) {
  const kopfZeile = text.split(/\r?\n/).find((z) => /betrag/i.test(z)) || '';
  const trenner = (kopfZeile.match(/;/g) || []).length >= (kopfZeile.match(/,/g) || []).length ? ';' : ',';
  const zeilen = [];
  let feld = '', zeile = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { feld += '"'; i++; } else inQ = false; }
      else feld += c;
    } else if (c === '"') inQ = true;
    else if (c === trenner) { zeile.push(feld); feld = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      zeile.push(feld); zeilen.push(zeile); zeile = []; feld = '';
    } else feld += c;
  }
  if (feld || zeile.length) { zeile.push(feld); zeilen.push(zeile); }
  return zeilen.filter((z) => z.some((f) => f.trim()));
}

const SPALTEN = {
  datum: [/^buchungstag$/, /^buchungsdatum$/, /^buchung$/, /^datum$/, /^valutadatum$/, /^wertstellung$/],
  betrag: [/^betrag$/, /^betrag \(eur\)$/, /^betrag \(€\)$/, /^umsatz$/, /^betrag in eur$/],
  name: [/beguenstigter\/zahlungspflichtiger/, /begünstigter\/zahlungspflichtiger/, /zahlungsempf/, /^name zahlungsbeteiligter$/,
    /^empf[aä]nger/, /^auftraggeber/, /^beg[uü]nstigter/, /^gegenkonto ?name/, /^name$/],
  zweck: [/^verwendungszweck$/, /^buchungsdetails$/, /verwendungszweck/],
  text: [/^buchungstext$/, /^umsatzart$/, /^vorgang$/, /^transaktionstyp$/, /^buchungsart$/],
  glaeubiger: [/gl(a|ä|ae)ubiger ?-?id/],
  mandat: [/mandatsreferenz/],
};

function findeSpalte(kopf, muster) {
  const k = kopf.map((h) => h.trim().toLowerCase());
  for (const re of muster) { const i = k.findIndex((h) => re.test(h)); if (i >= 0) return i; }
  return -1;
}

function datumLesen(s) {
  const m = (s || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    const j = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${j}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const iso = (s || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/** CSV-Text -> Liste von Umsätzen { datum, betrag (Cent, Ausgabe negativ), name, zweck, text, glaeubiger, mandat } */
export function leseUmsaetze(text) {
  const zeilen = csvZeilen(text);
  const kopfIndex = zeilen.findIndex((z) => findeSpalte(z, SPALTEN.betrag) >= 0 && findeSpalte(z, SPALTEN.datum) >= 0);
  if (kopfIndex < 0) throw new Error('In der Datei wurden keine Spalten „Buchungstag“ und „Betrag“ gefunden. Bitte im Online-Banking den Export „CSV-CAMT“ wählen.');
  const kopf = zeilen[kopfIndex];
  const idx = Object.fromEntries(Object.entries(SPALTEN).map(([k, m]) => [k, findeSpalte(kopf, m)]));
  const umsaetze = [];
  for (const z of zeilen.slice(kopfIndex + 1)) {
    const datum = datumLesen(z[idx.datum]);
    const betrag = parseEuro(z[idx.betrag]);
    if (!datum || betrag == null || betrag === 0) continue;
    const feld = (k) => (idx[k] >= 0 ? (z[idx[k]] || '').trim() : '');
    umsaetze.push({ datum, betrag, name: feld('name'), zweck: feld('zweck'), text: feld('text'),
      glaeubiger: feld('glaeubiger'), mandat: feld('mandat') });
  }
  return umsaetze;
}

function rhythmusVon(tage) {
  if (tage >= 20 && tage <= 40) return 1;
  if (tage >= 75 && tage <= 105) return 3;
  if (tage >= 160 && tage <= 200) return 6;
  if (tage >= 330 && tage <= 400) return 12;
  return 0;
}

function schoenerName(s) {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Unbekannt';
  if (t === t.toUpperCase() && t.length > 4) {
    return t.toLowerCase().replace(/(^|[\s\-/.&])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  }
  return t;
}

function einnahmeName(g) {
  const t = `${g.name} ${g.zweck}`.toLowerCase();
  if (/kindergeld|familienkasse/.test(t)) return 'Kindergeld';
  if (/unterhalt/.test(t)) return 'Unterhalt';
  if (/lohn|gehalt|bez[uü]ge|entgelt/.test(t)) return 'Gehalt';
  if (/elterngeld/.test(t)) return 'Elterngeld';
  if (/rente/.test(t)) return 'Rente';
  return schoenerName(g.name);
}

const NIE_FIX = /bargeld|geldautomat|auszahlung|\bga\b|bargeldauszahlung|umbuchung|[uü]bertrag/i;
const EINMAL_NICHT = /paypal|amazon|klarna|ebay|zalando|otto\b/i;

/**
 * Erkennt wiederkehrende Zahlungen.
 * Rückgabe: { von, bis, monate, anzahl, vorschlaege: [...] }
 */
export function erkenneWiederkehrende(umsaetze, { fixKategorien = [], vorhandeneNamen = [] } = {}) {
  if (!umsaetze.length) return { von: null, bis: null, monate: 0, anzahl: 0, vorschlaege: [] };
  const sortiert = [...umsaetze].sort((a, b) => a.datum.localeCompare(b.datum));
  const von = sortiert[0].datum, bis = sortiert.at(-1).datum;
  const monate = Math.max(1, Math.round(tageZwischen(von, bis) / 30.44));
  const gruppen = new Map();
  for (const u of sortiert) {
    if (NIE_FIX.test(u.text) || NIE_FIX.test(u.name) && !u.glaeubiger) continue;
    const richtung = u.betrag < 0 ? 'aus' : 'ein';
    const kern = u.glaeubiger && u.mandat ? `${u.glaeubiger}|${u.mandat}` : haendlerSchluessel(u.name || u.zweck);
    if (!kern) continue;
    const key = `${richtung}|${kern}`;
    if (!gruppen.has(key)) gruppen.set(key, { richtung, name: u.name, zweck: u.zweck, glaeubiger: u.glaeubiger, text: u.text, umsaetze: [] });
    const g = gruppen.get(key);
    g.umsaetze.push(u);
    g.name = u.name || g.name; g.zweck = u.zweck || g.zweck;
  }
  const vorhanden = new Set(vorhandeneNamen.map((n) => haendlerSchluessel(n)));
  const vorschlaege = [];
  for (const g of gruppen.values()) {
    const l = g.umsaetze;
    const betraege = l.map((u) => Math.abs(u.betrag));
    const letzter = betraege.at(-1);
    let rhythmus = 0, sicher = false;
    if (l.length >= 2) {
      const klassen = [];
      for (let i = 1; i < l.length; i++) klassen.push(rhythmusVon(tageZwischen(l[i - 1].datum, l[i].datum)));
      const zaehl = new Map();
      for (const k of klassen) zaehl.set(k, (zaehl.get(k) || 0) + 1);
      const [besteKlasse, treffer] = [...zaehl.entries()].sort((a, b) => b[1] - a[1])[0];
      if (besteKlasse && treffer / klassen.length >= 0.6) {
        // nicht öfter als einmal pro Rhythmus (sonst ist es z. B. ein Supermarkt)
        const erwartet = Math.floor(tageZwischen(l[0].datum, l.at(-1).datum) / (besteKlasse * 30.44)) + 1;
        if (l.length <= erwartet + 1) { rhythmus = besteKlasse; sicher = l.length >= 3 || besteKlasse >= 6; }
      }
    } else if (g.richtung === 'aus' && g.glaeubiger && !EINMAL_NICHT.test(g.name) && letzter >= 1000) {
      // Lastschrift mit Gläubiger-ID, nur einmal gesehen: vermutlich jährlich
      rhythmus = 12; sicher = false;
    }
    if (!rhythmus) continue;
    if (g.richtung === 'ein' && rhythmus !== 1) continue;
    const schwankend = Math.max(...betraege) > Math.min(...betraege) * 1.15;
    const name = g.richtung === 'ein' ? einnahmeName(g) : schoenerName(g.name || g.zweck);
    const letzteDatum = l.at(-1).datum;
    vorschlaege.push({
      typ: g.richtung === 'ein' ? 'einnahme' : 'fixkosten',
      name, betrag: letzter, rhythmus, sicher, schwankend,
      kategorie: g.richtung === 'aus' ? rateKategorie(`${g.name} ${g.zweck}`, fixKategorien, { fix: true }) : null,
      anzahl: l.length, termine: l.map((u) => u.datum),
      faelligMonat: rhythmus > 1 ? teile(letzteDatum).m : null,
      zweck: g.zweck.slice(0, 80),
      schonVorhanden: vorhanden.has(haendlerSchluessel(name)),
      nurEinmalGesehen: l.length === 1,
    });
  }
  vorschlaege.sort((a, b) => (a.typ === b.typ ? b.betrag / b.rhythmus - a.betrag / a.rhythmus : a.typ === 'einnahme' ? -1 : 1));
  return { von, bis, monate, anzahl: umsaetze.length, vorschlaege };
}

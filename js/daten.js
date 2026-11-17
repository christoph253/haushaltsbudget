// Fachlogik über einem austauschbaren Speicher (IndexedDB im Browser, Map in Tests).
// Jede Änderung wird im Protokoll festgehalten; abgeschlossene Monate sind schreibgeschützt.
import { monatVon, monatPlus, zeitraum, isoTag } from './zeit.js';
import { anteil, monatsZahlen, kategorienAuswertung } from './rechnen.js';
import { euro } from './geld.js';

export const STANDARD_KATEGORIEN = ['Lebensmittel', 'Tanken/Mobilität', 'Kleidung',
  'Freizeit', 'Gesundheit', 'Online-Käufe', 'Sonstiges'];
export const STANDARD_FIX_KATEGORIEN = ['Wohnen', 'Energie', 'Versicherungen', 'Mobilität',
  'Verträge & Abos', 'Kinder', 'Kredite', 'Sonstiges'];

export const QUELLEN = { bon: 'Kassenbon', screenshot: 'Screenshot', manuell: 'Manuell', import: 'Import' };
export const ARTEN = { ausgabe: 'Ausgabe', erstattung: 'Erstattung', zusatzeinnahme: 'Zusatzeinnahme' };

export const STORES = ['einstellungen', 'einnahmen', 'fixkosten', 'buchungen', 'bilder', 'protokoll', 'monate'];

export class MonatAbgeschlossenFehler extends Error {
  constructor(key) { super(`Der Monat ${key} ist abgeschlossen.`); this.key = key; this.code = 'MONAT_ABGESCHLOSSEN'; }
}

const neueId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const BUCHUNG_FELDER = ['art', 'betrag', 'datum', 'haendler', 'kategorie', 'notiz', 'quelle', 'bildId'];
const FELD_NAMEN = { art: 'Art', betrag: 'Betrag', datum: 'Datum', haendler: 'Händler', kategorie: 'Kategorie',
  notiz: 'Notiz', quelle: 'Quelle', bildId: 'Beleg', name: 'Name', rhythmus: 'Rhythmus', aktiv: 'Aktiv',
  sparbetrag: 'Sparbetrag', startTag: 'Starttag', faelligMonat: 'Fällig im Monat' };
export const feldName = (f) => FELD_NAMEN[f] || f;

function unterschiede(alt, neu, felder) {
  const a = {}, n = {};
  for (const f of felder) {
    if (!(f in neu)) continue;
    const va = alt[f] ?? null, vn = neu[f] ?? null;
    if (JSON.stringify(va) !== JSON.stringify(vn)) { a[f] = va; n[f] = vn; }
  }
  return Object.keys(n).length ? { alt: a, neu: n } : null;
}

export class Daten {
  constructor(speicher, uhr = { jetzt: () => Date.now() }) {
    this.s = speicher;
    this.uhr = uhr;
  }

  heute() { return isoTag(new Date(this.uhr.jetzt())); }

  // ---------- Einstellungen ----------
  async einstellungen() {
    const e = await this.s.get('einstellungen', 'app');
    return {
      id: 'app', startTag: 1, schwellen: [80, 100], sparbetrag: 0,
      kategorien: [...STANDARD_KATEGORIEN], fixKategorien: [...STANDARD_FIX_KATEGORIEN],
      offenerMonat: null, eingerichtet: false, letzteSicherung: null, claudeSchluessel: '',
      erinnerungMonat: null,
      ...(e || {}),
    };
  }

  async setzeEinstellungen(teil, { protokoll = true } = {}) {
    const alt = await this.einstellungen();
    const neu = { ...alt, ...teil };
    await this.s.put('einstellungen', neu);
    if (protokoll) {
      for (const f of ['sparbetrag', 'startTag']) {
        if (f in teil && alt[f] !== teil[f]) {
          const fmt = (v) => (f === 'sparbetrag' ? euro(v) : `${v}.`);
          await this.protokolliere({ objekt: 'einstellung', objektId: f, aktion: 'geändert',
            alt: { [f]: alt[f] }, neu: { [f]: teil[f] },
            text: `${feldName(f)}: ${fmt(alt[f])} → ${fmt(teil[f])}` });
        }
      }
    }
    if ('startTag' in teil && alt.startTag !== teil.startTag) await this.monateNeuZuordnen(neu.startTag);
    return neu;
  }

  async aktuellerMonat() {
    const e = await this.einstellungen();
    return monatVon(this.heute(), e.startTag);
  }

  // ---------- Protokoll ----------
  async protokolliere(eintrag) {
    const monat = eintrag.monat || (await this.aktuellerMonat());
    const p = { id: neueId(), zeit: this.uhr.jetzt(), korrektur: false, ...eintrag, monat };
    await this.s.put('protokoll', p);
    return p;
  }

  async protokoll(filter = {}) {
    let l = await this.s.alle('protokoll');
    if (filter.monat) l = l.filter((p) => p.monat === filter.monat);
    if (filter.objektId) l = l.filter((p) => p.objektId === filter.objektId);
    return l.sort((a, b) => a.zeit - b.zeit);
  }

  // ---------- Einnahmen & Fixkosten ----------
  async liste(store, { mitGeloeschten = false } = {}) {
    const l = await this.s.alle(store);
    return l.filter((x) => mitGeloeschten || !x.geloescht)
      .sort((a, b) => (a.reihenfolge ?? a.angelegt) - (b.reihenfolge ?? b.angelegt));
  }

  async speichereStamm(store, obj) {
    const objekt = store === 'einnahmen' ? 'einnahme' : 'fixkosten';
    const felder = store === 'einnahmen' ? ['name', 'betrag', 'aktiv']
      : ['name', 'betrag', 'kategorie', 'rhythmus', 'aktiv', 'faelligMonat'];
    if (!obj.id) {
      const neu = { aktiv: true, rhythmus: 1, ...obj, id: neueId(), angelegt: this.uhr.jetzt() };
      await this.s.put(store, neu);
      await this.protokolliere({ objekt, objektId: neu.id, aktion: 'angelegt', neu,
        text: `${objekt === 'einnahme' ? 'Einnahme' : 'Fixkosten'} „${neu.name}“ angelegt: ${euro(neu.betrag)}` });
      return neu;
    }
    const alt = await this.s.get(store, obj.id);
    const neu = { ...alt, ...obj };
    const diff = unterschiede(alt, neu, felder);
    await this.s.put(store, neu);
    if (diff) {
      let aktion = 'geändert';
      if ('aktiv' in diff.neu && Object.keys(diff.neu).length === 1) aktion = neu.aktiv ? 'fortgesetzt' : 'pausiert';
      await this.protokolliere({ objekt, objektId: neu.id, aktion, ...diff,
        text: `„${neu.name}“ ${aktion}${aktion === 'geändert' ? ': ' + beschreibeDiff(diff) : ''}` });
    }
    return neu;
  }

  async loescheStamm(store, id) {
    const alt = await this.s.get(store, id);
    if (!alt) return;
    await this.s.put(store, { ...alt, geloescht: true, aktiv: false });
    await this.protokolliere({ objekt: store === 'einnahmen' ? 'einnahme' : 'fixkosten', objektId: id,
      aktion: 'gelöscht', alt, text: `„${alt.name}“ gelöscht (${euro(alt.betrag)})` });
  }

  async stamm() {
    const e = await this.einstellungen();
    return {
      einnahmen: (await this.liste('einnahmen')).filter((x) => x.aktiv !== false),
      fixkosten: (await this.liste('fixkosten')).filter((x) => x.aktiv !== false),
      sparbetrag: e.sparbetrag,
    };
  }

  // ---------- Buchungen ----------
  async monatAbgeschlossen(key) {
    const m = await this.s.get('monate', key);
    return !!m?.abgeschlossenAm;
  }

  async buchungAnlegen(daten, { korrektur = false } = {}) {
    const e = await this.einstellungen();
    const b = {
      art: 'ausgabe', quelle: 'manuell', kategorie: 'Sonstiges', haendler: '', notiz: '',
      datum: this.heute(), bildId: null, kiOriginal: null,
      ...daten,
      id: neueId(), erfasstAm: this.uhr.jetzt(), status: 'aktiv',
    };
    if (!Number.isInteger(b.betrag) || b.betrag <= 0) throw new Error('Betrag muss größer als 0 sein.');
    b.monat = monatVon(b.datum, e.startTag);
    if ((await this.monatAbgeschlossen(b.monat)) && !korrektur) throw new MonatAbgeschlossenFehler(b.monat);
    await this.s.put('buchungen', b);
    await this.protokolliere({ objekt: 'buchung', objektId: b.id, aktion: 'angelegt', neu: b, monat: b.monat,
      korrektur, text: `${ARTEN[b.art]} ${euro(b.betrag)} ${b.haendler ? '· ' + b.haendler + ' ' : ''}angelegt${korrektur ? ' (Korrektur)' : ''}` });
    return b;
  }

  async buchungAendern(id, aenderungen, { korrektur = false } = {}) {
    const e = await this.einstellungen();
    const alt = await this.s.get('buchungen', id);
    if (!alt) throw new Error('Buchung nicht gefunden');
    if (alt.status === 'storniert') throw new Error('Stornierte Buchungen können nicht geändert werden.');
    const neu = { ...alt, ...aenderungen };
    neu.monat = monatVon(neu.datum, e.startTag);
    for (const k of new Set([alt.monat, neu.monat])) {
      if ((await this.monatAbgeschlossen(k)) && !korrektur) throw new MonatAbgeschlossenFehler(k);
    }
    const diff = unterschiede(alt, neu, BUCHUNG_FELDER);
    if (!diff) return alt;
    neu.geaendertAm = this.uhr.jetzt();
    await this.s.put('buchungen', neu);
    await this.protokolliere({ objekt: 'buchung', objektId: id, aktion: 'geändert', ...diff, monat: neu.monat,
      korrektur, text: `${ARTEN[neu.art]} ${neu.haendler || ''} geändert: ${beschreibeDiff(diff)}${korrektur ? ' (Korrektur)' : ''}` });
    if (alt.monat !== neu.monat) {
      await this.protokolliere({ objekt: 'buchung', objektId: id, aktion: 'verschoben', monat: alt.monat, korrektur,
        alt: { monat: alt.monat }, neu: { monat: neu.monat }, text: `Buchung in anderen Monat verschoben (${neu.monat})` });
    }
    return neu;
  }

  async buchungStornieren(id, { korrektur = false, grund = '' } = {}) {
    const alt = await this.s.get('buchungen', id);
    if (!alt || alt.status === 'storniert') return alt;
    if ((await this.monatAbgeschlossen(alt.monat)) && !korrektur) throw new MonatAbgeschlossenFehler(alt.monat);
    const neu = { ...alt, status: 'storniert', storniertAm: this.uhr.jetzt(), stornoGrund: grund };
    await this.s.put('buchungen', neu);
    await this.protokolliere({ objekt: 'buchung', objektId: id, aktion: 'storniert', alt: { status: 'aktiv' },
      neu: { status: 'storniert' }, monat: alt.monat, korrektur,
      text: `${ARTEN[alt.art]} ${euro(alt.betrag)} ${alt.haendler || ''} storniert${grund ? ': ' + grund : ''}${korrektur ? ' (Korrektur)' : ''}` });
    return neu;
  }

  async buchung(id) { return this.s.get('buchungen', id); }

  async buchungen(filter = {}) {
    let l = await this.s.alle('buchungen');
    if (filter.monat) l = l.filter((b) => b.monat === filter.monat);
    if (!filter.mitStornierten) l = l.filter((b) => b.status !== 'storniert');
    return l.sort((a, b) => (b.datum.localeCompare(a.datum)) || (b.erfasstAm - a.erfasstAm));
  }

  /** Nach Änderung des Starttags: Buchungen offener Monate neu zuordnen. */
  async monateNeuZuordnen(startTag) {
    for (const b of await this.s.alle('buchungen')) {
      if (await this.monatAbgeschlossen(b.monat)) continue;
      const m = monatVon(b.datum, startTag);
      if (m !== b.monat && !(await this.monatAbgeschlossen(m))) await this.s.put('buchungen', { ...b, monat: m });
    }
    const e = await this.einstellungen();
    await this.s.put('einstellungen', { ...e, offenerMonat: monatVon(this.heute(), startTag) });
  }

  // ---------- Bilder ----------
  async bildSpeichern(blob, typ = 'image/jpeg') {
    const id = neueId();
    await this.s.put('bilder', { id, blob, typ, groesse: blob.size ?? 0, angelegt: this.uhr.jetzt() });
    return id;
  }
  async bild(id) { return id ? this.s.get('bilder', id) : null; }

  // ---------- Monate ----------
  async stammSchnappschuss(key) {
    const st = await this.stamm();
    return {
      einnahmen: st.einnahmen.map(({ id, name, betrag }) => ({ id, name, betrag })),
      fixkosten: st.fixkosten.map(({ id, name, betrag, kategorie, rhythmus }) =>
        ({ id, name, betrag, kategorie, rhythmus, anteil: anteil(betrag, rhythmus, key) })),
      sparbetrag: st.sparbetrag,
    };
  }

  /** Beim App-Start aufrufen: schließt alle vergangenen, noch offenen Monate ab. */
  async monatsabschlussPruefen() {
    const e = await this.einstellungen();
    const aktuell = monatVon(this.heute(), e.startTag);
    let offen = e.offenerMonat || aktuell;
    const geschlossen = [];
    while (offen < aktuell) {
      if (!(await this.monatAbgeschlossen(offen))) {
        await this.schliesseMonat(offen, e.startTag);
        geschlossen.push(offen);
      }
      offen = monatPlus(offen, 1);
    }
    if (e.offenerMonat !== aktuell) await this.s.put('einstellungen', { ...(await this.einstellungen()), offenerMonat: aktuell });
    return geschlossen;
  }

  async schliesseMonat(key, startTag) {
    const stamm = await this.stammSchnappschuss(key);
    const buchungen = await this.buchungen({ monat: key });
    const zahlen = monatsZahlen(stamm, buchungen, key);
    const m = { key, zeitraum: zeitraum(key, startTag), abgeschlossenAm: this.uhr.jetzt(), stamm,
      restBeiAbschluss: zahlen.verfuegbar };
    await this.s.put('monate', m);
    await this.protokolliere({ objekt: 'monat', objektId: key, aktion: 'abgeschlossen', monat: key,
      text: `Monat abgeschlossen, Rest ${euro(zahlen.verfuegbar)}` });
    return m;
  }

  async abgeschlosseneMonate() {
    return (await this.s.alle('monate')).filter((m) => m.abgeschlossenAm).sort((a, b) => b.key.localeCompare(a.key));
  }

  /** Alles, was Startseite, Archiv und PDF für einen Monat brauchen – eine einzige Quelle. */
  async monatsDaten(key) {
    const e = await this.einstellungen();
    key = key || monatVon(this.heute(), e.startTag);
    const archiv = await this.s.get('monate', key);
    const abgeschlossen = !!archiv?.abgeschlossenAm;
    let stamm;
    if (abgeschlossen) stamm = archiv.stamm;
    else {
      const s = await this.stammSchnappschuss(key);
      stamm = s;
    }
    const buchungen = await this.buchungen({ monat: key, mitStornierten: true });
    const aktive = buchungen.filter((b) => b.status !== 'storniert');
    const zahlen = monatsZahlen({ ...stamm, fixkosten: stamm.fixkosten.map((f) => ({ ...f })) }, aktive, key);
    return {
      key, abgeschlossen, abgeschlossenAm: archiv?.abgeschlossenAm || null,
      zeitraum: archiv?.zeitraum || zeitraum(key, e.startTag),
      stamm, buchungen, aktive, zahlen,
      kategorien: kategorienAuswertung(aktive),
      protokoll: await this.protokoll({ monat: key }),
    };
  }

  // ---------- Sicherung ----------
  async alles({ mitBildern = true } = {}) {
    const out = { format: 'haushaltsbudget', version: 1, erstellt: new Date(this.uhr.jetzt()).toISOString() };
    for (const st of STORES) {
      if (st === 'bilder' && !mitBildern) continue;
      out[st] = await this.s.alle(st);
    }
    return out;
  }

  async allesErsetzen(daten) {
    if (daten?.format !== 'haushaltsbudget') throw new Error('Das ist keine Sicherung dieser App.');
    for (const st of STORES) {
      if (!(st in daten)) continue;
      await this.s.leeren(st);
      for (const x of daten[st]) await this.s.put(st, x);
    }
  }

  async allesLoeschen() {
    for (const st of STORES) await this.s.leeren(st);
  }
}

export function beschreibeDiff({ alt, neu }) {
  const f = (k, v) => (v == null || v === '' ? '–' : k === 'betrag' || k === 'sparbetrag' ? euro(v)
    : k === 'rhythmus' ? `${v} Mon.` : k === 'aktiv' ? (v ? 'ja' : 'nein') : k === 'bildId' ? 'Bild' : String(v));
  return Object.keys(neu).map((k) => `${feldName(k)} ${f(k, alt[k])} → ${f(k, neu[k])}`).join(', ');
}

// Startseite, Journal, Archiv, Monatsansicht.
import { K } from './kontext.js';
import { h, ersetze, icon, sheet, toast, feld, auswahl, ladeSkript } from './ui.js';
import { euro, parseEuro } from './geld.js';
import { monatsName, kurzDatum, zeitstempel, restTage } from './zeit.js';
import { warnStufe, restProTag, rhythmusName } from './rechnen.js';
import { buchungsZeile, belegErfassen, buchungsformular } from './buchen.js';
import { berichtDaten, erzeugePdf } from './bericht.js';
import { teilen, blobZuDataUrl } from './sicherung.js';
import { stammDialog, sparbetragDialog } from './einstellungen.js';

function kategorieBalken(kategorien) {
  const max = Math.max(1, ...kategorien.map((k) => k.netto));
  return kategorien.filter((k) => k.ausgaben || k.erstattungen).map((k) => h('div', { class: 'kat-zeile' },
    h('div', { class: 'oben' }, h('span', {}, k.kategorie), h('span', { class: 'zahl' }, euro(k.netto))),
    h('div', { class: 'balken' }, h('div', { style: { width: `${Math.max(0, (k.netto / max) * 100)}%` } }))));
}

function kachel(l, w, unter, onclick) {
  return h(onclick ? 'button' : 'div', { class: `kachel ${onclick ? 'tippbar' : ''}`, onclick, 'aria-label': onclick ? `${l} anzeigen` : null },
    h('div', { class: 'l' }, l), h('div', { class: 'w zahl' }, w), unter ? h('div', { class: 'l' }, unter) : null);
}

// ---------------- Detailansichten der Kacheln ----------------
const summenZeile = (text, betrag) => h('div', { class: 'zeile' }, h('div', { class: 'mitte' }, h('strong', {}, text)),
  h('div', { class: 'rechts' }, h('strong', {}, euro(betrag))));

function postenZeile(titel, unter, betrag, onclick, rechtsUnter) {
  return h(onclick ? 'button' : 'div', { class: `zeile ${onclick ? 'pfeil' : ''}`, onclick },
    h('div', { class: 'mitte' }, h('div', { class: 'titel' }, titel), unter ? h('div', { class: 'unter' }, unter) : null),
    h('div', { class: 'rechts' }, euro(betrag), rechtsUnter ? h('div', { class: 'unter' }, rechtsUnter) : null));
}

async function stammObjekt(store, id) { return K.daten.s.get(store, id); }

function einnahmenDetail(md) {
  const zusatz = md.aktive.filter((b) => b.art === 'zusatzeinnahme');
  const einnahmen = [...md.stamm.einnahmen].sort((a, b) => b.betrag - a.betrag);
  sheet(`Einnahmen ${monatsName(md.key)}`, (zu) => h('div', {},
    h('h2', { style: { marginTop: '4px' } }, 'Feste Einnahmen'),
    h('div', { class: 'liste' }, einnahmen.length ? einnahmen.map((e) => postenZeile(e.name, null, e.betrag,
      md.abgeschlossen ? null : async () => { zu(true); stammDialog('einnahmen', await stammObjekt('einnahmen', e.id), { nachher: K.neuZeichnen }); }))
      : h('div', { class: 'leer' }, 'Keine festen Einnahmen eingetragen.'),
      summenZeile('Summe fest', md.zahlen.festeEinnahmen)),
    h('h2', {}, 'Zusatzeinnahmen diesen Monat'),
    h('div', { class: 'liste' }, zusatz.length ? zusatz.map((b) => buchungsZeile(b)) : h('div', { class: 'leer' }, 'Keine Zusatzeinnahmen.'),
      zusatz.length ? summenZeile('Summe zusätzlich', md.zahlen.zusatz) : null),
    h('div', { class: 'liste' }, summenZeile('Einnahmen gesamt', md.zahlen.einnahmen)),
    md.abgeschlossen ? null : h('div', { style: { display: 'grid', gap: '10px' } },
      h('button', { class: 'knopf zweit', onclick: () => { zu(true); buchungsformular({ art: 'zusatzeinnahme', titel: 'Zusatzeinnahme' }); } }, 'Zusatzeinnahme erfassen'),
      h('a', { class: 'knopf grau', href: '#/mehr/einnahmen' }, 'Feste Einnahmen verwalten'))));
}

function fixkostenDetail(md) {
  const gruppen = [[1, 'Monatlich'], [3, 'Vierteljährlich (anteilig)'], [6, 'Halbjährlich (anteilig)'], [12, 'Jährlich (anteilig)']]
    .map(([r, t]) => [t, md.stamm.fixkosten.filter((f) => (f.rhythmus || 1) === r).sort((a, b) => b.anteil - a.anteil)])
    .filter(([, l]) => l.length);
  sheet(`Fixkosten ${monatsName(md.key)}`, (zu) => h('div', {},
    h('p', { class: 'leise klein' }, 'Nicht-monatliche Posten werden anteilig auf jeden Monat verteilt. Tippe auf einen Posten, um ihn zu ändern.'),
    gruppen.length ? gruppen.map(([t, l]) => [h('h2', {}, t), h('div', { class: 'liste' }, l.map((f) => postenZeile(f.name,
      f.rhythmus > 1 ? `${f.kategorie} · ${euro(f.betrag)} ${rhythmusName(f.rhythmus)}` : f.kategorie, f.anteil,
      md.abgeschlossen ? null : async () => { zu(true); stammDialog('fixkosten', await stammObjekt('fixkosten', f.id), { nachher: K.neuZeichnen }); },
      f.rhythmus > 1 ? 'pro Monat' : null)))]) : h('div', { class: 'liste' }, h('div', { class: 'leer' }, 'Keine Fixkosten eingetragen.')),
    h('div', { class: 'liste' }, summenZeile('Fixkosten pro Monat', md.zahlen.fix)),
    md.abgeschlossen ? null : h('a', { class: 'knopf grau', href: '#/mehr/fixkosten' }, 'Fixkosten verwalten')));
}

function sparbetragDetail(md) {
  sheet('Sparbetrag', (zu) => h('div', {},
    h('div', { class: 'karte held' }, h('div', { class: 'label' }, 'Jeden Monat zur Seite gelegt'), h('div', { class: 'betrag zahl' }, euro(md.zahlen.spar))),
    h('p', { class: 'leise klein' }, 'Der Sparbetrag wird wie ein Fixposten abgezogen, bevor das verfügbare Budget berechnet wird.'),
    h('div', { class: 'liste' },
      h('div', { class: 'zeile' }, h('div', { class: 'mitte' }, 'Im Jahr'), h('div', { class: 'rechts' }, euro(md.zahlen.spar * 12)))),
    md.abgeschlossen ? null : h('button', { class: 'knopf', onclick: () => { zu(true); sparbetragDialog(); } }, 'Sparbetrag ändern')));
}

function ausgabenDetail(md) {
  const ausgaben = md.aktive.filter((b) => b.art !== 'zusatzeinnahme');
  sheet(`Variable Ausgaben ${monatsName(md.key)}`, (zu) => h('div', {},
    h('div', { class: 'liste' },
      h('div', { class: 'zeile' }, h('div', { class: 'mitte' }, 'Ausgaben'), h('div', { class: 'rechts' }, euro(md.zahlen.ausgaben))),
      md.zahlen.erstattungen ? h('div', { class: 'zeile' }, h('div', { class: 'mitte' }, 'Erstattungen'), h('div', { class: 'rechts gruen' }, `− ${euro(md.zahlen.erstattungen)}`)) : null,
      summenZeile('Verbraucht', md.zahlen.verbraucht),
      h('div', { class: 'zeile' }, h('div', { class: 'mitte leise' }, 'Budget für variable Ausgaben'), h('div', { class: 'rechts leise' }, euro(md.zahlen.variablesBudget)))),
    md.kategorien.length ? [h('h2', {}, 'Nach Kategorie'), h('div', { class: 'karte' }, kategorieBalken(md.kategorien))] : null,
    h('h2', {}, `Alle Buchungen (${ausgaben.length})`),
    h('div', { class: 'liste' }, ausgaben.length ? ausgaben.map((b) => buchungsZeile(b)) : h('div', { class: 'leer' }, 'Noch keine Ausgaben in diesem Monat.')),
    md.abgeschlossen ? null : h('button', { class: 'knopf zweit', onclick: () => { zu(true); buchungsformular({ art: 'ausgabe' }); } }, 'Ausgabe erfassen')));
}

// ---------------- Start ----------------
export async function startSeite() {
  const D = K.daten, e = K.einst;
  const md = await D.monatsDaten();
  const z = md.zahlen;
  const heute = D.heute();
  const tage = restTage(heute, md.zeitraum);
  const stufe = warnStufe(z, e.schwellen);
  const prozent = Math.round(Math.max(0, z.quote === Infinity ? 100 : z.quote * 100));
  const hinweise = [];

  // Erinnerung an die Sicherung nach Monatsabschluss
  const letzterAbschluss = (await D.abgeschlosseneMonate())[0];
  if (letzterAbschluss && (e.letzteSicherung || 0) < letzterAbschluss.abgeschlossenAm && e.erinnerungMonat !== letzterAbschluss.key) {
    hinweise.push(h('div', { class: 'hinweis gruen' }, h('div', { class: 't' },
      h('strong', {}, `${monatsName(letzterAbschluss.key)} ist abgeschlossen.`),
      h('div', { class: 'klein' }, 'Zeit für die monatliche Sicherung – am besten gleich mit dem PDF-Bericht.'),
      h('div', { class: 'knoepfe' },
        h('a', { class: 'knopf klein', href: `#/mehr/sicherung?monat=${letzterAbschluss.key}` }, 'Jetzt sichern'),
        h('button', { class: 'knopf klein grau', onclick: async () => { await D.setzeEinstellungen({ erinnerungMonat: letzterAbschluss.key }, { protokoll: false }); await K.ladeEinst(); K.neuZeichnen(); } }, 'Später')))));
  }
  if (z.ueberzogen) {
    hinweise.push(h('div', { class: 'hinweis rot' }, h('div', { class: 't' }, h('strong', {}, 'Budget überschritten. '), `Du liegst ${euro(-z.verfuegbar)} über deinem Monatsbudget.`)));
  } else if (stufe) {
    hinweise.push(h('div', { class: `hinweis ${stufe >= 100 ? 'rot' : 'gelb'}` }, h('div', { class: 't' },
      h('strong', {}, `${stufe} % erreicht. `), `Du hast ${prozent} % deines variablen Budgets verbraucht.`)));
  }

  const balkenKlasse = z.ueberzogen || prozent >= 100 ? 'voll' : stufe ? 'warn' : '';
  return h('div', {},
    h('h1', { style: { marginBottom: '2px' } }, monatsName(md.key)),
    h('p', { class: 'leise klein', style: { margin: '0 4px 14px' } }, `${kurzDatum(md.zeitraum.start)} – ${kurzDatum(md.zeitraum.ende)}`),
    hinweise,
    h('div', { class: `karte held ${z.ueberzogen ? 'ueberzogen rot-rand' : ''}` },
      h('div', { class: 'label' }, z.ueberzogen ? 'Überzogen diesen Monat' : 'Noch verfügbar diesen Monat'),
      h('div', { class: 'betrag zahl' }, euro(z.verfuegbar)),
      h('div', { class: `balken ${balkenKlasse}`, role: 'progressbar', 'aria-valuenow': prozent, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('div', { style: { width: `${Math.min(100, prozent)}%` } })),
      h('div', { class: 'unter' },
        h('span', {}, `${prozent} % verbraucht`),
        h('span', {}, tage ? `${euro(restProTag(z.verfuegbar, tage))} pro Tag · noch ${tage} ${tage === 1 ? 'Tag' : 'Tage'}` : 'letzter Tag'))),
    h('div', { class: 'schnell' },
      h('button', { class: 'knopf', onclick: belegErfassen }, icon('kamera'), 'Beleg erfassen'),
      h('button', { class: 'knopf zweit', onclick: () => buchungsformular({ art: 'ausgabe' }) }, icon('stift'), 'Ausgabe')),
    h('div', { class: 'raster' },
      kachel('Einnahmen', euro(z.einnahmen), z.zusatz ? `inkl. ${euro(z.zusatz)} zusätzlich` : `${md.stamm.einnahmen.length} Quellen`, () => einnahmenDetail(md)),
      kachel('Fixkosten', euro(z.fix), `${md.stamm.fixkosten.length} Posten, anteilig`, () => fixkostenDetail(md)),
      kachel('Sparbetrag', euro(z.spar), 'pro Monat', () => sparbetragDetail(md)),
      kachel('Variable Ausgaben', euro(z.ausgaben), z.erstattungen ? `− ${euro(z.erstattungen)} Erstattungen` : `${md.aktive.filter((b) => b.art === 'ausgabe').length} Buchungen`, () => ausgabenDetail(md))),
    md.kategorien.length ? h('div', {}, h('h2', {}, 'Nach Kategorie'), h('div', { class: 'karte' }, kategorieBalken(md.kategorien))) : null,
    h('h2', {}, 'Letzte Buchungen'),
    h('div', { class: 'liste' }, md.aktive.length ? md.aktive.slice(0, 6).map((b) => buchungsZeile(b))
      : h('div', { class: 'leer' }, 'Noch keine Buchungen in diesem Monat.')),
    md.aktive.length > 6 ? h('a', { class: 'textknopf', href: '#/journal' }, 'Alle Buchungen anzeigen') : null);
}

// ---------------- Journal ----------------
const journalFilter = { ansicht: 'buchungen', suche: '', kategorie: '', von: '', bis: '', min: '', max: '', storniert: true, art: '' };

export async function journalSeite() {
  const D = K.daten;
  const f = journalFilter;
  const ergebnis = h('div');
  const segment = h('div', { class: 'segment' },
    h('button', { class: f.ansicht === 'buchungen' ? 'an' : '', onclick: () => { f.ansicht = 'buchungen'; K.neuZeichnen(); } }, 'Buchungen'),
    h('button', { class: f.ansicht === 'protokoll' ? 'an' : '', onclick: () => { f.ansicht = 'protokoll'; K.neuZeichnen(); } }, 'Änderungen'));

  const suche = h('input', { class: 'eingabe', type: 'search', placeholder: f.ansicht === 'buchungen' ? 'Händler oder Notiz suchen' : 'Im Protokoll suchen', value: f.suche,
    oninput: (ev) => { f.suche = ev.target.value; zeichne(); } });

  const alleB = await D.buchungen({ mitStornierten: true });
  const protokoll = (await D.protokoll()).reverse();

  function zeichne() {
    if (f.ansicht === 'protokoll') {
      const q = f.suche.toLowerCase();
      const l = protokoll.filter((p) => !q || p.text.toLowerCase().includes(q))
        .filter((p) => (!f.von || p.zeit >= new Date(f.von).getTime()) && (!f.bis || p.zeit <= new Date(f.bis + 'T23:59:59').getTime()));
      ersetze(ergebnis, h('div', { class: 'karte' }, l.length ? l.slice(0, 300).map((p) =>
        h('div', { class: `verlauf-eintrag ${p.korrektur ? 'korr' : ''} ${/storniert|gelöscht/.test(p.aktion) ? 'storno' : ''}` },
          h('div', { class: 'zeit' }, `${zeitstempel(p.zeit)} · ${monatsName(p.monat)}${p.korrektur ? ' · Korrektur' : ''}`),
          h('div', {}, p.text))) : h('div', { class: 'leer' }, 'Keine Einträge.')));
      return;
    }
    const q = f.suche.toLowerCase();
    const min = parseEuro(f.min), max = parseEuro(f.max);
    const l = alleB.filter((b) => (f.storniert || b.status !== 'storniert')
      && (!q || `${b.haendler} ${b.notiz}`.toLowerCase().includes(q))
      && (!f.kategorie || b.kategorie === f.kategorie)
      && (!f.art || b.art === f.art)
      && (!f.von || b.datum >= f.von) && (!f.bis || b.datum <= f.bis)
      && (min == null || b.betrag >= min) && (max == null || b.betrag <= max));
    const gruppen = new Map();
    for (const b of l) { if (!gruppen.has(b.monat)) gruppen.set(b.monat, []); gruppen.get(b.monat).push(b); }
    const summe = l.filter((b) => b.status !== 'storniert').reduce((s, b) => s + (b.art === 'ausgabe' ? -b.betrag : b.betrag), 0);
    ersetze(ergebnis, 
      h('p', { class: 'leise klein' }, `${l.length} ${l.length === 1 ? 'Buchung' : 'Buchungen'} · Summe ${euro(summe, { vorzeichen: true })}`),
      l.length ? [...gruppen.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([m, bs]) => [
        h('h2', {}, monatsName(m)), h('div', { class: 'liste' }, bs.map((b) => buchungsZeile(b)))])
        : h('div', { class: 'liste' }, h('div', { class: 'leer' }, 'Keine Buchungen gefunden.')));
  }

  const filterAuf = f.kategorie || f.von || f.bis || f.min || f.max || f.art || !f.storniert;
  const filter = h('details', { class: 'karte', open: !!filterAuf }, h('summary', {}, 'Filter'),
    h('div', { style: { marginTop: '12px' } },
      h('div', { class: 'filter' },
        feld('Von', h('input', { class: 'eingabe', type: 'date', value: f.von, onchange: (ev) => { f.von = ev.target.value; zeichne(); } })),
        feld('Bis', h('input', { class: 'eingabe', type: 'date', value: f.bis, onchange: (ev) => { f.bis = ev.target.value; zeichne(); } }))),
      f.ansicht === 'buchungen' ? [
        h('div', { class: 'filter' },
          feld('Kategorie', auswahl([['', 'Alle'], ...K.einst.kategorien], f.kategorie, { onchange: (ev) => { f.kategorie = ev.target.value; zeichne(); } })),
          feld('Art', auswahl([['', 'Alle'], ['ausgabe', 'Ausgaben'], ['erstattung', 'Erstattungen'], ['zusatzeinnahme', 'Zusatzeinnahmen']], f.art, { onchange: (ev) => { f.art = ev.target.value; zeichne(); } }))),
        h('div', { class: 'filter' },
          feld('Betrag ab', h('input', { class: 'eingabe', inputmode: 'decimal', value: f.min, placeholder: '0,00', oninput: (ev) => { f.min = ev.target.value; zeichne(); } })),
          feld('Betrag bis', h('input', { class: 'eingabe', inputmode: 'decimal', value: f.max, placeholder: '0,00', oninput: (ev) => { f.max = ev.target.value; zeichne(); } }))),
        h('label', { class: 'schalter' }, h('span', {}, 'Stornierte anzeigen'),
          h('input', { type: 'checkbox', checked: f.storniert, onchange: (ev) => { f.storniert = ev.target.checked; zeichne(); } })),
      ] : null,
      h('button', { class: 'textknopf', onclick: () => { Object.assign(f, { suche: '', kategorie: '', von: '', bis: '', min: '', max: '', storniert: true, art: '' }); K.neuZeichnen(); } }, 'Filter zurücksetzen')));

  zeichne();
  return h('div', {}, h('h1', {}, 'Journal'), segment, h('div', { style: { marginBottom: '12px' } }, suche), filter, ergebnis);
}

// ---------------- Archiv ----------------
export async function archivSeite() {
  const D = K.daten;
  const monate = await D.abgeschlosseneMonate();
  const daten = await Promise.all(monate.map((m) => D.monatsDaten(m.key)));
  const aktuell = await D.monatsDaten();
  const verlaufDaten = daten.slice(0, 12).reverse();
  let verlauf = null;
  if (verlaufDaten.length) {
    const werte = verlaufDaten.map((d) => d.zahlen.verfuegbar);
    const maxAbs = Math.max(1, ...werte.map(Math.abs));
    const hatNeg = werte.some((w) => w < 0), hatPos = werte.some((w) => w > 0);
    const oben = hatNeg && hatPos ? 50 : hatNeg ? 0 : 100;
    verlauf = h('div', { class: 'karte' },
      h('h3', {}, 'Restbeträge im Verlauf'),
      h('div', { class: 'verlauf', role: 'img', 'aria-label': 'Restbeträge der letzten Monate' },
        h('div', { class: 'null', style: { top: `${oben}%` } }),
        verlaufDaten.map((d) => {
          const w = d.zahlen.verfuegbar;
          const hoehe = (Math.abs(w) / maxAbs) * (hatNeg && hatPos ? 50 : 100);
          return h('a', { class: 'saeule', href: `#/monat/${d.key}`, title: `${monatsName(d.key)}: ${euro(w)}`, style: { textDecoration: 'none' } },
            h('div', { style: { position: 'absolute', left: 0, right: 0, top: w >= 0 ? `${oben - hoehe}%` : `${oben}%`, height: `${Math.max(2, hoehe)}%`, display: 'flex', justifyContent: 'center' } },
              h('div', { class: `s ${w < 0 ? 'neg' : ''}`, style: { height: '100%' } })),
            h('span', { style: { position: 'absolute', bottom: '-18px' } }, monatsName(d.key).slice(0, 3)));
        })),
      h('div', { style: { height: '18px' } }));
  }
  return h('div', {},
    h('h1', {}, 'Archiv'),
    verlauf,
    h('h2', {}, 'Laufender Monat'),
    h('div', { class: 'liste' }, monatsZeile(aktuell)),
    h('h2', {}, 'Abgeschlossene Monate'),
    h('div', { class: 'liste' }, daten.length ? daten.map(monatsZeile)
      : h('div', { class: 'leer' }, 'Noch kein Monat abgeschlossen. Das passiert automatisch beim ersten Öffnen im neuen Monat.')));
}

function monatsZeile(d) {
  const z = d.zahlen;
  return h('a', { class: 'zeile pfeil', href: `#/monat/${d.key}`, style: { textDecoration: 'none', color: 'inherit' } },
    h('div', { class: 'mitte' }, h('div', { class: 'titel' }, monatsName(d.key)),
      h('div', { class: 'unter' }, `Einnahmen ${euro(z.einnahmen)} · Ausgaben ${euro(z.ausgaben)}`)),
    h('div', { class: `rechts ${z.verfuegbar < 0 ? 'rot' : ''}` }, euro(z.verfuegbar)));
}

// ---------------- Monat ----------------
export async function monatSeite(key) {
  const D = K.daten;
  const md = await D.monatsDaten(key);
  const z = md.zahlen;
  const zeile = (l, w, fett) => h('div', { class: 'zeile' }, h('div', { class: 'mitte' }, fett ? h('strong', {}, l) : l),
    h('div', { class: `rechts ${fett && w < 0 ? 'rot' : ''}` }, fett ? h('strong', {}, euro(w)) : euro(w)));
  return h('div', {},
    h('a', { class: 'zurueck', href: '#/archiv' }, '‹ Archiv'),
    h('h1', {}, monatsName(md.key), ' ', h('span', { class: `markierung ${md.abgeschlossen ? 'gruen' : 'gelb'}` }, md.abgeschlossen ? 'abgeschlossen' : 'laufend')),
    h('p', { class: 'leise klein' }, `${kurzDatum(md.zeitraum.start)} – ${kurzDatum(md.zeitraum.ende)}${md.abgeschlossen ? ` · abgeschlossen am ${zeitstempel(md.abgeschlossenAm)}` : ''}`),
    h('div', { class: 'liste' },
      zeile('Einnahmen', z.einnahmen), zeile('Fixkosten', -z.fix), zeile('Sparbetrag', -z.spar),
      zeile('Variable Ausgaben', -z.ausgaben), zeile('Erstattungen', z.erstattungen), zeile('Restbetrag', z.verfuegbar, true)),
    h('div', { class: 'knopfreihe', style: { marginBottom: '12px' } },
      h('button', { class: 'knopf', onclick: () => pdfDialog(md.key) }, 'PDF-Bericht'),
      md.abgeschlossen ? h('button', { class: 'knopf zweit', onclick: () => buchungsformular({ korrektur: true, modus: 'bearbeiten-neu', titel: 'Korrekturbuchung',
        vorlage: { datum: md.zeitraum.ende } }) }, 'Korrekturbuchung') : null),
    md.kategorien.length ? [h('h2', {}, 'Nach Kategorie'), h('div', { class: 'karte' }, kategorieBalken(md.kategorien))] : null,
    h('h2', {}, `Buchungen (${md.buchungen.length})`),
    h('div', { class: 'liste' }, md.buchungen.length ? md.buchungen.map((b) => buchungsZeile(b)) : h('div', { class: 'leer' }, 'Keine Buchungen.')),
    h('h2', {}, 'Fixkosten'),
    h('div', { class: 'liste' }, md.stamm.fixkosten.length ? [...md.stamm.fixkosten].sort((a, b) => b.anteil - a.anteil).map((f) => h('div', { class: 'zeile' },
      h('div', { class: 'mitte' }, h('div', { class: 'titel' }, f.name), h('div', { class: 'unter' }, `${f.kategorie} · ${rhythmusName(f.rhythmus)} ${euro(f.betrag)}`)),
      h('div', { class: 'rechts' }, euro(f.anteil)))) : h('div', { class: 'leer' }, 'Keine Fixkosten.')),
    h('h2', {}, 'Einnahmequellen'),
    h('div', { class: 'liste' }, md.stamm.einnahmen.map((e) => h('div', { class: 'zeile' }, h('div', { class: 'mitte' }, e.name), h('div', { class: 'rechts' }, euro(e.betrag)))),
      h('div', { class: 'zeile' }, h('div', { class: 'mitte' }, 'Sparbetrag'), h('div', { class: 'rechts' }, euro(md.stamm.sparbetrag)))),
    h('h2', {}, 'Änderungsprotokoll'),
    h('div', { class: 'karte' }, md.protokoll.length ? md.protokoll.map((p) => h('div', { class: `verlauf-eintrag ${p.korrektur ? 'korr' : ''}` },
      h('div', { class: 'zeit' }, zeitstempel(p.zeit) + (p.korrektur ? ' · Korrektur' : '')), h('div', {}, p.text))) : h('div', { class: 'leer' }, 'Keine Änderungen.')));
}

// ---------------- PDF ----------------
async function bildMasse(dataUrl) {
  const img = new Image(); img.src = dataUrl; await img.decode();
  return { breite: img.naturalWidth, hoehe: img.naturalHeight };
}

export async function pdfErstellen(key, { mitBildern = false } = {}) {
  await ladeSkript('vendor/jspdf.umd.min.js');
  await ladeSkript('vendor/jspdf.plugin.autotable.min.js');
  const md = await K.daten.monatsDaten(key);
  const daten = berichtDaten(md, { erstellt: Date.now() });
  const bilder = [];
  if (mitBildern) {
    const gesehen = new Set();
    for (const b of daten.buchungen) {
      if (!b.bildId || gesehen.has(b.bildId)) continue;
      gesehen.add(b.bildId);
      const bild = await K.daten.bild(b.bildId);
      if (!bild?.blob) continue;
      const dataUrl = await blobZuDataUrl(bild.blob);
      bilder.push({ titel: `Beleg: ${b.datum} · ${b.haendler} · ${euro(b.betrag)}`, dataUrl, ...(await bildMasse(dataUrl)) });
    }
  }
  const doc = erzeugePdf(window.jspdf.jsPDF, daten, { bilder });
  return new File([doc.output('blob')], `Haushaltsbudget-${key}.pdf`, { type: 'application/pdf' });
}

export function pdfDialog(key) {
  let mitBildern = false;
  const s = sheet(`PDF-Bericht ${monatsName(key)}`, () => h('div', {},
    h('p', { class: 'leise klein' }, 'Der Bericht wird direkt auf dem iPhone erstellt. Danach kannst du ihn drucken, in „Dateien“ sichern oder versenden.'),
    h('label', { class: 'schalter' }, h('span', {}, 'Belegbilder anhängen'),
      h('input', { type: 'checkbox', onchange: (ev) => { mitBildern = ev.target.checked; } })),
    h('button', { class: 'knopf', style: { marginTop: '12px' }, onclick: async (ev) => {
      ev.target.disabled = true; ev.target.textContent = 'Wird erstellt …';
      try {
        const datei = await pdfErstellen(key, { mitBildern });
        s.setze(teilenAnsicht(datei, 'Der Bericht ist fertig.'));
      } catch (e) {
        console.error(e); toast('Der PDF-Bericht konnte nicht erstellt werden.');
        ev.target.disabled = false; ev.target.textContent = 'PDF erstellen';
      }
    } }, 'PDF erstellen')));
}

/** iOS erlaubt das Teilen-Menü nur direkt nach einem Tipp – daher ein eigener Knopf. */
export function teilenAnsicht(datei, text, nachher) {
  return h('div', {},
    h('p', {}, text),
    h('p', { class: 'leise klein' }, `${datei.name} · ${Math.max(1, Math.round(datei.size / 1024))} KB`),
    h('button', { class: 'knopf', onclick: async () => { const r = await teilen(datei); if (r !== 'abgebrochen') nachher?.(); } }, 'Teilen / In „Dateien“ sichern'));
}

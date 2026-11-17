// Buchungen erfassen, Belege erkennen, Details mit Verlauf anzeigen.
import { K } from './kontext.js';
import { h, icon, sheet, bestaetigen, toast, betragsFeld, auswahl, feld } from './ui.js';
import { euro, parseEuro, zahl } from './geld.js';
import { kurzDatum, zeitstempel, monatsName } from './zeit.js';
import { findeDubletten } from './rechnen.js';
import { ARTEN, QUELLEN, MonatAbgeschlossenFehler } from './daten.js';
import { rateKategorie, kategorieVerlauf } from './kategorien-raten.js';
import { werteBelegAus } from './belegtext.js';

const ART_SYMBOL = { ausgabe: '−', erstattung: '↩', zusatzeinnahme: '+' };

export function buchungsZeile(b, { onClick } = {}) {
  const vorzeichen = b.art === 'ausgabe' ? -b.betrag : b.betrag;
  return h('button', { class: `zeile ${b.status === 'storniert' ? 'storniert' : ''}`, onclick: onClick || (() => buchungsDetail(b.id)) },
    h('div', { class: `symbol ${b.art === 'ausgabe' ? '' : ''}` }, b.bildId ? '🧾' : ART_SYMBOL[b.art]),
    h('div', { class: 'mitte' },
      h('div', { class: 'titel' }, b.haendler || b.notiz || (b.art === 'zusatzeinnahme' ? 'Zusatzeinnahme' : b.kategorie)),
      h('div', { class: 'unter' }, [kurzDatum(b.datum), b.art === 'zusatzeinnahme' ? ARTEN[b.art] : b.kategorie,
        b.art === 'erstattung' ? 'Erstattung' : null, b.status === 'storniert' ? 'storniert' : null].filter(Boolean).join(' · '))),
    h('div', { class: `rechts ${vorzeichen > 0 ? 'gruen' : ''}` }, euro(vorzeichen, { vorzeichen: true })));
}

/** Speichert mit Dubletten-Warnung und Rückfrage bei abgeschlossenem Monat. */
async function speichern(daten, { bearbeiten = null, korrektur = false } = {}) {
  const D = K.daten;
  if (!bearbeiten || daten.betrag !== bearbeiten.betrag || daten.datum !== bearbeiten.datum) {
    const vorhandene = await D.buchungen();
    const treffer = findeDubletten({ id: bearbeiten?.id, art: daten.art || bearbeiten?.art, betrag: daten.betrag, datum: daten.datum }, vorhandene);
    if (treffer.length) {
      const t = treffer[0];
      const ok = await bestaetigen('Mögliche Doppelbuchung',
        `Es gibt schon ${ARTEN[t.art] === 'Ausgabe' ? 'eine Ausgabe' : 'eine Buchung'} über ${euro(t.betrag)} am ${kurzDatum(t.datum)}${t.haendler ? ` (${t.haendler})` : ''}. Trotzdem speichern?`,
        { ja: 'Trotzdem speichern' });
      if (!ok) return null;
    }
  }
  try {
    return bearbeiten
      ? await D.buchungAendern(bearbeiten.id, daten, { korrektur })
      : await D.buchungAnlegen(daten, { korrektur });
  } catch (e) {
    if (e instanceof MonatAbgeschlossenFehler && !korrektur) {
      const ok = await bestaetigen('Monat ist abgeschlossen',
        `${monatsName(e.key)} ist bereits abgeschlossen. Möchtest du das als Korrektur buchen? Die Korrektur wird im Protokoll festgehalten.`,
        { ja: 'Als Korrektur buchen' });
      if (!ok) return null;
      return speichern(daten, { bearbeiten, korrektur: true });
    }
    throw e;
  }
}

/**
 * Formular für Ausgabe / Erstattung / Zusatzeinnahme.
 * vorlage: vorbefüllte Werte (z. B. aus Belegerkennung); modus: 'neu' | 'bestaetigen' | 'bearbeiten'
 */
export function buchungsformular({ art = 'ausgabe', vorlage = {}, modus = 'neu', bearbeiten = null, korrektur = false,
  titel, bildUrl = null, beimSpeichern, beimVerwerfen } = {}) {
  const e = K.einst;
  const z = { art, betrag: '', kategorie: null, datum: K.daten.heute(), haendler: '', notiz: '', quelle: 'manuell', bildId: null, ...vorlage };
  if (bearbeiten) Object.assign(z, bearbeiten);
  const schnell = modus === 'neu' && !korrektur;
  let mehr = !schnell || !!z.bildId;
  let zusatzBild = null; // optionales Foto bei manueller Buchung
  let gespeichert = false;

  const s = sheet(titel || (bearbeiten ? 'Buchung bearbeiten' : modus === 'bestaetigen' ? 'Beleg prüfen' : 'Neue Buchung'), () => h('div'),
    { onClose: () => { if (!gespeichert) beimVerwerfen?.(); } });

  const betragInput = betragsFeld(typeof z.betrag === 'number' ? zahl(z.betrag) : z.betrag, { class: 'eingabe zahl betrag-gross', 'aria-label': 'Betrag' });

  async function sichern() {
    const betrag = parseEuro(betragInput.value);
    if (betrag == null || betrag <= 0) { toast('Bitte einen Betrag eingeben.'); betragInput.focus(); return; }
    if (z.art !== 'zusatzeinnahme' && !z.kategorie) { toast('Bitte eine Kategorie wählen.'); return; }
    if (zusatzBild) {
      const { bildVerkleinern } = await import('./beleg.js');
      const { blob } = await bildVerkleinern(zusatzBild);
      z.bildId = await K.daten.bildSpeichern(blob);
    }
    const d = { art: z.art, betrag, kategorie: z.art === 'zusatzeinnahme' ? '' : z.kategorie, datum: z.datum,
      haendler: (z.haendler || '').trim(), notiz: (z.notiz || '').trim(), quelle: z.quelle, bildId: z.bildId };
    if (!bearbeiten && vorlage.kiOriginal) d.kiOriginal = vorlage.kiOriginal;
    const b = await speichern(d, { bearbeiten, korrektur });
    if (!b) return;
    gespeichert = true;
    s.schliessen();
    if (beimSpeichern) beimSpeichern(b);
    else {
      toast(`${ARTEN[b.art]} über ${euro(b.betrag)} gespeichert`, bearbeiten ? {} : {
        aktion: 'Rückgängig',
        beiAktion: async () => { await K.daten.buchungStornieren(b.id, { korrektur: true, grund: 'Rückgängig gemacht' }); toast('Buchung storniert'); K.neuZeichnen(); },
      });
    }
    K.neuZeichnen();
  }

  function aufbauen() {
    const kategorien = e.kategorien;
    const kinder = [];
    if (!bearbeiten) {
      kinder.push(h('div', { class: 'segment' }, Object.entries(ARTEN).map(([k, t]) =>
        h('button', { class: z.art === k ? 'an' : '', onclick: () => { z.art = k; s.setze(aufbauen()); } }, t))));
    }
    if (bildUrl) kinder.push(h('img', { src: bildUrl, class: 'beleg-bild', alt: 'Beleg', style: { maxHeight: '180px', objectFit: 'contain' } }));
    kinder.push(feld(z.art === 'zusatzeinnahme' ? 'Betrag der Zusatzeinnahme' : z.art === 'erstattung' ? 'Erstatteter Betrag' : 'Betrag', betragInput));
    if (z.art !== 'zusatzeinnahme') {
      kinder.push(h('label', { class: 'feld' }, h('span', {}, schnell && !mehr ? 'Kategorie antippen – wird sofort gespeichert' : 'Kategorie'),
        h('div', { class: 'chips gross' }, kategorien.map((k) => h('button', {
          class: `chip ${z.kategorie === k ? 'an' : ''}`, type: 'button',
          onclick: () => { z.kategorie = k; if (schnell && !mehr) sichern(); else s.setze(aufbauen()); },
        }, k)))));
    }
    if (mehr || z.art === 'zusatzeinnahme') {
      kinder.push(feld('Datum', h('input', { class: 'eingabe', type: 'date', value: z.datum, max: '2100-12-31', onchange: (ev) => { z.datum = ev.target.value || z.datum; } })));
      kinder.push(feld(z.art === 'zusatzeinnahme' ? 'Bezeichnung (z. B. Flohmarkt)' : 'Händler', h('input', { class: 'eingabe', value: z.haendler, oninput: (ev) => { z.haendler = ev.target.value; } })));
      kinder.push(feld('Notiz (optional)', h('input', { class: 'eingabe', value: z.notiz, oninput: (ev) => { z.notiz = ev.target.value; } })));
      if (modus === 'bestaetigen' || bearbeiten?.bildId) {
        kinder.push(feld('Quelle', auswahl([['bon', 'Kassenbon'], ['screenshot', 'Screenshot'], ['manuell', 'Manuell']], z.quelle,
          { onchange: (ev) => { z.quelle = ev.target.value; } })));
      }
      if (!z.bildId) {
        kinder.push(feld('Foto anhängen (optional)', h('input', { class: 'eingabe', type: 'file', accept: 'image/*',
          onchange: (ev) => { zusatzBild = ev.target.files[0] || null; } })));
      }
    } else {
      kinder.push(h('button', { class: 'textknopf', onclick: () => { mehr = true; s.setze(aufbauen()); } }, 'Datum, Händler, Notiz, Foto …'));
    }
    if (korrektur) kinder.push(h('div', { class: 'hinweis gelb' }, h('div', { class: 't' }, 'Korrekturbuchung in einem abgeschlossenen Monat – wird protokolliert.')));
    kinder.push(h('div', { class: 'knopfreihe', style: { marginTop: '8px' } },
      modus === 'bestaetigen' ? h('button', { class: 'knopf grau', onclick: () => s.schliessen() }, 'Verwerfen') : null,
      h('button', { class: 'knopf', onclick: sichern }, modus === 'bestaetigen' ? 'Übernehmen' : 'Speichern')));
    return h('div', {}, kinder);
  }
  s.setze(aufbauen());
  if (modus !== 'bestaetigen' && !bearbeiten) setTimeout(() => betragInput.focus(), 300);
  return s;
}

export function plusMenue() {
  sheet('Was möchtest du erfassen?', (zu) => h('div', { style: { display: 'grid', gap: '10px' } },
    h('button', { class: 'knopf', onclick: () => { zu(true); belegErfassen(); } }, icon('kamera'), 'Beleg erfassen'),
    h('button', { class: 'knopf zweit', onclick: () => { zu(true); buchungsformular({ art: 'ausgabe' }); } }, 'Ausgabe'),
    h('button', { class: 'knopf zweit', onclick: () => { zu(true); buchungsformular({ art: 'erstattung', titel: 'Rückgabe / Erstattung' }); } }, 'Rückgabe / Erstattung'),
    h('button', { class: 'knopf zweit', onclick: () => { zu(true); buchungsformular({ art: 'zusatzeinnahme', titel: 'Zusatzeinnahme' }); } }, 'Zusatzeinnahme')));
}

// ---------------- Beleg erfassen ----------------

export function belegErfassen() {
  const input = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  input.addEventListener('change', () => { const f = input.files[0]; input.remove(); if (f) belegVerarbeiten(f); });
  document.body.append(input);
  input.click();
}

async function belegVerarbeiten(datei) {
  const balken = h('div');
  const status = h('div', { class: 't' }, 'Bild wird vorbereitet …');
  const lade = sheet('Beleg wird gelesen', h('div', {},
    h('div', { class: 'lade' }, h('div', { class: 'kreis' }), status),
    h('div', { class: 'fortschritt' }, balken),
    h('p', { class: 'leise klein' }, 'Die Erkennung läuft nur auf deinem iPhone. Beim allerersten Mal werden einmalig ca. 9 MB geladen.')));
  const { bildVerkleinern, istScreenshot, texterkennung } = await import('./beleg.js');
  let bild, screenshot = false, text = '', fehler = null;
  try {
    [bild, screenshot] = await Promise.all([bildVerkleinern(datei), istScreenshot(datei)]);
  } catch (e) {
    lade.schliessen();
    toast('Das Bild konnte nicht geöffnet werden. Bitte manuell erfassen.');
    buchungsformular({ art: 'ausgabe', modus: 'bestaetigen' });
    return;
  }
  try {
    text = await texterkennung(datei, (p, t) => { balken.style.width = `${Math.round(p * 100)}%`; status.textContent = t; });
  } catch (e) {
    fehler = e;
  }
  const bildId = await K.daten.bildSpeichern(bild.blob);
  const bildUrl = URL.createObjectURL(bild.blob);
  lade.schliessen(true);
  const quelle = screenshot ? 'screenshot' : 'bon';
  const ergebnis = fehler ? { typ: quelle, posten: [] } : werteBelegAus(text, { heute: K.daten.heute(), istScreenshot: screenshot });
  const verlauf = kategorieVerlauf(await K.daten.buchungen());
  const posten = ergebnis.posten.map((p) => ({
    ...p, kategorie: rateKategorie(`${p.haendler} ${ergebnis.posten.length === 1 ? text : ''}`, K.einst.kategorien, { verlauf }),
  }));
  const kiOriginal = (p) => ({ erkennung: 'Texterkennung auf dem Gerät', typ: ergebnis.typ, ...(p ? { betrag: p.betrag, haendler: p.haendler, datum: p.datum, kategorie: p.kategorie, art: p.art } : {}), text: text.slice(0, 1500) });

  // Bild wieder löschen, wenn am Ende nichts übernommen wurde
  let genutzt = false;
  const aufraeumen = async () => { if (!genutzt) await K.daten.s.loesche('bilder', bildId); URL.revokeObjectURL(bildUrl); };

  if (fehler || !posten.length) {
    toast(fehler ? 'Texterkennung nicht möglich – bitte Werte eintragen.' : 'Kein Betrag erkannt – bitte Werte eintragen.', { dauer: 5000 });
    buchungsformular({ modus: 'bestaetigen', vorlage: { quelle, bildId, kiOriginal: kiOriginal(null) }, bildUrl,
      beimSpeichern: () => { genutzt = true; aufraeumen(); }, beimVerwerfen: aufraeumen });
    return;
  }

  const bestaetigeNacheinander = (liste, i = 0) => {
    if (i >= liste.length) { aufraeumen(); K.neuZeichnen(); return; }
    const p = liste[i];
    buchungsformular({
      modus: 'bestaetigen', art: p.art, bildUrl,
      titel: liste.length > 1 ? `Umsatz ${i + 1} von ${liste.length} prüfen` : 'Beleg prüfen',
      vorlage: { art: p.art, betrag: p.betrag, haendler: p.haendler, datum: p.datum, kategorie: p.kategorie, quelle, bildId, kiOriginal: kiOriginal(p) },
      beimSpeichern: (b) => { genutzt = true; toast(`${euro(b.betrag)} übernommen`); setTimeout(() => bestaetigeNacheinander(liste, i + 1), 280); },
      beimVerwerfen: () => setTimeout(() => bestaetigeNacheinander(liste, i + 1), 280),
    });
  };

  if (posten.length === 1) { bestaetigeNacheinander(posten); return; }

  // Mehrere Umsätze: Auswahl
  let weiter = false;
  const gewaehlt = posten.map((p) => p.art === 'ausgabe');
  const s = sheet(`${posten.length} Umsätze erkannt`, () => h('div', {},
    h('p', { class: 'leise klein' }, 'Wähle aus, welche Umsätze du übernehmen möchtest. Danach kannst du jeden einzeln prüfen.'),
    h('div', { class: 'liste' }, posten.map((p, i) => h('label', { class: 'zeile auswahl-posten' },
      h('input', { type: 'checkbox', checked: gewaehlt[i], onchange: (ev) => { gewaehlt[i] = ev.target.checked; } }),
      h('div', { class: 'mitte' }, h('div', { class: 'titel' }, p.haendler || 'Unbekannt'),
        h('div', { class: 'unter' }, `${kurzDatum(p.datum)} · ${p.art === 'erstattung' ? 'Gutschrift/Erstattung' : p.kategorie}`)),
      h('div', { class: `rechts ${p.art === 'erstattung' ? 'gruen' : ''}` }, euro(p.art === 'ausgabe' ? -p.betrag : p.betrag, { vorzeichen: true }))))),
    h('button', { class: 'knopf', onclick: () => {
      const liste = posten.filter((_, i) => gewaehlt[i]);
      weiter = true; s.schliessen(true);
      if (!liste.length) { aufraeumen(); return; }
      bestaetigeNacheinander(liste);
    } }, 'Weiter')), { onClose: () => { if (!weiter) aufraeumen(); } });
}

// ---------------- Details & Verlauf ----------------

export async function buchungsDetail(id) {
  const D = K.daten;
  const b = await D.buchung(id);
  if (!b) return;
  const bild = await D.bild(b.bildId);
  const verlauf = await D.protokoll({ objektId: id });
  const abgeschlossen = await D.monatAbgeschlossen(b.monat);
  const bildUrl = bild?.blob ? URL.createObjectURL(bild.blob) : null;
  const zeile = (l, w) => h('div', { class: 'zeile' }, h('div', { class: 'mitte leise' }, l), h('div', { class: 'rechts' }, w));
  const s = sheet(ARTEN[b.art], (zu) => h('div', {},
    b.status === 'storniert' ? h('div', { class: 'hinweis rot' }, h('div', { class: 't' }, `Storniert am ${zeitstempel(b.storniertAm)}${b.stornoGrund ? ` – ${b.stornoGrund}` : ''}`)) : null,
    h('div', { class: 'liste' },
      zeile('Betrag', euro(b.art === 'ausgabe' ? -b.betrag : b.betrag)),
      zeile('Datum', kurzDatum(b.datum)),
      b.haendler ? zeile(b.art === 'zusatzeinnahme' ? 'Bezeichnung' : 'Händler', b.haendler) : null,
      b.art !== 'zusatzeinnahme' ? zeile('Kategorie', b.kategorie) : null,
      b.notiz ? zeile('Notiz', b.notiz) : null,
      zeile('Quelle', QUELLEN[b.quelle] || b.quelle),
      zeile('Budgetmonat', `${monatsName(b.monat)}${abgeschlossen ? ' (abgeschlossen)' : ''}`),
      zeile('Erfasst am', zeitstempel(b.erfasstAm))),
    bildUrl ? h('a', { href: bildUrl, target: '_blank' }, h('img', { src: bildUrl, class: 'beleg-bild', alt: 'Beleg' })) : null,
    b.kiOriginal ? h('details', { class: 'karte' }, h('summary', {}, 'Erkannte Originalwerte'),
      h('div', { class: 'klein', style: { marginTop: '8px' } },
        b.kiOriginal.betrag != null ? h('p', {}, `Betrag: ${euro(b.kiOriginal.betrag)}`) : h('p', {}, 'Kein Betrag erkannt'),
        b.kiOriginal.haendler ? h('p', {}, `Händler: ${b.kiOriginal.haendler}`) : null,
        b.kiOriginal.datum ? h('p', {}, `Datum: ${kurzDatum(b.kiOriginal.datum)}`) : null,
        b.kiOriginal.kategorie ? h('p', {}, `Kategorie: ${b.kiOriginal.kategorie}`) : null,
        b.kiOriginal.text ? h('pre', { style: { whiteSpace: 'pre-wrap', fontSize: '12px', opacity: .7 } }, b.kiOriginal.text) : null)) : null,
    h('h2', {}, 'Verlauf'),
    verlauf.map((p) => h('div', { class: `verlauf-eintrag ${p.korrektur ? 'korr' : ''} ${p.aktion === 'storniert' ? 'storno' : ''}` },
      h('div', { class: 'zeit' }, `${zeitstempel(p.zeit)}${p.korrektur ? ' · Korrektur' : ''}`), h('div', {}, p.text))),
    b.status !== 'storniert' ? h('div', { class: 'knopfreihe', style: { marginTop: '16px' } },
      h('button', { class: 'knopf gefahr', onclick: async () => {
        const ok = await bestaetigen('Buchung stornieren?', `${abgeschlossen ? 'Der Monat ist abgeschlossen – das wird als Korrektur protokolliert. ' : ''}Die Buchung bleibt im Journal als storniert sichtbar.`, { ja: 'Stornieren', gefahr: true });
        if (!ok) return;
        await D.buchungStornieren(id, { korrektur: abgeschlossen });
        toast('Buchung storniert'); K.neuZeichnen();
      } }, 'Stornieren'),
      h('button', { class: 'knopf', onclick: async () => {
        if (abgeschlossen) {
          const ok = await bestaetigen('Monat ist abgeschlossen', `${monatsName(b.monat)} ist abgeschlossen. Änderungen werden als Korrektur protokolliert.`, { ja: 'Korrigieren' });
          if (!ok) return;
        }
        zu(true);
        buchungsformular({ art: b.art, bearbeiten: b, modus: 'bearbeiten', korrektur: abgeschlossen });
      } }, abgeschlossen ? 'Korrigieren' : 'Bearbeiten')) : null),
  { onClose: () => bildUrl && setTimeout(() => URL.revokeObjectURL(bildUrl), 500) });
  return s;
}

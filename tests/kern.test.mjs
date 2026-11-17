import { test } from 'node:test';
import assert from 'node:assert/strict';
import { euro, parseEuro } from '../js/geld.js';
import { zeitraum, monatVon, restTage } from '../js/zeit.js';
import { anteil, monatsZahlen, kategorienAuswertung, findeDubletten, warnStufe } from '../js/rechnen.js';
import { Daten, MonatAbgeschlossenFehler } from '../js/daten.js';
import { SpeicherImArbeitsspeicher } from '../js/speicher.js';

const uhrAuf = (iso) => { const u = { t: new Date(iso + 'T10:00:00').getTime(), jetzt() { return this.t; } }; return u; };
const stelleUhr = (u, iso) => { u.t = new Date(iso + 'T10:00:00').getTime(); };

test('Euro-Format und Eingabe', () => {
  assert.equal(euro(123456), '1.234,56 €');
  assert.equal(euro(-500), '−5,00 €');
  assert.equal(euro(5), '0,05 €');
  assert.equal(euro(100000000), '1.000.000,00 €');
  assert.equal(parseEuro('12,5'), 1250);
  assert.equal(parseEuro('1.234,56 €'), 123456);
  assert.equal(parseEuro('12.50'), 1250);
  assert.equal(parseEuro('-3,20'), -320);
  assert.equal(parseEuro('1.234'), 123400);
  assert.equal(parseEuro('abc'), null);
  // klassischer Gleitkomma-Fall
  assert.equal(parseEuro('0,1') + parseEuro('0,2'), parseEuro('0,3'));
});

test('Budgetmonat mit Starttag', () => {
  assert.deepEqual(zeitraum('2026-11', 1), { key: '2026-11', start: '2026-11-01', ende: '2026-11-30' });
  assert.deepEqual(zeitraum('2026-11', 25), { key: '2026-11', start: '2026-10-25', ende: '2026-11-24' });
  assert.equal(monatVon('2026-10-25', 25), '2026-11');
  assert.equal(monatVon('2026-10-24', 25), '2026-10');
  assert.equal(monatVon('2026-12-31', 25), '2027-01');
  // Starttag 31 im Februar wird auf den letzten Tag begrenzt
  assert.deepEqual(zeitraum('2026-03', 31), { key: '2026-03', start: '2026-02-28', ende: '2026-03-30' });
  assert.equal(restTage('2026-11-30', zeitraum('2026-11')), 1);
  assert.equal(restTage('2026-11-01', zeitraum('2026-11')), 30);
});

test('anteilige Fixkosten summieren sich exakt', () => {
  assert.equal(anteil(48000, 12, '2026-05'), 4000);
  let jahr = 0;
  for (let m = 1; m <= 12; m++) jahr += anteil(10000, 12, `2026-${String(m).padStart(2, '0')}`);
  assert.equal(jahr, 10000);
  let quartal = 0;
  for (let m = 1; m <= 3; m++) quartal += anteil(10001, 3, `2026-0${m}`);
  assert.equal(quartal, 10001);
  assert.equal(anteil(1234, 1, '2026-07'), 1234);
});

test('Budgetberechnung mit Erstattungen und Zusatzeinnahmen', () => {
  const stamm = {
    einnahmen: [{ betrag: 250000 }, { betrag: 25500 }, { betrag: 10000, aktiv: false }],
    fixkosten: [{ betrag: 90000, rhythmus: 1 }, { betrag: 48000, rhythmus: 12 }, { betrag: 5000, rhythmus: 1, aktiv: false }],
    sparbetrag: 20000,
  };
  const b = [
    { art: 'ausgabe', betrag: 12345, kategorie: 'Lebensmittel' },
    { art: 'ausgabe', betrag: 5000, kategorie: 'Kleidung' },
    { art: 'erstattung', betrag: 2000, kategorie: 'Kleidung' },
    { art: 'zusatzeinnahme', betrag: 3000 },
    { art: 'ausgabe', betrag: 99999, kategorie: 'Kleidung', status: 'storniert' },
  ];
  const z = monatsZahlen(stamm, b, '2026-11');
  assert.equal(z.einnahmen, 250000 + 25500 + 3000);
  assert.equal(z.fix, 90000 + 4000);
  assert.equal(z.spar, 20000);
  assert.equal(z.ausgaben, 17345);
  assert.equal(z.erstattungen, 2000);
  assert.equal(z.verfuegbar, 278500 - 94000 - 20000 - 17345 + 2000);
  const k = kategorienAuswertung(b);
  assert.equal(k.find((x) => x.kategorie === 'Kleidung').netto, 3000);
  assert.equal(warnStufe({ quote: 0.85 }), 80);
  assert.equal(warnStufe({ quote: 1.0 }), 100);
  assert.equal(warnStufe({ quote: 0.5 }), 0);
  assert.equal(monatsZahlen({ einnahmen: [{ betrag: 1000 }], fixkosten: [], sparbetrag: 0 },
    [{ art: 'ausgabe', betrag: 1500 }], '2026-11').ueberzogen, true);
});

test('Dublettenerkennung ±2 Tage', () => {
  const alt = [
    { id: 'a', art: 'ausgabe', betrag: 2345, datum: '2026-11-10' },
    { id: 'b', art: 'ausgabe', betrag: 2345, datum: '2026-11-15' },
    { id: 'c', art: 'erstattung', betrag: 2345, datum: '2026-11-11' },
    { id: 'd', art: 'ausgabe', betrag: 2345, datum: '2026-11-12', status: 'storniert' },
  ];
  const t = findeDubletten({ art: 'ausgabe', betrag: 2345, datum: '2026-11-12' }, alt);
  assert.deepEqual(t.map((x) => x.id), ['a']);
  assert.equal(findeDubletten({ art: 'ausgabe', betrag: 2346, datum: '2026-11-10' }, alt).length, 0);
});

test('Monatsabschluss, Schreibschutz, Korrektur und Protokoll', async () => {
  const uhr = uhrAuf('2026-10-05');
  const d = new Daten(new SpeicherImArbeitsspeicher(), uhr);
  await d.monatsabschlussPruefen();
  const geh = await d.speichereStamm('einnahmen', { name: 'Gehalt', betrag: 200000 });
  const miete = await d.speichereStamm('fixkosten', { name: 'Miete', betrag: 80000, kategorie: 'Wohnen', rhythmus: 1 });
  await d.setzeEinstellungen({ sparbetrag: 10000 });
  const b1 = await d.buchungAnlegen({ betrag: 5000, kategorie: 'Lebensmittel', haendler: 'REWE', datum: '2026-10-03' });
  await d.buchungAendern(b1.id, { betrag: 5500 });
  const b2 = await d.buchungAnlegen({ betrag: 1000, datum: '2026-10-04' });
  await d.buchungStornieren(b2.id);

  // Verlauf der Buchung
  const verlauf = await d.protokoll({ objektId: b1.id });
  assert.deepEqual(verlauf.map((p) => p.aktion), ['angelegt', 'geändert']);
  assert.deepEqual(verlauf[1].alt, { betrag: 5000 });
  assert.deepEqual(verlauf[1].neu, { betrag: 5500 });
  // stornierte Buchung bleibt sichtbar
  const alle = await d.buchungen({ mitStornierten: true });
  assert.equal(alle.find((b) => b.id === b2.id).status, 'storniert');

  // Monatswechsel
  stelleUhr(uhr, '2026-12-02');
  const geschlossen = await d.monatsabschlussPruefen();
  assert.deepEqual(geschlossen, ['2026-10', '2026-11']);
  const okt = await d.monatsDaten('2026-10');
  assert.equal(okt.abgeschlossen, true);
  assert.equal(okt.zahlen.verfuegbar, 200000 - 80000 - 10000 - 5500);
  const nov = await d.monatsDaten('2026-11');
  assert.equal(nov.zahlen.ausgaben, 0); // neuer Monat startet bei null, ohne Übertrag
  assert.equal(nov.zahlen.verfuegbar, 110000);

  // spätere Änderungen an Stammdaten verändern abgeschlossene Monate nicht
  await d.speichereStamm('fixkosten', { id: miete.id, betrag: 90000 });
  assert.equal((await d.monatsDaten('2026-10')).zahlen.fix, 80000);
  assert.equal((await d.monatsDaten('2026-12')).zahlen.fix, 90000);
  const mieteLog = (await d.protokoll({ objektId: miete.id })).at(-1);
  assert.deepEqual([mieteLog.alt.betrag, mieteLog.neu.betrag], [80000, 90000]);

  // Schreibschutz
  await assert.rejects(d.buchungAendern(b1.id, { betrag: 1 }), MonatAbgeschlossenFehler);
  await assert.rejects(d.buchungAnlegen({ betrag: 100, datum: '2026-10-20' }), MonatAbgeschlossenFehler);
  await assert.rejects(d.buchungStornieren(b1.id), MonatAbgeschlossenFehler);
  // ausdrückliche Korrektur
  await d.buchungAendern(b1.id, { betrag: 6000 }, { korrektur: true });
  const korr = (await d.protokoll({ objektId: b1.id })).at(-1);
  assert.equal(korr.korrektur, true);
  assert.equal((await d.monatsDaten('2026-10')).zahlen.ausgaben, 6000);
  // Sparbetrag-Änderung protokolliert
  const spar = (await d.protokoll()).find((p) => p.objektId === 'sparbetrag');
  assert.deepEqual(spar.neu, { sparbetrag: 10000 });
  // Einnahme-Löschung protokolliert, nicht mehr im Stamm
  await d.loescheStamm('einnahmen', geh.id);
  assert.equal((await d.stamm()).einnahmen.length, 0);
  assert.equal((await d.protokoll({ objektId: geh.id })).at(-1).aktion, 'gelöscht');
});

test('Starttag Gehaltseingang ordnet Buchungen richtig zu', async () => {
  const uhr = uhrAuf('2026-11-26');
  const d = new Daten(new SpeicherImArbeitsspeicher(), uhr);
  await d.setzeEinstellungen({ startTag: 25 });
  await d.monatsabschlussPruefen();
  assert.equal(await d.aktuellerMonat(), '2026-12');
  const b = await d.buchungAnlegen({ betrag: 100, datum: '2026-11-25' });
  assert.equal(b.monat, '2026-12');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Daten } from '../js/daten.js';
import { SpeicherImArbeitsspeicher } from '../js/speicher.js';
import { berichtDaten, erzeugePdf } from '../js/bericht.js';
import { euro } from '../js/geld.js';

const require = createRequire(import.meta.url);
const { jsPDF } = require('../vendor/jspdf.umd.min.js');
const tabellenPlugin = require('../vendor/jspdf.plugin.autotable.min.js');
(tabellenPlugin.applyPlugin || tabellenPlugin.default?.applyPlugin)?.(jsPDF);

test('PDF-Summen stimmen exakt mit Startseite und Archiv überein', async () => {
  const uhr = { t: new Date('2026-10-02T10:00:00').getTime(), jetzt() { return this.t; } };
  const d = new Daten(new SpeicherImArbeitsspeicher(), uhr);
  await d.monatsabschlussPruefen();
  await d.speichereStamm('einnahmen', { name: 'Gehalt', betrag: 231234 });
  await d.speichereStamm('einnahmen', { name: 'Kindergeld', betrag: 25500 });
  await d.speichereStamm('fixkosten', { name: 'Miete', betrag: 85000, kategorie: 'Wohnen', rhythmus: 1 });
  await d.speichereStamm('fixkosten', { name: 'Kfz-Versicherung', betrag: 47999, kategorie: 'Versicherungen', rhythmus: 12 });
  await d.speichereStamm('fixkosten', { name: 'Wasser', betrag: 9001, kategorie: 'Energie', rhythmus: 3 });
  await d.setzeEinstellungen({ sparbetrag: 15000 });
  const beträge = [1999, 4567, 333, 12000, 89, 7777];
  for (const [i, b] of beträge.entries()) {
    await d.buchungAnlegen({ betrag: b, kategorie: i % 2 ? 'Lebensmittel' : 'Drogerie', haendler: `Laden ${i}`, datum: `2026-10-0${i + 1}` });
  }
  await d.buchungAnlegen({ art: 'erstattung', betrag: 1234, kategorie: 'Drogerie', datum: '2026-10-08' });
  await d.buchungAnlegen({ art: 'zusatzeinnahme', betrag: 5000, haendler: 'Flohmarkt', datum: '2026-10-09' });
  const storno = await d.buchungAnlegen({ betrag: 50000, kategorie: 'Kleidung', datum: '2026-10-09' });
  await d.buchungStornieren(storno.id);

  const live = await d.monatsDaten('2026-10');
  uhr.t = new Date('2026-11-03T10:00:00').getTime();
  await d.monatsabschlussPruefen();
  const archiv = await d.monatsDaten('2026-10');
  assert.equal(archiv.abgeschlossen, true);
  assert.deepEqual(archiv.zahlen, live.zahlen, 'Archiv = Startseite');

  const bd = berichtDaten(archiv, { erstellt: uhr.t });
  assert.equal(bd.summeKontrolle, archiv.zahlen.verfuegbar, 'Zeilen der Zusammenfassung ergeben den Rest');
  assert.equal(bd.rest, archiv.zahlen.verfuegbar);
  assert.equal(bd.fixSumme, archiv.zahlen.fix);
  const netto = bd.kategorien.reduce((s, k) => s + k[3], 0);
  assert.equal(netto, archiv.zahlen.ausgaben - archiv.zahlen.erstattungen);
  const buchungsSumme = bd.buchungen.filter((b) => !b.storniert).reduce((s, b) => s + b.betrag, 0);
  assert.equal(buchungsSumme, -archiv.zahlen.ausgaben + archiv.zahlen.erstattungen + archiv.zahlen.zusatz);
  assert.equal(bd.buchungen.filter((b) => b.storniert).length, 1, 'Stornierte Buchung bleibt im Bericht sichtbar');
  assert.ok(bd.protokoll.length >= 10);

  // Echtes PDF erzeugen und prüfen, dass der Restbetrag darin steht
  const doc = erzeugePdf(jsPDF, bd);
  const roh = doc.output();
  assert.ok(roh.startsWith('%PDF-'));
  const rest = euro(archiv.zahlen.verfuegbar).replace('−', '-');
  assert.ok(roh.includes(`(${rest.replace('€', '\\200')})`) || roh.includes(rest.split(' ')[0]), `Restbetrag ${rest} im PDF`);
  assert.ok(/Seite 1 von \d/.test(roh));
  assert.ok(!roh.includes('[object Object]'), 'keine unlesbaren Zellen im PDF');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leseUmsaetze, erkenneWiederkehrende, dekodiere } from '../js/kontoauszug.js';
import { werteBelegAus } from '../js/belegtext.js';
import { STANDARD_FIX_KATEGORIEN } from '../js/daten.js';

// Aufbau wie der Sparkasse-Export „CSV-CAMT V2“ (ausgedachte Daten)
const KOPF = '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Glaeubiger ID";"Mandatsreferenz";"Kundenreferenz (End-to-End)";"Sammlerreferenz";"Lastschrift Ursprungsbetrag";"Auslagenersatz Ruecklastschrift";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"';
const z = (datum, text, zweck, gl, mandat, name, betrag) =>
  `"DE00";"${datum}";"${datum}";"${text}";"${zweck}";"${gl}";"${mandat}";"";"";"";"";"${name}";"DE11";"BIC";"${betrag}";"EUR";"Umsatz gebucht"`;

function beispielCsv() {
  const zeilen = [KOPF];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    zeilen.push(z(`01.${mm}.26`, 'DAUERAUFTRAG', 'Miete Wohnung', '', '', 'Hausverwaltung Müller', '-850,00'));
    zeilen.push(z(`28.${mm}.26`, 'GEHALT', 'Lohn/Gehalt', '', '', 'FIRMA BEISPIEL GMBH', '2.500,00'));
    zeilen.push(z(`10.${mm}.26`, 'GUTSCHRIFT', 'Kindergeld KG123', '', '', 'Bundesagentur für Arbeit - Familienkasse', '255,00'));
    zeilen.push(z(`15.${mm}.26`, 'FOLGELASTSCHRIFT', 'Mobilfunk', 'DE12ZZZ000001', 'M-1', 'Telefonica Germany', `-${m === 6 ? '22,99' : '19,99'}`));
    zeilen.push(z(`0${(m % 9) + 1}.${mm}.26`, 'KARTENZAHLUNG', 'REWE', '', '', 'REWE Markt GmbH', '-45,10'));
    zeilen.push(z(`2${(m % 7) + 1}.${mm}.26`, 'KARTENZAHLUNG', 'REWE', '', '', 'REWE Markt GmbH', '-31,40'));
    if (m % 3 === 2) zeilen.push(z(`20.${mm}.26`, 'FOLGELASTSCHRIFT', 'Wasser Abschlag', 'DE99ZZZ0002', 'W-9', 'STADTWERKE MUSTERSTADT', '-90,00'));
  }
  zeilen.push(z('15.03.26', 'FOLGELASTSCHRIFT', 'Kfz-Versicherung 2026', 'DE77ZZZ0003', 'V-5', 'HUK-COBURG', '-480,00'));
  zeilen.push(z('05.04.26', 'BARGELDAUSZAHLUNG', 'GA 1234', '', '', '', '-100,00'));
  return zeilen.join('\r\n');
}

test('Sparkasse-CSV lesen (auch Windows-1252)', () => {
  const csv = beispielCsv();
  const bytes = new Uint8Array([...csv].map((c) => (c === 'ü' ? 0xfc : c.charCodeAt(0) & 0xff)));
  const text = dekodiere(bytes);
  assert.ok(text.includes('Hausverwaltung Müller'));
  const u = leseUmsaetze(text);
  assert.equal(u[0].datum, '2026-01-01');
  assert.equal(u[0].betrag, -85000);
});

test('Wiederkehrende Zahlungen erkennen', () => {
  const erg = erkenneWiederkehrende(leseUmsaetze(beispielCsv()), { fixKategorien: STANDARD_FIX_KATEGORIEN });
  const f = (n) => erg.vorschlaege.find((v) => v.name.toLowerCase().includes(n));
  assert.equal(f('hausverwaltung').rhythmus, 1);
  assert.equal(f('hausverwaltung').betrag, 85000);
  assert.equal(f('hausverwaltung').kategorie, 'Wohnen');
  assert.equal(f('telefonica').rhythmus, 1);
  assert.equal(f('telefonica').kategorie, 'Verträge & Abos');
  assert.equal(f('stadtwerke').rhythmus, 3);
  assert.equal(f('stadtwerke').kategorie, 'Energie');
  const kfz = f('huk');
  assert.equal(kfz.rhythmus, 12);
  assert.equal(kfz.nurEinmalGesehen, true);
  assert.equal(kfz.faelligMonat, 3);
  assert.equal(f('gehalt').typ, 'einnahme');
  assert.equal(f('kindergeld').betrag, 25500);
  assert.equal(erg.vorschlaege.some((v) => /rewe/i.test(v.name)), false, 'Supermarkt ist keine Fixkosten');
  assert.equal(erg.vorschlaege.some((v) => v.betrag === 10000), false, 'Bargeld ist keine Fixkosten');
});

test('Kassenbon auswerten', () => {
  const t = `REWE Markt GmbH\nHauptstr. 5\n12345 Musterstadt\nBANANEN 1,99 B\nMILCH 1,19 B\nBROT 3,49 B\nZwischensumme 6,67\nSUMME EUR 6,67\nGeg. EC-Cash EUR 6,67\nMwSt 7% 0,44\n14.11.2026 18:22 Bon-Nr. 1234`;
  const r = werteBelegAus(t, { heute: '2026-11-17' });
  assert.equal(r.typ, 'bon');
  assert.deepEqual(r.posten[0], { betrag: 667, haendler: 'REWE', datum: '2026-11-14', art: 'ausgabe' });
});

test('Bestellbestätigung auswerten', () => {
  const t = `Vielen Dank für Ihre Bestellung bei Zalando\nBestellnummer 10101\nBestelldatum: 12.11.2026\nSneaker 59,95 €\nVersand 0,00 €\nGesamtsumme 59,95 €`;
  const r = werteBelegAus(t, { heute: '2026-11-17', istScreenshot: true });
  assert.equal(r.typ, 'bestellung');
  assert.equal(r.posten[0].betrag, 5995);
  assert.equal(r.posten[0].haendler, 'Zalando');
  assert.equal(r.posten[0].datum, '2026-11-12');
});

test('Banking-Screenshot mit mehreren Umsätzen', () => {
  const t = `Umsätze\nHeute\nREWE SAGT DANKE -23,45 €\nGestern\ndm-drogerie markt -8,95 €\nAmazon Rücksendung +19,99 €\n14.11.2026\nARAL Tankstelle -61,20 €`;
  const r = werteBelegAus(t, { heute: '2026-11-17', istScreenshot: true });
  assert.equal(r.typ, 'banking');
  assert.equal(r.posten.length, 4);
  assert.deepEqual(r.posten[0], { betrag: 2345, art: 'ausgabe', haendler: 'REWE', datum: '2026-11-17' });
  assert.equal(r.posten[1].datum, '2026-11-16');
  assert.equal(r.posten[2].art, 'erstattung');
  assert.equal(r.posten[3].datum, '2026-11-14');
  assert.equal(r.posten[3].betrag, 6120);
});

// PDF-Monatsbericht. berichtDaten() ist rein (getestet), erzeugePdf() zeichnet mit jsPDF.
import { euro } from './geld.js';
import { monatsName, kurzDatum, zeitstempel } from './zeit.js';
import { rhythmusName } from './rechnen.js';
import { QUELLEN, ARTEN } from './daten.js';

export function berichtDaten(md, { erstellt = Date.now() } = {}) {
  const z = md.zahlen;
  const zusammenfassung = [
    ['Einnahmen (fest)', z.festeEinnahmen],
    ['Zusatzeinnahmen', z.zusatz],
    ['Fixkosten (anteilig)', -z.fix],
    ['Sparbetrag', -z.spar],
    ['Variable Ausgaben', -z.ausgaben],
    ['Erstattungen', z.erstattungen],
  ];
  const summeKontrolle = zusammenfassung.reduce((s, [, v]) => s + v, 0);
  return {
    titel: `Haushaltsbudget ${monatsName(md.key)}`,
    zeitraumText: `Zeitraum ${kurzDatum(md.zeitraum.start)} – ${kurzDatum(md.zeitraum.ende)}`
      + (md.abgeschlossen ? ` · abgeschlossen am ${zeitstempel(md.abgeschlossenAm)}` : ' · laufender Monat'),
    erstelltText: `Erstellt am ${zeitstempel(erstellt)}`,
    zusammenfassung,
    rest: z.verfuegbar,
    summeKontrolle,
    kategorien: md.kategorien.map((k) => [k.kategorie, k.ausgaben, k.erstattungen, k.netto]),
    buchungen: [...md.buchungen].sort((a, b) => a.datum.localeCompare(b.datum) || a.erfasstAm - b.erfasstAm)
      .map((b) => ({
        datum: kurzDatum(b.datum), haendler: b.haendler || b.notiz || b.kategorie || '–', kategorie: b.art === 'zusatzeinnahme' ? '–' : b.kategorie,
        art: ARTEN[b.art], quelle: QUELLEN[b.quelle] || b.quelle,
        betrag: b.art === 'ausgabe' ? -b.betrag : b.betrag, storniert: b.status === 'storniert', bildId: b.bildId, id: b.id,
      })),
    fixkosten: [...md.stamm.fixkosten].sort((a, b) => b.anteil - a.anteil).map((f) => [f.name, f.kategorie, rhythmusName(f.rhythmus), f.betrag, f.anteil]),
    fixSumme: md.stamm.fixkosten.reduce((s, f) => s + f.anteil, 0),
    einnahmen: md.stamm.einnahmen.map((e) => [e.name, e.betrag]),
    sparbetrag: md.stamm.sparbetrag,
    protokoll: md.protokoll.map((p) => [zeitstempel(p.zeit), p.text + (p.korrektur && !/Korrektur/.test(p.text) ? ' (Korrektur)' : '')]),
  };
}

// WinAnsi-Schrift von jsPDF kennt einige Zeichen nicht.
const pdfText = (s) => String(s ?? '').replace(/−/g, '-').replace(/→/g, '->').replace(/–/g, '-').replace(/ /g, ' ')
  .replace(/[^\x00-\xff€„“”‚‘’…•–—·]/g, '?');
const pe = (c) => pdfText(euro(c));

/**
 * jsPDF: Konstruktor (window.jspdf.jsPDF); bilder: [{ titel, dataUrl, breite, hoehe }]
 * Gibt ein jsPDF-Dokument zurück.
 */
export function erzeugePdf(jsPDF, daten, { bilder = [] } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const R = 18, B = 210 - 2 * R;
  const grau = [110, 110, 110];
  let y = 20;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(pdfText(daten.titel), R, y); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...grau);
  doc.text(pdfText(daten.zeitraumText), R, y); y += 4.5;
  doc.text(pdfText(daten.erstelltText), R, y); y += 8;
  doc.setTextColor(0);

  const tabelle = (titel, kopf, zeilen, opts = {}) => {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(pdfText(titel), R, y); y += 2;
    doc.autoTable({
      startY: y + 1, margin: { left: R, right: R, bottom: 18 }, head: kopf ? [kopf.map(pdfText)] : undefined,
      body: zeilen.length ? zeilen.map((z) => z.map((c) => (c && typeof c === 'object' ? { ...c, content: pdfText(c.content) } : pdfText(c)))) : [[{ content: 'keine Einträge', colSpan: (kopf || [1]).length }]],
      theme: 'striped', styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, overflow: 'linebreak' },
      headStyles: { fillColor: [38, 104, 92], textColor: 255 }, ...opts,
    });
    y = doc.lastAutoTable.finalY + 8;
  };

  const zusammenfassung = daten.zusammenfassung.map(([l, v]) => [l, pe(v)]);
  zusammenfassung.push([{ content: 'Restbetrag', styles: { fontStyle: 'bold' } },
    { content: pe(daten.rest), styles: { fontStyle: 'bold', textColor: daten.rest < 0 ? [190, 30, 30] : [0, 0, 0] } }]);
  tabelle('Zusammenfassung', null, zusammenfassung, { columnStyles: { 1: { halign: 'right' } }, theme: 'plain',
    tableWidth: 110 });

  tabelle('Auswertung nach Kategorie', ['Kategorie', 'Ausgaben', 'Erstattungen', 'Netto'],
    daten.kategorien.map(([k, a, e, n]) => [k, pe(a), pe(e), pe(n)]),
    { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });

  tabelle('Buchungen', ['Datum', 'Händler / Notiz', 'Kategorie', 'Art', 'Quelle', 'Betrag'],
    daten.buchungen.map((b) => [b.datum, b.haendler + (b.storniert ? ' (storniert)' : ''), b.kategorie, b.art, b.quelle, pe(b.betrag)]),
    { columnStyles: { 5: { halign: 'right' } },
      didParseCell: (h) => { if (h.section === 'body' && daten.buchungen[h.row.index]?.storniert) { h.cell.styles.textColor = [150, 150, 150]; h.cell.styles.fontStyle = 'italic'; } } });

  tabelle('Fixkosten', ['Name', 'Kategorie', 'Rhythmus', 'Betrag', 'Anteil Monat'],
    [...daten.fixkosten.map(([n, k, r, b, a]) => [n, k, r, pe(b), pe(a)]),
      [{ content: 'Summe', colSpan: 4, styles: { fontStyle: 'bold' } }, { content: pe(daten.fixSumme), styles: { fontStyle: 'bold' } }]],
    { columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } } });

  tabelle('Einnahmequellen und Sparbetrag', ['Name', 'Betrag'],
    [...daten.einnahmen.map(([n, b]) => [n, pe(b)]), ['Sparbetrag (monatlich)', pe(daten.sparbetrag)]],
    { columnStyles: { 1: { halign: 'right' } }, tableWidth: 110 });

  tabelle('Änderungsprotokoll', ['Zeitpunkt', 'Änderung'], daten.protokoll, { columnStyles: { 0: { cellWidth: 34 } } });

  for (const bild of bilder) {
    doc.addPage();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(pdfText(bild.titel), R, 20);
    const maxB = B, maxH = 297 - 20 - 40;
    const f = Math.min(maxB / bild.breite, maxH / bild.hoehe);
    doc.addImage(bild.dataUrl, 'JPEG', R, 26, bild.breite * f, bild.hoehe * f);
  }

  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...grau);
    doc.text(pdfText(`${daten.titel} · Seite ${i} von ${seiten}`), 105, 289, { align: 'center' });
  }
  doc.setTextColor(0);
  return doc;
}

// Datensicherung (JSON mit/ohne Bilder), CSV-Export, Teilen über das iOS-Teilen-Menü.
import { zahl } from './geld.js';
import { kurzDatum } from './zeit.js';
import { ARTEN, QUELLEN } from './daten.js';

const blobZuDataUrl = (blob) => new Promise((ok, f) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = f; r.readAsDataURL(blob); });
async function dataUrlZuBlob(url) { return (await fetch(url)).blob(); }

export async function sicherungErstellen(daten, { mitBildern }) {
  const alles = await daten.alles({ mitBildern });
  if (mitBildern) {
    alles.bilder = await Promise.all(alles.bilder.map(async (b) => ({ ...b, blob: undefined, dataUrl: await blobZuDataUrl(b.blob) })));
  }
  const datum = new Date().toISOString().slice(0, 10);
  return new File([JSON.stringify(alles)], `Haushaltsbudget-Sicherung-${datum}${mitBildern ? '' : '-ohne-Bilder'}.json`, { type: 'application/json' });
}

export async function sicherungEinlesen(daten, datei) {
  const json = JSON.parse(await datei.text());
  if (json.bilder) {
    json.bilder = await Promise.all(json.bilder.map(async (b) => ({ ...b, blob: b.dataUrl ? await dataUrlZuBlob(b.dataUrl) : b.blob, dataUrl: undefined })));
  } else {
    delete json.bilder; // Sicherung ohne Bilder: vorhandene Bilder behalten
  }
  await daten.allesErsetzen(json);
}

const csvFeld = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function csvErstellen(daten) {
  const b = await daten.buchungen({ mitStornierten: true });
  const kopf = ['Datum', 'Budgetmonat', 'Art', 'Händler', 'Kategorie', 'Betrag', 'Notiz', 'Quelle', 'Status', 'Erfasst am'];
  const zeilen = b.sort((x, y) => x.datum.localeCompare(y.datum)).map((x) => [
    kurzDatum(x.datum), x.monat, ARTEN[x.art], x.haendler, x.art === 'zusatzeinnahme' ? '' : x.kategorie,
    zahl(x.art === 'ausgabe' ? -x.betrag : x.betrag).replace('−', '-'), x.notiz, QUELLEN[x.quelle] || x.quelle, x.status,
    new Date(x.erfasstAm).toLocaleString('de-DE'),
  ]);
  const text = '﻿' + [kopf, ...zeilen].map((z) => z.map(csvFeld).join(';')).join('\r\n');
  return new File([text], `Haushaltsbudget-Buchungen-${new Date().toISOString().slice(0, 10)}.csv`, { type: 'text/csv' });
}

/** Über das Teilen-Menü (iPhone) oder als Download ausgeben. */
export async function teilen(datei) {
  if (navigator.canShare?.({ files: [datei] })) {
    try { await navigator.share({ files: [datei], title: datei.name }); return 'geteilt'; }
    catch (e) { if (e.name === 'AbortError') return 'abgebrochen'; }
  }
  const url = URL.createObjectURL(datei);
  const a = Object.assign(document.createElement('a'), { href: url, download: datei.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'geladen';
}

export { blobZuDataUrl };

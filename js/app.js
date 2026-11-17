// Start der App: Speicher öffnen, Monatsabschluss prüfen, Seiten anzeigen.
import { K } from './kontext.js';
import { h, ICONS, alleSheetsSchliessen } from './ui.js';
import { Daten } from './daten.js';
import { IndexedDbSpeicher } from './speicher.js';
import { plusMenue } from './buchen.js';
import { startSeite, journalSeite, archivSeite, monatSeite } from './seiten.js';
import { mehrSeite, einnahmenSeite, fixkostenSeite, kategorienSeite, importSeite, sicherungSeite,
  speicherSeite, anleitungSeite, einrichtungSeite } from './einstellungen.js';

const app = document.getElementById('app');

function tabLeiste(aktiv) {
  const tab = (name, href, titel) => h('a', { href, class: aktiv === name ? 'an' : '', 'aria-label': titel },
    h('span', { html: ICONS[name], style: { display: 'contents' } }), titel);
  return h('nav', { class: 'tabs', 'aria-label': 'Hauptnavigation' },
    tab('start', '#/', 'Start'),
    tab('journal', '#/journal', 'Journal'),
    h('div', {}, h('button', { class: 'plus', 'aria-label': 'Neue Buchung', onclick: plusMenue, html: ICONS.plus })),
    tab('archiv', '#/archiv', 'Archiv'),
    tab('mehr', '#/mehr', 'Mehr'));
}

async function zeichne() {
  const [pfad, query] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(query || '');
  const teile = pfad.split('/').filter(Boolean);
  if (!K.einst.eingerichtet && teile[0] !== 'einrichtung' && !(teile[0] === 'mehr' && ['import', 'sicherung'].includes(teile[1]))) {
    location.replace('#/einrichtung'); return;
  }
  let seite, tab = 'start';
  try {
    switch (teile[0]) {
      case undefined: seite = await startSeite(); break;
      case 'journal': seite = await journalSeite(); tab = 'journal'; break;
      case 'archiv': seite = await archivSeite(); tab = 'archiv'; break;
      case 'monat': seite = await monatSeite(teile[1]); tab = 'archiv'; break;
      case 'einrichtung': seite = await einrichtungSeite(); tab = null; break;
      case 'mehr': {
        tab = 'mehr';
        const unter = { einnahmen: einnahmenSeite, fixkosten: fixkostenSeite, kategorien: kategorienSeite, import: importSeite,
          sicherung: sicherungSeite, speicher: speicherSeite, anleitung: anleitungSeite }[teile[1]];
        seite = await (unter ? unter(params) : mehrSeite());
        break;
      }
      default: seite = await startSeite();
    }
  } catch (e) {
    console.error(e);
    seite = h('div', { class: 'karte' }, h('h3', {}, 'Da ist etwas schiefgelaufen.'), h('p', { class: 'leise' }, String(e.message || e)));
  }
  const y = window.scrollY;
  const gleicheSeite = app.dataset.pfad === pfad;
  app.replaceChildren(seite);
  app.dataset.pfad = pfad;
  document.querySelector('nav.tabs')?.remove();
  if (tab !== null) document.body.append(tabLeiste(tab));
  window.scrollTo(0, gleicheSeite ? y : 0);
}

async function start() {
  const speicher = await new IndexedDbSpeicher().oeffnen();
  K.daten = new Daten(speicher);
  await K.ladeEinst();
  await K.daten.monatsabschlussPruefen();
  await K.ladeEinst();
  K.neuZeichnen = zeichne;
  window.addEventListener('hashchange', () => { alleSheetsSchliessen(); zeichne(); });
  // Monatswechsel, während die App offen bleibt (z. B. über Nacht im Hintergrund)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const geschlossen = await K.daten.monatsabschlussPruefen();
    await K.ladeEinst();
    if (geschlossen.length) zeichne();
  });
  await zeichne();
}

start().catch((e) => {
  console.error(e);
  app.replaceChildren(h('div', { class: 'karte' }, h('h3', {}, 'Die App konnte nicht starten.'),
    h('p', {}, 'Bitte Safari nicht im privaten Modus verwenden.'), h('p', { class: 'leise klein' }, String(e.message || e))));
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker', e));
}

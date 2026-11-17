// Service Worker: App-Dateien offline verfügbar machen.
// Bei jeder Änderung an der App VERSION erhöhen, damit iPhones die neue Fassung laden.
const VERSION = 'v2';
const KERN = `kern-${VERSION}`;
const BIBLIOTHEKEN = 'bibliotheken-v1'; // große Dateien (Texterkennung, PDF) – ändern sich selten

const KERN_DATEIEN = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/kontext.js', 'js/ui.js', 'js/daten.js', 'js/speicher.js', 'js/geld.js', 'js/zeit.js',
  'js/rechnen.js', 'js/buchen.js', 'js/seiten.js', 'js/einstellungen.js', 'js/bericht.js', 'js/sicherung.js',
  'js/beleg.js', 'js/belegtext.js', 'js/kontoauszug.js', 'js/kategorien-raten.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];
const BIBLIOTHEK_DATEIEN = ['vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    // cache: 'reload' – immer frisch vom Server holen, nie aus dem HTTP-Zwischenspeicher
    const frisch = (liste) => liste.map((u) => new Request(u, { cache: 'reload' }));
    await (await caches.open(KERN)).addAll(frisch(KERN_DATEIEN));
    await (await caches.open(BIBLIOTHEKEN)).addAll(frisch(BIBLIOTHEK_DATEIEN));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== KERN && k !== BIBLIOTHEKEN) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const istBibliothek = url.pathname.includes('/vendor/');
  e.respondWith((async () => {
    const treffer = await caches.match(e.request, { ignoreSearch: true });
    if (treffer) return treffer;
    try {
      const antwort = await fetch(e.request);
      // Texterkennungs-Dateien beim ersten Gebrauch zwischenspeichern
      if (antwort.ok && istBibliothek) (await caches.open(BIBLIOTHEKEN)).put(e.request, antwort.clone());
      return antwort;
    } catch (err) {
      if (e.request.mode === 'navigate') return caches.match('index.html');
      throw err;
    }
  })());
});

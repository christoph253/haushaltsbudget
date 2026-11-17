// Einstellungen, Stammdaten, Kontoauszug-Import, Datensicherung, Einrichtung.
import { K } from './kontext.js';
import { h, ersetze, sheet, bestaetigen, toast, betragsFeld, auswahl, feld } from './ui.js';
import { euro, parseEuro, zahl } from './geld.js';
import { kurzDatum, monatsName } from './zeit.js';
import { anteil, RHYTHMEN, rhythmusName } from './rechnen.js';
import { dekodiere, leseUmsaetze, erkenneWiederkehrende } from './kontoauszug.js';
import { sicherungErstellen, sicherungEinlesen, csvErstellen } from './sicherung.js';
import { pdfErstellen, teilenAnsicht } from './seiten.js';

const MONATSNAMEN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const linkZeile = (titel, href, rechts = '') => h('a', { class: 'zeile pfeil', href, style: { textDecoration: 'none', color: 'inherit' } },
  h('div', { class: 'mitte' }, titel), h('div', { class: 'rechts leise' }, rechts));
const zurueck = (href = '#/mehr', text = 'Einstellungen') => h('a', { class: 'zurueck', href }, `‹ ${text}`);

async function neuLaden() { await K.ladeEinst(); K.neuZeichnen(); }

// ---------------- Übersicht ----------------
export async function mehrSeite() {
  const D = K.daten, e = K.einst;
  const ein = await D.liste('einnahmen');
  const fix = await D.liste('fixkosten');
  const monat = await D.aktuellerMonat();
  return h('div', {},
    h('h1', {}, 'Einstellungen'),
    h('h2', {}, 'Budget'),
    h('div', { class: 'liste' },
      linkZeile('Einnahmen', '#/mehr/einnahmen', euro(ein.filter((x) => x.aktiv).reduce((s, x) => s + x.betrag, 0))),
      linkZeile('Fixkosten', '#/mehr/fixkosten', euro(fix.filter((x) => x.aktiv).reduce((s, x) => s + anteil(x.betrag, x.rhythmus, monat), 0))),
      h('button', { class: 'zeile pfeil', onclick: sparbetragDialog }, h('div', { class: 'mitte' }, 'Sparbetrag'), h('div', { class: 'rechts leise' }, euro(e.sparbetrag))),
      linkZeile('Kontoauszüge auswerten', '#/mehr/import')),
    h('h2', {}, 'Einstellungen'),
    h('div', { class: 'liste' },
      linkZeile('Kategorien', '#/mehr/kategorien'),
      h('button', { class: 'zeile pfeil', onclick: starttagDialog }, h('div', { class: 'mitte' }, 'Beginn des Budgetmonats'),
        h('div', { class: 'rechts leise' }, e.startTag === 1 ? 'am 1.' : `am ${e.startTag}.`)),
      h('button', { class: 'zeile pfeil', onclick: schwellenDialog }, h('div', { class: 'mitte' }, 'Warnungen'),
        h('div', { class: 'rechts leise' }, e.schwellen.map((s) => `${s} %`).join(' / ')))),
    h('h2', {}, 'Daten'),
    h('div', { class: 'liste' },
      linkZeile('Datensicherung & Export', '#/mehr/sicherung', e.letzteSicherung ? `zuletzt ${kurzDatum(new Date(e.letzteSicherung).toISOString().slice(0, 10))}` : 'noch nie'),
      linkZeile('Speicherplatz', '#/mehr/speicher'),
      linkZeile('Kurzanleitung', '#/mehr/anleitung'),
      h('button', { class: 'zeile', onclick: allesLoeschen }, h('div', { class: 'mitte rot' }, 'Alle Daten löschen'))),
    h('p', { class: 'leise klein', style: { textAlign: 'center', marginTop: '20px' } }, 'Alle Daten liegen nur auf diesem iPhone.'));
}

function sparbetragDialog() {
  const inp = betragsFeld(zahl(K.einst.sparbetrag));
  sheet('Sparbetrag', (zu) => h('div', {},
    h('p', { class: 'leise klein' }, 'Wird jeden Monat wie ein Fixposten abgezogen, bevor das verfügbare Budget berechnet wird.'),
    feld('Monatlicher Sparbetrag', inp),
    h('button', { class: 'knopf', onclick: async () => {
      const v = parseEuro(inp.value || '0');
      if (v == null || v < 0) { toast('Bitte einen gültigen Betrag eingeben.'); return; }
      await K.daten.setzeEinstellungen({ sparbetrag: v }); zu(); toast('Sparbetrag gespeichert'); neuLaden();
    } }, 'Speichern')));
}

function starttagDialog() {
  let tag = K.einst.startTag;
  sheet('Beginn des Budgetmonats', (zu) => h('div', {},
    h('p', { class: 'leise klein' }, 'Standard ist der 1. eines Monats. Kommt dein Gehalt z. B. am 25., beginnt der Budgetmonat am 25. Er heißt dann nach dem Monat, in dem er endet (25.10.–24.11. = „November“). Abgeschlossene Monate bleiben unverändert.'),
    feld('Budgetmonat beginnt am', auswahl(Array.from({ length: 28 }, (_, i) => [i + 1, `${i + 1}. des Monats`]), tag, { onchange: (ev) => { tag = Number(ev.target.value); } })),
    h('button', { class: 'knopf', onclick: async () => { await K.daten.setzeEinstellungen({ startTag: tag }); await K.daten.monatsabschlussPruefen(); zu(); toast('Gespeichert'); neuLaden(); } }, 'Speichern')));
}

function schwellenDialog() {
  const [a, b] = K.einst.schwellen;
  const i1 = h('input', { class: 'eingabe', inputmode: 'numeric', value: a });
  const i2 = h('input', { class: 'eingabe', inputmode: 'numeric', value: b });
  sheet('Warnungen', (zu) => h('div', {},
    h('p', { class: 'leise klein' }, 'Bei diesen Anteilen des variablen Monatsbudgets erscheint ein Hinweis auf der Startseite.'),
    h('div', { class: 'filter' }, feld('Erste Warnung (%)', i1), feld('Zweite Warnung (%)', i2)),
    h('button', { class: 'knopf', onclick: async () => {
      const s = [Number(i1.value), Number(i2.value)].filter((x) => x > 0 && x <= 200).sort((x, y) => x - y);
      if (!s.length) { toast('Bitte Zahlen zwischen 1 und 200 eingeben.'); return; }
      await K.daten.setzeEinstellungen({ schwellen: s }, { protokoll: false }); zu(); neuLaden();
    } }, 'Speichern')));
}

async function allesLoeschen() {
  if (!(await bestaetigen('Alle Daten löschen?', 'Alle Buchungen, Belege, Einnahmen, Fixkosten und das Archiv werden von diesem iPhone gelöscht. Das lässt sich nicht rückgängig machen – nur über eine vorher erstellte Sicherung.', { ja: 'Weiter', gefahr: true }))) return;
  if (!(await bestaetigen('Wirklich endgültig löschen?', 'Letzte Rückfrage: Hast du eine Sicherung?', { ja: 'Endgültig löschen', gefahr: true }))) return;
  await K.daten.allesLoeschen();
  location.hash = '#/';
  location.reload();
}

// ---------------- Einnahmen ----------------
export async function einnahmenSeite() {
  const l = (await K.daten.liste('einnahmen')).sort((a, b) => b.betrag - a.betrag);
  const summe = l.filter((x) => x.aktiv).reduce((s, x) => s + x.betrag, 0);
  return h('div', {}, zurueck(), h('h1', {}, 'Einnahmen'),
    h('p', { class: 'leise klein' }, 'Feste monatliche Einnahmen. Einmalige Zusatzeinnahmen erfasst du über den Plus-Knopf.'),
    h('div', { class: 'liste' }, l.length ? l.map((x) => h('button', { class: `zeile ${x.aktiv ? '' : 'pausiert'}`, onclick: () => stammDialog('einnahmen', x) },
      h('div', { class: 'mitte' }, h('div', { class: 'titel' }, x.name), x.aktiv ? null : h('div', { class: 'unter' }, 'pausiert')),
      h('div', { class: 'rechts' }, euro(x.betrag)))) : h('div', { class: 'leer' }, 'Noch keine Einnahmen.'),
      h('div', { class: 'zeile' }, h('div', { class: 'mitte' }, h('strong', {}, 'Summe pro Monat')), h('div', { class: 'rechts' }, h('strong', {}, euro(summe))))),
    h('button', { class: 'knopf', onclick: () => stammDialog('einnahmen') }, 'Einnahme hinzufügen'));
}

// ---------------- Fixkosten ----------------
export async function fixkostenSeite() {
  const l = await K.daten.liste('fixkosten');
  const monat = await K.daten.aktuellerMonat();
  const aktiv = l.filter((x) => x.aktiv);
  const summe = aktiv.reduce((s, x) => s + anteil(x.betrag, x.rhythmus, monat), 0);
  const nachRhythmus = RHYTHMEN.map((r) => [r, l.filter((x) => x.rhythmus === r.monate).sort((a, b) => b.betrag - a.betrag)]).filter(([, xs]) => xs.length);
  return h('div', {}, zurueck(), h('h1', {}, 'Fixkosten'),
    h('p', { class: 'leise klein' }, 'Vierteljährliche, halbjährliche und jährliche Posten werden anteilig auf jeden Monat verteilt.'),
    h('div', { class: 'karte' }, h('div', { class: 'kopfzeile' }, h('span', {}, 'Summe pro Monat (anteilig)'), h('strong', { class: 'zahl', style: { whiteSpace: 'nowrap' } }, euro(summe)))),
    nachRhythmus.length ? nachRhythmus.map(([r, xs]) => [h('h2', {}, r.name),
      h('div', { class: 'liste' }, xs.map((x) => h('button', { class: `zeile ${x.aktiv ? '' : 'pausiert'}`, onclick: () => stammDialog('fixkosten', x) },
        h('div', { class: 'mitte' }, h('div', { class: 'titel' }, x.name),
          h('div', { class: 'unter' }, [x.kategorie, x.rhythmus > 1 ? `${euro(x.betrag)}${x.faelligMonat ? ` im ${MONATSNAMEN[x.faelligMonat - 1]}` : ''}` : null, x.aktiv ? null : 'pausiert'].filter(Boolean).join(' · '))),
        h('div', { class: 'rechts' }, euro(anteil(x.betrag, x.rhythmus, monat)), x.rhythmus > 1 ? h('div', { class: 'unter' }, 'pro Monat') : null))))])
      : h('div', { class: 'liste' }, h('div', { class: 'leer' }, 'Noch keine Fixkosten.')),
    h('div', { style: { display: 'grid', gap: '10px', marginTop: '12px' } },
      h('button', { class: 'knopf', onclick: () => stammDialog('fixkosten') }, 'Fixkosten hinzufügen'),
      h('a', { class: 'knopf zweit', href: '#/mehr/import' }, 'Aus Kontoauszügen erkennen')));
}

/** Anlegen/Bearbeiten einer Einnahme oder Fixkosten-Position. */
export function stammDialog(store, obj = null, { nachher } = {}) {
  const fix = store === 'fixkosten';
  const z = { name: '', betrag: '', kategorie: K.einst.fixKategorien[0], rhythmus: 1, aktiv: true, faelligMonat: null, ...(obj || {}) };
  const name = h('input', { class: 'eingabe', value: z.name, placeholder: fix ? 'z. B. Miete' : 'z. B. Gehalt' });
  const betrag = betragsFeld(obj ? zahl(z.betrag) : '');
  const s = sheet(obj ? (fix ? 'Fixkosten bearbeiten' : 'Einnahme bearbeiten') : (fix ? 'Neue Fixkosten' : 'Neue Einnahme'), () => aufbau());
  const anteilText = h('p', { class: 'leise klein' });
  const aktualisiere = () => {
    const b = parseEuro(betrag.value);
    anteilText.textContent = fix && z.rhythmus > 1 && b ? `Entspricht ca. ${euro(Math.round(b / z.rhythmus))} pro Monat.` : '';
  };
  betrag.addEventListener('input', aktualisiere);
  function aufbau() {
    aktualisiere();
    return h('div', {},
      feld('Name', name),
      feld(fix ? 'Betrag pro Fälligkeit' : 'Betrag pro Monat', betrag),
      fix ? [
        feld('Rhythmus', auswahl(RHYTHMEN.map((r) => [r.monate, r.name]), z.rhythmus, { onchange: (ev) => { z.rhythmus = Number(ev.target.value); s.setze(aufbau()); } })),
        anteilText,
        z.rhythmus > 1 ? feld('Fällig im Monat (zur Info)', auswahl([['', '–'], ...MONATSNAMEN.map((m, i) => [i + 1, m])], z.faelligMonat ?? '', { onchange: (ev) => { z.faelligMonat = ev.target.value ? Number(ev.target.value) : null; } })) : null,
        feld('Kategorie', auswahl(K.einst.fixKategorien, z.kategorie, { onchange: (ev) => { z.kategorie = ev.target.value; } })),
      ] : null,
      obj ? h('label', { class: 'schalter' }, h('span', {}, 'Pausiert'), h('input', { type: 'checkbox', checked: !z.aktiv, onchange: (ev) => { z.aktiv = !ev.target.checked; } })) : null,
      h('button', { class: 'knopf', style: { marginTop: '8px' }, onclick: async () => {
        const b = parseEuro(betrag.value);
        if (!name.value.trim()) { toast('Bitte einen Namen eingeben.'); return; }
        if (b == null || b <= 0) { toast('Bitte einen Betrag eingeben.'); return; }
        const daten = { name: name.value.trim(), betrag: b, aktiv: z.aktiv };
        if (fix) Object.assign(daten, { kategorie: z.kategorie, rhythmus: z.rhythmus, faelligMonat: z.rhythmus > 1 ? z.faelligMonat : null });
        await K.daten.speichereStamm(store, obj ? { id: obj.id, ...daten } : daten);
        s.schliessen(); toast('Gespeichert'); nachher ? nachher() : neuLaden();
      } }, 'Speichern'),
      obj ? h('button', { class: 'knopf gefahr', style: { marginTop: '10px' }, onclick: async () => {
        if (!(await bestaetigen('Löschen?', `„${obj.name}“ wird ab sofort nicht mehr berücksichtigt. Abgeschlossene Monate bleiben unverändert, die Löschung wird protokolliert.`, { ja: 'Löschen', gefahr: true }))) return;
        await K.daten.loescheStamm(store, obj.id); s.schliessen(); toast('Gelöscht'); nachher ? nachher() : neuLaden();
      } }, 'Löschen') : null);
  }
  s.setze(aufbau());
  if (!obj) setTimeout(() => name.focus(), 300);
}

// ---------------- Kategorien ----------------
export async function kategorienSeite() {
  const e = K.einst;
  const block = (titel, feldName) => {
    const neu = h('input', { class: 'eingabe', placeholder: 'Neue Kategorie' });
    return [h('h2', {}, titel), h('div', { class: 'liste' }, e[feldName].map((k) => h('div', { class: 'zeile' },
      h('div', { class: 'mitte' }, k),
      k === 'Sonstiges' ? null : h('button', { class: 'textknopf', style: { color: 'var(--rot)' }, onclick: async () => {
        if (!(await bestaetigen('Kategorie entfernen?', `„${k}“ wird aus der Auswahl entfernt. Vorhandene Buchungen behalten ihre Kategorie.`, { ja: 'Entfernen', gefahr: true }))) return;
        await K.daten.setzeEinstellungen({ [feldName]: e[feldName].filter((x) => x !== k) }, { protokoll: false }); neuLaden();
      } }, 'Entfernen')))),
    h('div', { class: 'knopfreihe', style: { marginBottom: '8px' } }, neu, h('button', { class: 'knopf', style: { flex: '0 0 auto', width: 'auto' }, onclick: async () => {
      const n = neu.value.trim();
      if (!n || e[feldName].includes(n)) return;
      const liste = [...e[feldName]];
      liste.splice(Math.max(0, liste.indexOf('Sonstiges')), 0, n);
      await K.daten.setzeEinstellungen({ [feldName]: liste }, { protokoll: false }); neuLaden();
    } }, 'Hinzufügen'))];
  };
  return h('div', {}, zurueck(), h('h1', {}, 'Kategorien'),
    block('Für Ausgaben', 'kategorien'), block('Für Fixkosten', 'fixKategorien'));
}

// ---------------- Kontoauszug-Import ----------------
let importStand = null;

export async function importSeite(params) {
  const vonEinrichtung = params.get('von') === 'einrichtung';
  const inhalt = h('div');
  const datei = h('input', { type: 'file', accept: '.csv,text/csv,text/comma-separated-values,application/vnd.ms-excel', multiple: true, class: 'eingabe' });
  datei.addEventListener('change', async () => {
    try {
      let umsaetze = [];
      for (const f of datei.files) umsaetze = umsaetze.concat(leseUmsaetze(dekodiere(new Uint8Array(await f.arrayBuffer()))));
      // doppelte Zeilen (überlappende Exporte) entfernen
      const gesehen = new Set();
      umsaetze = umsaetze.filter((u) => { const k = `${u.datum}|${u.betrag}|${u.name}|${u.zweck}`; if (gesehen.has(k)) return false; gesehen.add(k); return true; });
      const vorhandene = [...(await K.daten.liste('fixkosten')), ...(await K.daten.liste('einnahmen'))].map((x) => x.name);
      importStand = erkenneWiederkehrende(umsaetze, { fixKategorien: K.einst.fixKategorien, vorhandeneNamen: vorhandene });
      importStand.vorschlaege.forEach((v) => { v.gewaehlt = v.sicher && !v.schonVorhanden; });
      zeichne();
    } catch (e) { toast(e.message || 'Die Datei konnte nicht gelesen werden.', { dauer: 7000 }); }
  });

  function vorschlagKarte(v) {
    const name = h('input', { class: 'eingabe', value: v.name, oninput: (ev) => { v.name = ev.target.value; } });
    const betrag = betragsFeld(zahl(v.betrag), { oninput: (ev) => { const b = parseEuro(ev.target.value); if (b) v.betrag = b; } });
    return h('div', { class: 'karte' },
      h('label', { class: 'auswahl-posten', style: { marginBottom: '10px' } },
        h('input', { type: 'checkbox', checked: v.gewaehlt, onchange: (ev) => { v.gewaehlt = ev.target.checked; zaehler(); } }),
        h('div', { class: 'mitte' },
          h('strong', {}, `${euro(v.betrag)} · ${rhythmusName(v.rhythmus)}`),
          h('div', { class: 'leise klein' }, v.nurEinmalGesehen ? `nur einmal gesehen (${kurzDatum(v.termine[0])}) – vermutlich jährlich`
            : `${v.anzahl}× gesehen, zuletzt ${kurzDatum(v.termine.at(-1))}`),
          h('div', {}, v.schwankend ? h('span', { class: 'markierung gelb' }, 'Betrag schwankt') : null, ' ',
            v.schonVorhanden ? h('span', { class: 'markierung' }, 'schon vorhanden') : null, ' ',
            !v.sicher && !v.nurEinmalGesehen ? h('span', { class: 'markierung gelb' }, 'bitte prüfen') : null))),
      v.zweck ? h('p', { class: 'leise klein' }, v.zweck) : null,
      feld('Name', name),
      h('div', { class: 'filter' },
        feld(v.typ === 'einnahme' ? 'Betrag pro Monat' : 'Betrag', betrag),
        v.typ === 'fixkosten' ? feld('Rhythmus', auswahl(RHYTHMEN.map((r) => [r.monate, r.name]), v.rhythmus, { onchange: (ev) => { v.rhythmus = Number(ev.target.value); } })) : h('div')),
      v.typ === 'fixkosten' ? feld('Kategorie', auswahl(K.einst.fixKategorien, v.kategorie, { onchange: (ev) => { v.kategorie = ev.target.value; } })) : null,
      v.typ === 'fixkosten' && v.rhythmus > 1 ? h('p', { class: 'leise klein' }, `Anteilig ca. ${euro(Math.round(v.betrag / v.rhythmus))} pro Monat.`) : null);
  }

  const uebernehmen = h('button', { class: 'knopf' });
  function zaehler() {
    const n = importStand?.vorschlaege.filter((v) => v.gewaehlt).length || 0;
    uebernehmen.textContent = `${n} ${n === 1 ? 'Position' : 'Positionen'} übernehmen`;
    uebernehmen.disabled = !n;
  }
  uebernehmen.addEventListener('click', async () => {
    const gew = importStand.vorschlaege.filter((v) => v.gewaehlt);
    for (const v of gew) {
      if (v.typ === 'einnahme') await K.daten.speichereStamm('einnahmen', { name: v.name, betrag: v.betrag });
      else await K.daten.speichereStamm('fixkosten', { name: v.name, betrag: v.betrag, rhythmus: v.rhythmus, kategorie: v.kategorie, faelligMonat: v.faelligMonat });
    }
    toast(`${gew.length} Positionen übernommen`);
    importStand = null;
    await K.ladeEinst();
    location.hash = vonEinrichtung ? '#/einrichtung' : '#/mehr/fixkosten';
  });

  function zeichne() {
    if (!importStand) {
      ersetze(inhalt, 
        h('div', { class: 'karte' },
          h('h3', {}, 'So bekommst du die Datei (Sparkasse)'),
          h('ol', { class: 'klein', style: { paddingLeft: '20px', margin: '6px 0' } },
            h('li', {}, 'Am Computer im Online-Banking der Sparkasse anmelden.'),
            h('li', {}, 'Konto öffnen → „Umsätze“ → Zeitraum: die letzten 13 Monate.'),
            h('li', {}, 'Exportieren → Format „CSV-CAMT V2“ (oder „CSV-MT940“).'),
            h('li', {}, 'Datei aufs iPhone schicken (z. B. per AirDrop) und hier auswählen.')),
          h('p', { class: 'leise klein' }, 'Für jährliche Zahlungen braucht es mindestens 12 Monate. Mehrere Dateien gleichzeitig sind möglich. Die Datei wird nur auf dem iPhone ausgewertet und nicht gespeichert.')),
        feld('CSV-Datei(en) auswählen', datei));
      return;
    }
    const st = importStand;
    const ein = st.vorschlaege.filter((v) => v.typ === 'einnahme');
    const fix = st.vorschlaege.filter((v) => v.typ === 'fixkosten');
    zaehler();
    ersetze(inhalt, 
      h('div', { class: `hinweis ${st.monate < 12 ? 'gelb' : 'gruen'}` }, h('div', { class: 't' },
        `${st.anzahl} Umsätze vom ${kurzDatum(st.von)} bis ${kurzDatum(st.bis)} (ca. ${st.monate} Monate).`,
        st.monate < 12 ? h('div', { class: 'klein' }, 'Weniger als 12 Monate – jährliche Zahlungen werden evtl. nicht sicher erkannt.') : null)),
      st.vorschlaege.length ? null : h('div', { class: 'karte leer' }, 'Keine regelmäßigen Zahlungen gefunden.'),
      ein.length ? [h('h2', {}, 'Regelmäßige Einnahmen'), ein.map(vorschlagKarte)] : null,
      fix.length ? [h('h2', {}, 'Regelmäßige Ausgaben (Fixkosten)'), fix.map(vorschlagKarte)] : null,
      h('div', { style: { position: 'sticky', bottom: 'calc(var(--tab-h) + env(safe-area-inset-bottom) + 8px)', display: 'grid', gap: '8px' } }, uebernehmen),
      h('button', { class: 'textknopf', onclick: () => { importStand = null; zeichne(); } }, 'Andere Datei wählen'));
  }
  zeichne();
  return h('div', {}, vonEinrichtung ? zurueck('#/einrichtung', 'Einrichtung') : zurueck(), h('h1', {}, 'Kontoauszüge auswerten'),
    h('p', { class: 'leise klein' }, 'Die App sucht in deinen Kontoumsätzen nach regelmäßigen Zahlungen – monatlich, vierteljährlich, halbjährlich und jährlich – und schlägt sie als Fixkosten oder Einnahmen vor.'),
    inhalt);
}

// ---------------- Sicherung ----------------
export async function sicherungSeite(params) {
  const monat = params.get('monat');
  const vermerken = async () => { await K.daten.setzeEinstellungen({ letzteSicherung: Date.now() }, { protokoll: false }); await K.ladeEinst(); toast('Sicherung vermerkt'); };
  const aktion = (titel, erzeugen, { vermerk = true } = {}) => h('button', { class: 'knopf zweit', style: { marginBottom: '10px' }, onclick: async (ev) => {
    const alt = ev.target.textContent; ev.target.disabled = true; ev.target.textContent = 'Wird erstellt …';
    try {
      const datei = await erzeugen();
      const s = sheet(titel, () => teilenAnsicht(datei, 'Die Datei ist fertig. Tipp auf „Teilen“ und wähle „In Dateien sichern“ – am besten in iCloud Drive.',
        async () => { s.schliessen(); if (vermerk) await vermerken(); }));
    } catch (e) { console.error(e); toast('Das hat nicht geklappt.'); }
    ev.target.disabled = false; ev.target.textContent = alt;
  } }, titel);
  const einlesen = h('input', { type: 'file', accept: '.json,application/json', class: 'eingabe' });
  einlesen.addEventListener('change', async () => {
    const f = einlesen.files[0]; if (!f) return;
    if (!(await bestaetigen('Sicherung einspielen?', 'Alle Daten auf diesem iPhone werden durch die Sicherung ersetzt.', { ja: 'Einspielen', gefahr: true }))) { einlesen.value = ''; return; }
    try { await sicherungEinlesen(K.daten, f); toast('Sicherung eingespielt'); setTimeout(() => { location.hash = '#/'; location.reload(); }, 800); }
    catch (e) { toast(e.message || 'Die Datei konnte nicht eingelesen werden.'); }
  });
  return h('div', {}, params.get('von') === 'einrichtung' ? zurueck('#/einrichtung', 'Einrichtung') : zurueck(), h('h1', {}, 'Datensicherung'),
    h('p', { class: 'leise klein' }, 'Deine Daten liegen nur auf diesem iPhone. Sichere sie einmal im Monat in „Dateien“ (iCloud Drive) – dann sind sie auch bei Verlust des iPhones nicht weg.'),
    monat ? [h('h2', {}, `Abschluss ${monatsName(monat)}`), aktion(`PDF-Bericht ${monatsName(monat)}`, () => pdfErstellen(monat, { mitBildern: true }), { vermerk: false })] : null,
    h('h2', {}, 'Sichern'),
    aktion('Vollständige Sicherung (mit Belegbildern)', () => sicherungErstellen(K.daten, { mitBildern: true })),
    aktion('Sicherung ohne Belegbilder (kleiner)', () => sicherungErstellen(K.daten, { mitBildern: false })),
    aktion('Buchungen als CSV (für Excel/Numbers)', () => csvErstellen(K.daten), { vermerk: false }),
    h('h2', {}, 'Wiederherstellen'),
    feld('Sicherungsdatei (.json) auswählen', einlesen));
}

// ---------------- Speicherplatz ----------------
export async function speicherSeite() {
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const persist = await navigator.storage?.persisted?.().catch(() => false);
  const bilder = await K.daten.s.alle('bilder');
  const buchungen = await K.daten.s.alle('buchungen');
  const mb = (b) => `${(b / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
  const zeile = (l, w) => h('div', { class: 'zeile' }, h('div', { class: 'mitte' }, l), h('div', { class: 'rechts' }, w));
  return h('div', {}, zurueck(), h('h1', {}, 'Speicherplatz'),
    h('div', { class: 'liste' },
      zeile('Belegbilder', `${bilder.length} · ${mb(bilder.reduce((s, b) => s + (b.groesse || b.blob?.size || 0), 0))}`),
      zeile('Buchungen', String(buchungen.length)),
      est ? zeile('Belegt insgesamt', mb(est.usage || 0)) : null,
      zeile('Dauerhaft gespeichert', persist ? 'ja' : 'nicht bestätigt')),
    persist ? null : h('p', { class: 'leise klein' }, 'Tipp: Die App über „Zum Home-Bildschirm“ installieren. Dann löscht Safari die Daten nicht automatisch. Trotzdem regelmäßig sichern.'));
}

// ---------------- Anleitung ----------------
export function anleitungSeite() {
  const p = (t) => h('p', {}, t);
  return h('div', {}, zurueck(), h('h1', {}, 'Kurzanleitung'),
    h('div', { class: 'karte' }, h('h3', {}, 'Was heißt „Noch verfügbar“?'),
      p('Einnahmen − Fixkosten (anteilig) − Sparbetrag − variable Ausgaben + Erstattungen. Jeder Monat startet neu, ohne Übertrag.')),
    h('div', { class: 'karte' }, h('h3', {}, 'Ausgabe in drei Tipps'),
      p('„Ausgabe“ antippen, Betrag eintippen, Kategorie antippen – fertig. Für Datum, Händler, Notiz oder ein Foto auf „Datum, Händler, Notiz, Foto …“ tippen.')),
    h('div', { class: 'karte' }, h('h3', {}, 'Beleg erfassen'),
      p('Foto vom Kassenbon oder Screenshot (Bestellbestätigung, Banking-App) wählen. Die App liest den Text direkt auf dem iPhone – kostenlos und ohne Internet. Bitte die Werte vor dem Übernehmen immer kurz prüfen.')),
    h('div', { class: 'karte' }, h('h3', {}, 'Monatsabschluss'),
      p('Beim ersten Öffnen im neuen Monat wird der alte Monat automatisch abgeschlossen und ins Archiv gelegt. Danach ist er schreibgeschützt; Änderungen gehen nur als Korrektur und werden protokolliert.')),
    h('div', { class: 'karte' }, h('h3', {}, 'Sicherung'),
      p('Einmal im Monat unter Einstellungen → Datensicherung eine Sicherung in „Dateien“ ablegen. Die App erinnert dich nach jedem Monatsabschluss.')));
}

// ---------------- Einrichtung ----------------
const merke = (n) => { try { sessionStorage.setItem('einrichtungSchritt', String(n)); } catch {} };
let schritt = (() => { try { return Number(sessionStorage.getItem('einrichtungSchritt')) || 0; } catch { return 0; } })();
export async function einrichtungSeite() {
  const D = K.daten, e = K.einst;
  const punkte = h('div', { class: 'wizard-punkte' }, [0, 1, 2, 3, 4].map((i) => h('i', { class: i <= schritt ? 'an' : '' })));
  const weiter = (n = schritt + 1) => { schritt = n; merke(n); K.neuZeichnen(); window.scrollTo(0, 0); };
  const knoepfe = (weiterText = 'Weiter', aktion = () => weiter()) => h('div', { class: 'knopfreihe', style: { marginTop: '16px' } },
    schritt > 0 ? h('button', { class: 'knopf grau', onclick: () => weiter(schritt - 1) }, 'Zurück') : null,
    h('button', { class: 'knopf', onclick: aktion }, weiterText));
  const ein = await D.liste('einnahmen');
  const fix = await D.liste('fixkosten');
  const monat = await D.aktuellerMonat();
  const nachher = () => K.neuZeichnen();

  let inhalt;
  if (schritt === 0) {
    let tag = e.startTag;
    inhalt = [h('h1', {}, 'Willkommen!'),
      h('div', { class: 'karte' }, p2('Diese App zeigt dir jederzeit, wie viel Geld dir im laufenden Monat noch bleibt.'),
        p2('Alles bleibt nur auf diesem iPhone – kein Konto, kein Server, keine Kosten.'),
        p2('Die Einrichtung dauert etwa 5 Minuten: Einnahmen, Fixkosten und Sparbetrag.')),
      feld('Wann beginnt dein Budgetmonat?', auswahl([[1, 'Am 1. des Monats (Standard)'], ...Array.from({ length: 27 }, (_, i) => [i + 2, `Am ${i + 2}. (z. B. Tag des Gehaltseingangs)`])], tag,
        { onchange: (ev) => { tag = Number(ev.target.value); } })),
      knoepfe('Los geht’s', async () => { await D.setzeEinstellungen({ startTag: tag }, { protokoll: false }); await K.ladeEinst(); weiter(); }),
      h('a', { class: 'knopf grau', href: '#/mehr/sicherung?von=einrichtung', style: { marginTop: '10px' } }, 'Einrichtungs- oder Sicherungsdatei einspielen')];
  } else if (schritt === 1) {
    inhalt = [h('h1', {}, 'Einnahmen'), p2('Trage deine festen monatlichen Einnahmen ein, z. B. Gehalt, Kindergeld, Unterhalt.'),
      h('div', { class: 'liste' }, ein.length ? ein.map((x) => h('button', { class: 'zeile', onclick: () => stammDialog('einnahmen', x, { nachher }) },
        h('div', { class: 'mitte' }, x.name), h('div', { class: 'rechts' }, euro(x.betrag)))) : h('div', { class: 'leer' }, 'Noch keine Einnahmen')),
      h('div', { style: { display: 'grid', gap: '10px' } },
        h('button', { class: 'knopf zweit', onclick: () => stammDialog('einnahmen', null, { nachher }) }, 'Einnahme hinzufügen'),
        h('a', { class: 'knopf zweit', href: '#/mehr/import?von=einrichtung' }, 'Aus Kontoauszügen erkennen')),
      knoepfe()];
  } else if (schritt === 2) {
    inhalt = [h('h1', {}, 'Fixkosten'), p2('Miete, Strom, Versicherungen, Handy, Abos … Jährliche Zahlungen werden automatisch auf 12 Monate verteilt.'),
      h('div', { class: 'liste' }, fix.length ? fix.map((x) => h('button', { class: 'zeile', onclick: () => stammDialog('fixkosten', x, { nachher }) },
        h('div', { class: 'mitte' }, h('div', { class: 'titel' }, x.name), h('div', { class: 'unter' }, `${x.kategorie} · ${rhythmusName(x.rhythmus)}`)),
        h('div', { class: 'rechts' }, euro(anteil(x.betrag, x.rhythmus, monat))))) : h('div', { class: 'leer' }, 'Noch keine Fixkosten')),
      h('div', { style: { display: 'grid', gap: '10px' } },
        h('a', { class: 'knopf', href: '#/mehr/import?von=einrichtung' }, 'Aus Kontoauszügen erkennen (empfohlen)'),
        h('button', { class: 'knopf zweit', onclick: () => stammDialog('fixkosten', null, { nachher }) }, 'Von Hand hinzufügen')),
      knoepfe()];
  } else if (schritt === 3) {
    const inp = betragsFeld(e.sparbetrag ? zahl(e.sparbetrag) : '');
    inhalt = [h('h1', {}, 'Sparbetrag'), p2('Wie viel möchtest du jeden Monat zur Seite legen? Der Betrag wird abgezogen, bevor dein verfügbares Budget berechnet wird. Du kannst ihn jederzeit ändern.'),
      feld('Sparbetrag pro Monat', inp),
      knoepfe('Weiter', async () => {
        const v = parseEuro(inp.value || '0');
        if (v == null || v < 0) { toast('Bitte einen gültigen Betrag eingeben.'); return; }
        await D.setzeEinstellungen({ sparbetrag: v }); await K.ladeEinst(); weiter();
      })];
  } else {
    const z = (await D.monatsDaten()).zahlen;
    inhalt = [h('h1', {}, 'Fertig!'),
      h('div', { class: 'karte held' }, h('div', { class: 'label' }, `Dein Budget für ${monatsName(monat)}`), h('div', { class: 'betrag zahl' }, euro(z.verfuegbar)),
        h('div', { class: 'leise klein' }, `${euro(z.einnahmen)} Einnahmen − ${euro(z.fix)} Fixkosten − ${euro(z.spar)} Sparbetrag`)),
      h('div', { class: 'karte' }, p2('Wichtig: Deine Daten liegen nur auf diesem iPhone. Die App erinnert dich jeden Monat an eine Sicherung.'),
        p2('Tipp: Über das Teilen-Symbol in Safari → „Zum Home-Bildschirm“ wird die App wie eine normale App installiert.')),
      knoepfe('Zur Startseite', async () => {
        await D.setzeEinstellungen({ eingerichtet: true }, { protokoll: false });
        await navigator.storage?.persist?.().catch(() => {});
        await K.ladeEinst(); schritt = 0; merke(0); location.hash = '#/';
      })];
  }
  return h('div', {}, punkte, inhalt);
}
const p2 = (t) => h('p', {}, t);

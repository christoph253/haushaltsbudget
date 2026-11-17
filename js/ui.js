// Kleine Oberflächen-Helfer ohne Framework.

export function h(tag, attrs = {}, ...kinder) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kind of kinder.flat(Infinity)) {
    if (kind == null || kind === false) continue;
    el.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
  return el;
}

/** Wie replaceChildren, aber mit verschachtelten Listen und null-Werten. */
export function ersetze(el, ...kinder) {
  el.replaceChildren(...kinder.flat(Infinity).filter((k) => k != null && k !== false));
}

export const ICONS = {
  start: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  archiv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>',
  mehr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  kamera: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  stift: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
};
export const icon = (n) => h('span', { html: ICONS[n], style: { display: 'inline-flex' } });

const stapel = [];

/** Öffnet ein Bottom-Sheet. inhalt: Element oder Funktion(schliessen) -> Element. */
export function sheet(titel, inhalt, { onClose, ohneSchliessen = false } = {}) {
  const ebene = 40 + stapel.length * 2;
  const schleier = h('div', { class: 'schleier', style: { zIndex: ebene } });
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': titel, style: { zIndex: ebene + 1 } });
  let zu = false;
  const schliessen = (sofort = false) => {
    if (zu) return; zu = true;
    const i = stapel.indexOf(eintrag); if (i >= 0) stapel.splice(i, 1);
    schleier.classList.remove('auf'); box.classList.remove('auf');
    const weg = () => { schleier.remove(); box.remove(); };
    if (sofort) weg(); else setTimeout(weg, 260);
    onClose?.();
  };
  if (!ohneSchliessen) schleier.addEventListener('click', () => schliessen());
  const kopf = h('div', { class: 'kopf' }, h('h3', {}, titel),
    ohneSchliessen ? null : h('button', { class: 'textknopf', onclick: () => schliessen() }, 'Schließen'));
  box.append(h('div', { class: 'griff' }), kopf);
  const koerper = h('div');
  box.append(koerper);
  const setze = (el) => { koerper.replaceChildren(typeof el === 'function' ? el(schliessen) : el); };
  setze(inhalt);
  document.body.append(schleier, box);
  requestAnimationFrame(() => { schleier.classList.add('auf'); box.classList.add('auf'); });
  const eintrag = { box, schliessen };
  stapel.push(eintrag);
  return { schliessen, setze, box };
}

export function alleSheetsSchliessen() { [...stapel].reverse().forEach((e) => e.schliessen(true)); }

export function bestaetigen(titel, text, { ja = 'Ja', nein = 'Abbrechen', gefahr = false } = {}) {
  return new Promise((ok) => {
    let antwort = false;
    const s = sheet(titel, (zu) => h('div', {},
      h('p', { style: { marginBottom: '18px' } }, text),
      h('div', { class: 'knopfreihe' },
        h('button', { class: 'knopf grau', onclick: () => zu() }, nein),
        h('button', { class: `knopf ${gefahr ? 'gefahr' : ''}`, onclick: () => { antwort = true; zu(); } }, ja))),
    { onClose: () => ok(antwort) });
    return s;
  });
}

let toastTimer;
export function toast(text, { aktion, beiAktion, dauer = 4000 } = {}) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const t = h('div', { class: 'toast', role: 'status' }, h('div', { class: 't' }, text),
    aktion ? h('button', { onclick: () => { t.remove(); beiAktion?.(); } }, aktion) : null);
  document.body.append(t);
  toastTimer = setTimeout(() => t.remove(), dauer);
}

export function betragsFeld(wert = '', attrs = {}) {
  return h('input', { class: 'eingabe zahl', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00', value: wert, ...attrs });
}

export function auswahl(optionen, wert, attrs = {}) {
  return h('select', { class: 'eingabe', ...attrs },
    optionen.map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: String(v) === String(wert) }, t);
    }));
}

export function feld(label, eingabe) {
  return h('label', { class: 'feld' }, h('span', {}, label), eingabe);
}

export function ladeSkript(src) {
  return new Promise((ok, fehler) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => fehler(new Error(`${src} konnte nicht geladen werden`));
    document.head.append(s);
  });
}

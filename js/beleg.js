// Bild verkleinern und Text auf dem Gerät erkennen (Tesseract, kostenlos, offline nach dem ersten Laden).
import { ladeSkript } from './ui.js';

const abs = (p) => new URL(p, location.href).href;

async function bitmapVon(datei) {
  try { return await createImageBitmap(datei, { imageOrientation: 'from-image' }); }
  catch {
    const url = URL.createObjectURL(datei);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}

function leinwand(quelle, maxSeite) {
  const b = quelle.width, hh = quelle.height;
  const f = Math.min(1, maxSeite / Math.max(b, hh));
  const c = document.createElement('canvas');
  c.width = Math.round(b * f); c.height = Math.round(hh * f);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(quelle, 0, 0, c.width, c.height);
  return c;
}

const alsBlob = (c, q) => new Promise((ok) => c.toBlob(ok, 'image/jpeg', q));

/** Verkleinert ein Bild auf höchstens ca. 200 KB (JPEG). */
export async function bildVerkleinern(datei, zielBytes = 200 * 1024) {
  const bmp = await bitmapVon(datei);
  let seite = 1600;
  for (let versuch = 0; versuch < 6; versuch++) {
    const c = leinwand(bmp, seite);
    for (const q of [0.78, 0.66, 0.55, 0.45]) {
      const blob = await alsBlob(c, q);
      if (blob.size <= zielBytes) return { blob, breite: c.width, hoehe: c.height };
    }
    seite = Math.round(seite * 0.8);
  }
  const c = leinwand(bmp, seite);
  return { blob: await alsBlob(c, 0.4), breite: c.width, hoehe: c.height };
}

/** Screenshot oder Foto? PNG oder sehr schmales Hochformat = Screenshot. */
export async function istScreenshot(datei) {
  if (/png/i.test(datei.type)) return true;
  try {
    const bmp = await bitmapVon(datei);
    return bmp.height / bmp.width > 1.9;
  } catch { return false; }
}

/** Für die Texterkennung: Graustufen, Kontrast, sinnvolle Größe. */
async function ocrLeinwand(datei) {
  const bmp = await bitmapVon(datei);
  const c = leinwand(bmp, 2200);
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  let summe = 0;
  for (let i = 0; i < p.length; i += 4) { const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i] = g; summe += g; }
  const mittel = summe / (p.length / 4);
  const dunkel = mittel < 110; // Dunkelmodus-Screenshot -> invertieren
  for (let i = 0; i < p.length; i += 4) {
    let g = p[i];
    if (dunkel) g = 255 - g;
    g = Math.max(0, Math.min(255, (g - 128) * 1.5 + 128));
    p[i] = p[i + 1] = p[i + 2] = g;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

let worker = null;
let fortschrittRueckruf = null;

async function holeWorker() {
  if (worker) return worker;
  await ladeSkript('vendor/tesseract/tesseract.min.js');
  worker = await window.Tesseract.createWorker('deu', 1, {
    workerPath: abs('vendor/tesseract/worker.min.js'),
    corePath: abs('vendor/tesseract/core'),
    langPath: abs('vendor/tesseract/lang'),
    gzip: true,
    workerBlobURL: false,
    logger: (m) => fortschrittRueckruf?.(m),
  });
  return worker;
}

/** Gibt den erkannten Text zurück. fortschritt(anteil 0..1, text) */
export async function texterkennung(datei, fortschritt) {
  fortschrittRueckruf = (m) => {
    if (m.status === 'recognizing text') fortschritt?.(0.3 + m.progress * 0.7, 'Text wird gelesen …');
    else if (/load/i.test(m.status)) fortschritt?.(Math.min(0.3, (m.progress || 0) * 0.3), 'Texterkennung wird vorbereitet …');
  };
  const w = await holeWorker();
  const c = await ocrLeinwand(datei);
  const { data } = await w.recognize(c);
  fortschrittRueckruf = null;
  return data.text || '';
}

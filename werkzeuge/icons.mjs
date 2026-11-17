// Erzeugt die App-Icons als PNG (ohne Zusatzprogramme). Aufruf: node werkzeuge/icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(typ, daten) {
  const len = Buffer.alloc(4); len.writeUInt32BE(daten.length);
  const td = Buffer.concat([Buffer.from(typ), daten]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(gr, pixel) {
  const roh = Buffer.alloc((gr * 3 + 1) * gr);
  for (let y = 0; y < gr; y++) {
    roh[y * (gr * 3 + 1)] = 0;
    for (let x = 0; x < gr; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (gr * 3 + 1) + 1 + x * 3;
      roh[o] = r; roh[o + 1] = g; roh[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(gr, 0); ihdr.writeUInt32BE(gr, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(roh, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Form in Einheitskoordinaten (0..1): weißer Kreis mit grünem €-Zeichen
function form(u, v) {
  const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy);
  if (r > 0.30) return 'grund';
  // €: Ring mit Öffnung rechts + zwei Querstriche
  const ex = u - 0.53, ey = v - 0.5, er = Math.hypot(ex, ey);
  const winkel = Math.atan2(ey, ex) * 180 / Math.PI;
  const ring = er > 0.12 && er < 0.17 && Math.abs(winkel) > 48;
  const strich = (u > 0.32 && u < 0.56) && (Math.abs(v - 0.465) < 0.017 || Math.abs(v - 0.535) < 0.017);
  return ring || strich ? 'zeichen' : 'muenze';
}
const FARBEN = { grund: null, muenze: [255, 255, 255], zeichen: [31, 122, 104] };
function hintergrund(u, v) { // sanfter Verlauf
  const t = (u + v) / 2;
  return [Math.round(36 + (22 - 36) * t), Math.round(140 + (98 - 140) * t), Math.round(118 + (84 - 118) * t)];
}
function bild(gr) {
  const ss = 4;
  return png(gr, (x, y) => {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < ss; i++) for (let j = 0; j < ss; j++) {
      const u = (x + (i + 0.5) / ss) / gr, v = (y + (j + 0.5) / ss) / gr;
      const f = form(u, v);
      const c = FARBEN[f] || hintergrund(u, v);
      r += c[0]; g += c[1]; b += c[2];
    }
    const n = ss * ss;
    return [r / n, g / n, b / n].map(Math.round);
  });
}
for (const [name, gr] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(`../icons/${name}`, import.meta.url), bild(gr));
}
console.log('Icons erzeugt');

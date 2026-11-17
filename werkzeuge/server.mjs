// Kleiner Test-Server für die lokale Vorschau: node werkzeuge/server.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2] || 8765);
const TYPEN = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.gz': 'application/gzip', '.wasm': 'application/wasm', '.csv': 'text/csv; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

createServer(async (req, res) => {
  try {
    let pfad = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let datei = join(wurzel, pfad);
    if ((await stat(datei).catch(() => null))?.isDirectory()) datei = join(datei, 'index.html');
    const inhalt = await readFile(datei);
    res.writeHead(200, { 'Content-Type': TYPEN[extname(datei)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(inhalt);
  } catch { res.writeHead(404); res.end('Nicht gefunden'); }
}).listen(port, '127.0.0.1', () => console.log(`Vorschau: http://127.0.0.1:${port}/`));

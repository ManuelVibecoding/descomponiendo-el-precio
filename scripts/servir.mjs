// Servidor local para ver la página sin GitHub Pages. Uso: node scripts/servir.mjs [puerto]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const puerto = +process.argv[2] || 8000;
const tipos = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = normalize(join(raiz, ruta));
  if (!archivo.startsWith(normalize(raiz))) { res.writeHead(403).end(); return; }
  try {
    const datos = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': tipos[extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(datos);
  } catch { res.writeHead(404).end('No encontrado'); }
}).listen(puerto, () => console.log(`Descomponiendo el precio del combustible en http://localhost:${puerto}`));

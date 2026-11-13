// Actualización diaria de los indicadores de mercado en data/actual.json.
// - Brent, WTI, gasolina RBOB y diésel ULSD: futuros, cierre diario (Yahoo Finance, sin clave).
// - Dólar observado: tabla oficial del SII (sii.cl/valores_y_fechas/dolar/dolarAAAA.htm).
// Actualiza `mercado` (último cierre) y `semanas` (promedio lunes a viernes de la semana en curso y
// de las semanas marcadas como parciales). No toca precios oficiales (paridad, banda, impuesto, UTM):
// esos los actualiza la tarea semanal de los jueves.
// Uso: node scripts/actualizar-mercado.mjs   Si una fuente falla, deja ese dato como estaba.
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = new URL('../data/actual.json', import.meta.url);
const A = JSON.parse(readFileSync(RUTA, 'utf8'));
const antes = JSON.stringify(A);
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; precio-combustible-cl/1.0)' };
const fechaEn = tz => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); // AAAA-MM-DD
const hoyNY = fechaEn('America/New_York'), hoyCL = fechaEn('America/Santiago');
const sumar = (f, n) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lunesDe = f => { const d = new Date(f + 'T00:00:00Z'); return sumar(f, -((d.getUTCDay() + 6) % 7)); };
const prom = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const r2 = v => Math.round(v * 100) / 100;
const avisos = [];

// Cierres diarios de un futuro. Solo sesiones terminadas (fecha anterior a hoy en Nueva York).
async function yahoo(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2mo&interval=1d`;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${sym}: HTTP ${r.status}`);
  const res = (await r.json()).chart?.result?.[0];
  if (!res?.timestamp) throw new Error(`${sym}: respuesta sin datos`);
  const off = res.meta?.gmtoffset || 0, cierre = res.indicators.quote[0].close, out = {};
  res.timestamp.forEach((t, i) => {
    const f = new Date((t + off) * 1000).toISOString().slice(0, 10);
    if (cierre[i] != null && f < hoyNY) out[f] = cierre[i];
  });
  return out;
}

// Dólar observado del SII para un año: { 'AAAA-MM-DD': valor }
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
async function dolarSII(anio) {
  const r = await fetch(`https://www.sii.cl/valores_y_fechas/dolar/dolar${anio}.htm`, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`SII ${anio}: HTTP ${r.status}`);
  const h = await r.text(), out = {};
  for (const m of h.matchAll(/id=['"]mes_([a-z]+)['"]([\s\S]*?)<\/table>/g)) {
    const mes = MESES.indexOf(m[1]); if (mes < 0) continue;
    for (const c of m[2].matchAll(/<strong>(\d{1,2})<\/strong>\s*<\/th>\s*<td[^>]*>\s*([\d.,]*)\s*<\/td>/g)) {
      if (!c[2]) continue;
      // el SII mezcla "977,05" y "992.66"; con coma, el punto es separador de miles
      const v = c[2].includes(',') ? parseFloat(c[2].replace(/\./g, '').replace(',', '.')) : parseFloat(c[2]);
      if (v > 300 && v < 3000) out[`${anio}-${String(mes + 1).padStart(2, '0')}-${c[1].padStart(2, '0')}`] = v;
    }
  }
  if (!Object.keys(out).length) throw new Error(`SII ${anio}: no se pudo leer la tabla`);
  return out;
}

const intentar = async (nombre, fn) => { try { return await fn(); } catch (e) { avisos.push(`${nombre}: ${e.message}`); return null; } };
const [brent, wti, rbob, ulsd] = await Promise.all(['BZ=F', 'CL=F', 'RB=F', 'HO=F'].map(s => intentar(s, () => yahoo(s))));
const anio = +hoyCL.slice(0, 4);
const fx = Object.assign({},
  hoyCL.slice(5, 7) === '01' ? await intentar(`SII ${anio - 1}`, () => dolarSII(anio - 1)) : {},
  await intentar(`SII ${anio}`, () => dolarSII(anio)));
const ultimo = (serie, hasta = '9999-12-31') => { const fs = Object.keys(serie || {}).filter(f => f <= hasta).sort(); return fs.length ? [fs.at(-1), serie[fs.at(-1)]] : null; };

// ---- mercado: último cierre
const m = A.mercado = A.mercado || {};
const ub = ultimo(brent);
if (ub && (!m.fecha || ub[0] >= m.fecha)) {
  m.fecha = ub[0]; m.brent = r2(ub[1]);
  const en = (s, d) => { const u = ultimo(s, ub[0]); return u ? r2(u[1] * 10 ** d) / 10 ** d : null; };
  m.wti = en(wti, 0) ?? m.wti ?? null;
  m.rbob = rbob ? Math.round(ultimo(rbob, ub[0])[1] * 10000) / 10000 : m.rbob ?? null;
  m.ulsd = ulsd ? Math.round(ultimo(ulsd, ub[0])[1] * 10000) / 10000 : m.ulsd ?? null;
}
const uf = ultimo(fx, hoyCL);
if (uf) { m.fx = r2(uf[1]); m.fxFecha = uf[0]; }
m.nota = 'Brent, WTI, RBOB y ULSD: futuros, cierre diario (Yahoo Finance). Dólar observado: SII. Se actualizan solos cada día hábil.';

// ---- semanas: recalcular la semana en curso y las parciales; las semanas cerradas no se tocan
if (brent && Object.keys(fx).length) {
  const sem = A.semanas = A.semanas || [];
  const lunesHoy = lunesDe(hoyNY);
  const ultimaCerrada = sem.filter(w => !w.parcial).map(w => w.lunes).sort().at(-1) || '0000-00-00';
  const candidatos = new Set(sem.filter(w => w.parcial).map(w => w.lunes));
  for (let l = sumar(ultimaCerrada, 7); l <= lunesHoy; l = sumar(l, 7)) candidatos.add(l);
  for (const l of [...candidatos].sort()) {
    const dias = [0, 1, 2, 3, 4].map(n => sumar(l, n));
    const b = dias.map(f => brent[f]).filter(v => v != null), d = dias.map(f => fx[f]).filter(v => v != null);
    if (!b.length || !d.length) continue;
    const fila = { lunes: l, brent: r2(prom(b)), fx: r2(prom(d)) };
    if (hoyNY < sumar(l, 5)) fila.parcial = true; // la semana aún no termina
    const i = sem.findIndex(w => w.lunes === l);
    if (i >= 0) sem[i] = fila; else sem.push(fila);
  }
  sem.sort((a, b) => a.lunes.localeCompare(b.lunes));
  // conservar las semanas que necesita la ventana de paridad vigente (4 lunes antes) y como máximo 6
  A.semanas = sem.slice(-6);
}

const cambio = JSON.stringify(A) !== antes;
if (cambio) {
  m.actualizado = new Date().toISOString();
  writeFileSync(RUTA, JSON.stringify(A, null, 2) + '\n');
}
console.log(`${cambio ? 'Actualizado' : 'Sin cambios'} · Brent ${m.brent} (${m.fecha}) · dólar ${m.fx} (${m.fxFecha ?? '—'}) · semanas: ${A.semanas.map(w => w.lunes.slice(5) + (w.parcial ? '*' : '')).join(' ')}`);
if (avisos.length) console.log('Avisos:\n- ' + avisos.join('\n- '));
if (!brent && !Object.keys(fx).length) process.exit(1);

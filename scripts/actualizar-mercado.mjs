// Actualización diaria de los indicadores de mercado en data/actual.json.
// - Brent, WTI, gasolina RBOB y diésel ULSD: futuros, cierre diario (Yahoo Finance, sin clave).
// - Dólar observado: tabla oficial del SII (sii.cl/valores_y_fechas/dolar/dolarAAAA.htm).
// Actualiza `mercado` (último cierre) y `semanas` (promedio lunes a viernes de la semana en curso y
// de las semanas marcadas como parciales). No toca precios oficiales (paridad, banda, impuesto, UTM):
// esos los actualiza la tarea semanal de los jueves.
// - Precio en estación: Bencina en Línea (CNE), promedio de la RM; recalcula el margen de estación.
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

// ---- precios en estación: Bencina en Línea (CNE), API pública sin clave.
// Promedio de la Región Metropolitana con las estaciones que actualizaron su precio en la semana de
// la vigencia actual (desde el jueves de vigencia hasta el miércoles siguiente). Así, el jueves en
// que cambia el mayorista no se mezclan precios nuevos con el mayorista anterior. El margen de
// estación queda como promedio real menos mayorista.
async function bencinaEnLinea() {
  const r = await fetch('https://api.bencinaenlinea.cl/api/busqueda_estacion_filtro', { headers: UA, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()).data;
  if (!Array.isArray(d) || !d.length) throw new Error('respuesta sin estaciones');
  return d;
}
const est = await intentar('Bencina en Línea', bencinaEnLinea);
if (est && A.vigencia) {
  const desde = A.vigencia, hasta = sumar(A.vigencia, 7);
  const RM = est.filter(s => /Metropolitana/.test(s.region || ''));
  const MARCAS = { 5: 'copec', 4: 'shell', 151: 'aramco' };
  const CODIGO = { g93: '93', g95: '95', g97: '97', diesel: 'DI' };
  const cuantil = (xs, q) => { const a = [...xs].sort((x, y) => x - y), i = (a.length - 1) * q, b = Math.floor(i); return Math.round(a[b] + (a[Math.min(b + 1, a.length - 1)] - a[b]) * (i - b)); };
  // p05 y p95: rango donde está el 90% de las estaciones (evita datos anómalos de una sola estación)
  const C = A.combustibles, res = { fecha: hoyCL, desde, n: {}, promedio: {}, p05: {}, p95: {}, marcas: { copec: {}, shell: {}, aramco: {} } };
  for (const [f, cod] of Object.entries(CODIGO)) {
    const vals = [], porMarca = { copec: [], shell: [], aramco: [] };
    for (const s of RM) {
      const c = (s.combustibles || []).find(x => x.nombre_corto === cod), p = +(c?.precio);
      const fch = (c?.precio_fecha || '').slice(0, 10);
      if (!p || p < 500 || p > 3000 || fch < desde || fch >= hasta) continue;
      vals.push(p); const m = MARCAS[s.marca]; if (m) porMarca[m].push(p);
    }
    res.n[f] = vals.length;
    if (vals.length < 100) { avisos.push(`Bencina en Línea ${f}: solo ${vals.length} estaciones con precio de esta semana; el margen no cambia`); continue; }
    const p = prom(vals);
    res.promedio[f] = Math.round(p); res.p05[f] = cuantil(vals, 0.05); res.p95[f] = cuantil(vals, 0.95);
    for (const m of Object.keys(porMarca)) if (porMarca[m].length >= 10) res.marcas[m][f] = Math.round(prom(porMarca[m]));
    const may = f === 'g95' ? (C.g93.mayorista + C.g97.mayorista) / 2 : C[f].mayorista;
    const margen = Math.round((p - may) * 10) / 10;
    if (margen < 30 || margen > 160) { avisos.push(`margen ${f} fuera de rango (${margen}); no se cambia`); continue; }
    C[f].margen = margen;
  }
  A.estaciones = res;

  // Promedios por región y por comuna (mismas estaciones de la semana de vigencia) en data/estaciones.json,
  // para que cada persona compare con el precio donde carga. No afecta el modelo.
  const LOC = { fecha: hoyCL, desde, nacional: {}, regiones: {} };
  const acum = {}; // clave región|comuna (comuna '' = toda la región; región '' = nacional)
  for (const s of est) {
    for (const [f, cod] of Object.entries(CODIGO)) {
      const c = (s.combustibles || []).find(x => x.nombre_corto === cod), p = +(c?.precio);
      const fch = (c?.precio_fecha || '').slice(0, 10);
      if (!p || p < 500 || p > 3000 || fch < desde || fch >= hasta) continue;
      for (const k of ['|', `${s.region}|`, `${s.region}|${s.comuna}`]) ((acum[k] ??= {})[f] ??= []).push(p);
    }
  }
  const resumen = o => Object.fromEntries(Object.entries(o).map(([f, v]) => [f, [Math.round(prom(v)), v.length]]));
  for (const [k, o] of Object.entries(acum)) {
    const [reg, com] = k.split('|');
    if (!reg) { LOC.nacional = resumen(o); continue; }
    const R = (LOC.regiones[reg] ??= { total: {}, comunas: {} });
    if (!com) R.total = resumen(o); else R.comunas[com] = resumen(o);
  }
  const RUTA_LOC = new URL('../data/estaciones.json', import.meta.url);
  let previo = ''; try { previo = readFileSync(RUTA_LOC, 'utf8'); } catch {}
  const nuevo = JSON.stringify(LOC) + '\n';
  // solo reescribe si cambiaron los precios (no por la fecha)
  const sinFecha = t => { try { const o = JSON.parse(t); delete o.fecha; return JSON.stringify(o); } catch { return ''; } };
  if (Object.keys(LOC.nacional).length && sinFecha(previo) !== sinFecha(nuevo)) writeFileSync(RUTA_LOC, nuevo);
  const i = (A.supuestos || []).findIndex(t => t.startsWith('Precios en bomba'));
  if (i >= 0 && res.n.g93 >= 100) A.supuestos[i] = `Precios en bomba = promedio de la Región Metropolitana según Bencina en Línea (CNE), con las estaciones que informaron su precio desde el ${desde.split('-').reverse().join('-')} (${res.n.g93} en la 93). El margen de distribución y estación es ese promedio menos el precio mayorista estimado. Cada estación cobra distinto: en la RM, 9 de cada 10 estaciones venden la 93 entre $${res.p05.g93.toLocaleString('es-CL')} y $${res.p95.g93.toLocaleString('es-CL')}.`;
}

const cambio = JSON.stringify(A) !== antes;
if (cambio) {
  m.actualizado = new Date().toISOString();
  writeFileSync(RUTA, JSON.stringify(A, null, 2) + '\n');
}
console.log(`${cambio ? 'Actualizado' : 'Sin cambios'} · Brent ${m.brent} (${m.fecha}) · dólar ${m.fx} (${m.fxFecha ?? '—'}) · semanas: ${A.semanas.map(w => w.lunes.slice(5) + (w.parcial ? '*' : '')).join(' ')}`);
if (A.estaciones) console.log(`Estaciones RM (${A.estaciones.fecha}): ` + Object.entries(A.estaciones.promedio).map(([f, v]) => `${f} $${v} (n ${A.estaciones.n[f]}, margen ${A.combustibles[f].margen})`).join(' · '));
if (avisos.length) console.log('Avisos:\n- ' + avisos.join('\n- '));
if (!brent && !Object.keys(fx).length) process.exit(1);

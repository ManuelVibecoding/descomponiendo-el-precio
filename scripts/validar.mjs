// Revisa que data/actual.json y data/historial.json tengan la forma que espera la página
// y que la calibración cuadre. Uso: node scripts/validar.mjs
import { readFileSync } from 'node:fs';

const A = JSON.parse(readFileSync(new URL('../data/actual.json', import.meta.url)));
const H = JSON.parse(readFileSync(new URL('../data/historial.json', import.meta.url)));
const errores = [], avisos = [];
const num = (v, n) => { if (typeof v !== 'number' || !isFinite(v)) errores.push(`${n} debe ser número (es ${JSON.stringify(v)})`); };
const fecha = (v, n) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) errores.push(`${n} debe ser AAAA-MM-DD`); };

fecha(A.vigencia, 'vigencia'); num(A.utm, 'utm');
if (!Array.isArray(A.semanas) || A.semanas.length < 4) errores.push('semanas necesita al menos 4 semanas');
(A.semanas || []).forEach((w, i) => { fecha(w.lunes, `semanas[${i}].lunes`); num(w.brent, `semanas[${i}].brent`); num(w.fx, `semanas[${i}].fx`); });
num(A.mercado?.brent, 'mercado.brent'); num(A.mercado?.fx, 'mercado.fx');

// la ventana de paridad (4 lunes antes de la vigencia) debe estar completa
const add = (s, d) => { const x = new Date(s + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const lunes = new Set((A.semanas || []).map(w => w.lunes));
[-31, -24, -17, -10].map(d => add(A.vigencia, d)).forEach(m => { if (!lunes.has(m)) avisos.push(`falta la semana del lunes ${m} (ventana de paridad)`); });

for (const f of ['g93', 'g97', 'diesel']) {
  const c = A.combustibles?.[f];
  if (!c) { errores.push(`falta combustibles.${f}`); continue; }
  ['paridad', 'bandaSup', 'deriva', 'futPeso', 'cvUTM', 'iebUTM', 'mayorista', 'margen', 'premio'].forEach(k => num(c[k], `${f}.${k}`));
  if (!Array.isArray(c.base) || c.base.length < 2) errores.push(`${f}.base necesita al menos 2 valores`);
  // cuadratura: mayorista = (paridad + premio) * 1,19 + (ieb + cv) * utm / 1000
  const calc = (c.paridad + c.premio) * 1.19 + (c.iebUTM + c.cvUTM) * A.utm / 1000;
  const dif = calc - c.mayorista;
  if (Math.abs(dif) > 3) avisos.push(`${f}: el mayorista no cuadra por $${dif.toFixed(1)}/L; recalcular premio`);
  if (c.premio < -20 || c.premio > 40) avisos.push(`${f}: premio fuera de rango (${c.premio})`);
}
num(A.combustibles?.g95?.margen, 'g95.margen');
if (!Array.isArray(H.filas) || !H.filas.length) errores.push('historial.filas vacío');

if (avisos.length) console.log('Avisos:\n- ' + avisos.join('\n- '));
if (errores.length) { console.error('Errores:\n- ' + errores.join('\n- ')); process.exit(1); }
console.log(`OK · vigencia ${A.vigencia} · ${A.semanas.length} semanas · ${H.filas.length} filas de historial`);

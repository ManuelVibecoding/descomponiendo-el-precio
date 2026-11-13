# Barril a Bomba

Cómo se forma el precio de la bencina y el diésel en Chile, desde el barril de petróleo hasta la estación, y qué viene en las próximas fijaciones.

La página parte con una portada (precio de hoy, barril con su composición y tres cifras clave) y sigue en tres pasos:

1. **¿De dónde sale cada parte?** Las cinco etapas del precio, con un barril que se va llenando paso a paso.
2. **¿Qué pasa si cambia el petróleo o el dólar?** Simulador con el Brent y el tipo de cambio.
3. **¿Qué viene?** Proyección semanal con la regla del MEPCO y con el congelamiento propuesto en noviembre de 2026.

## Cómo funciona

- `index.html` es la página completa: HTML, CSS y JavaScript sin dependencias.
- `data/actual.json` tiene los datos vigentes (paridad, banda, impuesto, precios mayoristas, Brent y dólar por semana).
- `data/historial.json` tiene el componente variable del impuesto específico de cada semana de 2026.
- Los datos se actualizan cada jueves, después del informe de ENAP (miércoles) y del decreto de impuestos (SII, jueves).
- `scripts/validar.mjs` revisa que los datos tengan la forma correcta y que la calibración cuadre: `node scripts/validar.mjs`.

## El modelo

- **Costo de importar (paridad, CNE):** precio del combustible refinado en la Costa del Golfo de EE.UU., más flete, seguro y ajuste de calidad, en promedio de 4 semanas. Como los precios Argus no son públicos, se aproxima con Brent más un diferencial calibrado con cada decreto.
- **Precio mayorista ENAP** = (paridad + ajuste ENAP) × 1,19 + impuesto específico.
- **Impuesto específico** = 6 UTM/m³ en bencinas, 1,5 UTM/m³ en diésel, más el componente variable del MEPCO (Ley 20.765).
- **IVA** 19% sobre todo salvo el impuesto específico (Ley 18.502, art. 6).
- **Regla MEPCO:** el mayorista cambia cada 3 semanas, como máximo 2,4% del precio base, y la paridad más el componente variable debe quedar dentro de la banda de ±5% del precio de referencia.
- **Precio en estación:** mayorista + margen promedio estimado en la Región Metropolitana.

Es un modelo de estimación, no una cifra oficial. ENAP no fija precios al público; cada estación cobra distinto.

## Fuentes

CNE (informes técnicos MEPCO y decretos de paridad y referencia), SII (impuesto específico, UTM, dólar observado), ENAP (informe semanal de precios estimados), Banco Central, OCEC-UDP.

## Ver en local

```bash
node scripts/servir.mjs
# abrir http://localhost:8000
```

Página publicada: https://manuelvibecoding.github.io/barril-a-bomba/

Hecho por Manuel Amenábar.

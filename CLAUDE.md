# Barril a Bomba: instrucciones para Claude

Proyecto de Manuel Amenábar. Página estática que explica y proyecta el precio de las bencinas y el diésel en Chile. Se publica con GitHub Pages desde la rama `main`, carpeta raíz.

## Reglas
- Todo en español de Chile. Nunca usar emojis, ni en la página, ni en commits, ni en mensajes.
- Estilo de la página: informe financiero sobrio (blanco, azul marino, rojo óxido solo para impuestos, líneas finas, figuras numeradas con fuente). No volver a estética de "dashboard generado" (mayúsculas condensadas, tarjetas redondeadas, chips, colores neón).
- Pensada para alguien que no sabe del tema: cada término técnico se explica donde aparece o en el glosario.
- Sin librerías externas. Todo en `index.html`.
- No inventar datos: cada número de `data/` debe venir de una fuente oficial encontrada en la semana.

## Archivos
- `index.html`: página completa. Lee `data/actual.json` y `data/historial.json` con `fetch`.
- `data/actual.json`: datos vigentes. Campos clave por combustible (`g93`, `g97`, `diesel`): `paridad` y `bandaSup` en $/L, `cvUTM` (componente variable, UTM/m³), `iebUTM` (6 o 1,5), `mayorista` ($/L con impuestos), `margen` ($/L con IVA, estación RM), `premio` (calibración ENAP), `deriva` (deriva semanal de la banda, $/L), `futPeso` (ponderador de futuros), `base` (últimos 3 precios base de Hacienda).
- `data/historial.json`: `filas` con `{f, u, g93, g97, d}` (fecha jueves, UTM, componente variable en UTM/m³).
- `scripts/validar.mjs`: correr después de cada actualización.

## Configuración pendiente (una sola vez)
1. Crear el repositorio público `barril-a-bomba` en la cuenta de Manuel y subir este contenido: `git init -b main && git add . && git commit -m "Primera versión de Barril a Bomba"` y luego `gh repo create barril-a-bomba --public --source . --push`.
2. Activar GitHub Pages desde `main`, carpeta `/`: `gh api -X POST repos/{owner}/barril-a-bomba/pages -f "source[branch]=main" -f "source[path]=/"`.
3. Reemplazar `__PAGES_URL__` en `index.html` por la URL real de Pages (por ejemplo `https://usuario.github.io/barril-a-bomba`), para que la imagen de vista previa aparezca al compartir el link por WhatsApp.
4. Crear la tarea programada semanal (abajo).

## Actualización semanal (jueves en la tarde, hora de Santiago)
1. SII (`sii.cl/valores_y_fechas/mepco/mepco<año>.htm`): componente variable vigente desde el jueves para 93, 97 y diésel. Agregar una fila a `historial.filas`.
2. UTM del mes (SII) → `utm`.
3. ENAP, informe del miércoles: variación en $/L de 93, 97 y diésel → sumarla a `mayorista`. Si el congelamiento por ley aplicó una rebaja, reflejar la rebaja real.
4. CNE / Diario Oficial (informe `AAAA_MM_DD_MEPCO.pdf`): paridad y precio de referencia superior ($/m³ ÷ 1000 → $/L) → `paridad`, `bandaSup`. Si trae ponderador de futuros, actualizar `futPeso`; si trae Anexo 1, `deriva` = (intermedio a 10 semanas − intermedio actual)/10.
5. Brent (futuros ICE) y dólar observado: promedio de la semana que terminó → agregar `{lunes, brent, fx}` a `semanas`, conservar 6. Quitar la marca `parcial` si estaba.
6. `mercado`: último cierre de Brent, WTI, RBOB y ULSD (US$/galón) y dólar observado; `null` si no hay dato confiable.
7. `congelamiento`: estado actual del proyecto de ley (o de la ley) en una o dos frases.
8. Si se encuentra el precio promedio en estaciones de la RM: `margen` = precio − mayorista (95: precio − promedio de mayoristas 93 y 97).
9. Recalibrar: `vigencia`, `actualizado`, `cvUTM`; `premio` = (mayorista − (iebUTM + cvUTM) × utm/1000)/1,19 − paridad (si queda fuera de −20 a 40, no cambiarlo y avisar); agregar a `base` el valor mayorista − cvUTM × utm/1000 y conservar 3; dejar en `proximasFijaciones` solo fechas futuras, cada 3 semanas.
10. `node scripts/validar.mjs`. Si pasa, commit `Datos semana AAAA-MM-DD` y push a `main`.
11. Mandar a Manuel un resumen corto: variación ENAP, componente variable, paridad vs techo de banda, Brent y dólar, estado del congelamiento, con enlaces a las fuentes.

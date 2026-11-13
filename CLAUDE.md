# Descomponiendo el precio del combustible: instrucciones para Claude

Proyecto de Manuel Amenábar. Página estática que explica y proyecta el precio de las bencinas y el diésel en Chile. Se publica con GitHub Pages desde la rama `main`, carpeta raíz.

## Reglas
- Todo en español de Chile. Nunca usar emojis, ni en la página, ni en commits, ni en mensajes.
- Estilo de la página (acordado con Manuel el 13-11-2026): base de informe financiero (Source Serif 4 y Source Sans 3, líneas finas, figuras numeradas con fuente) con una portada visual y animada: barra superior fija con el selector, portada con degradado suave, barril que se llena capa por capa, precio que cuenta, tres cifras clave, secciones que aparecen al bajar y gráfico que se revela. Colores por etapa: azul marino (petróleo), verde petróleo (refinar), ámbar (estación) y rojo óxido solo para impuestos. Las animaciones se apagan con "reducir movimiento". No volver a estética de "dashboard generado" (mayúsculas condensadas, tarjetas redondeadas, chips, colores neón). Cambios de estilo, solo preguntando a Manuel.
- Pensada para alguien que no sabe del tema: cada término técnico se explica donde aparece o en el glosario.
- Sin librerías externas. Todo en `index.html`.
- No inventar datos: cada número de `data/` debe venir de una fuente oficial encontrada en la semana.

## Archivos
- `index.html`: página completa. Lee `data/actual.json` y `data/historial.json` con `fetch`.
- `data/actual.json`: datos vigentes. Campos clave por combustible (`g93`, `g97`, `diesel`): `paridad` y `bandaSup` en $/L, `cvUTM` (componente variable, UTM/m³), `iebUTM` (6 o 1,5), `mayorista` ($/L con impuestos), `margen` ($/L con IVA, estación RM), `premio` (calibración ENAP), `deriva` (deriva semanal de la banda, $/L), `futPeso` (ponderador de futuros), `base` (últimos 3 precios base de Hacienda).
- `data/historial.json`: `filas` con `{f, u, g93, g97, d}` (fecha jueves, UTM, componente variable en UTM/m³).
- `scripts/validar.mjs`: correr después de cada actualización.
- `scripts/servir.mjs`: servidor local para ver la página (`node scripts/servir.mjs`, luego http://localhost:8000).

## Publicación (configurada el 13-11-2026)
- Repositorio: https://github.com/ManuelVibecoding/descomponiendo-el-precio (cuenta ManuelVibecoding, no Manuel-vibecoder).
- Página: https://manuelvibecoding.github.io/descomponiendo-el-precio/ (GitHub Pages desde `main`, carpeta raíz).
- Carpeta local: `C:\Users\mjame\Desktop\Proyectos\barril-a-bomba`. El repositorio usa GitHub CLI (`C:\Program Files\GitHub CLI\gh.exe`) como credencial de git, configurado solo en este repo.
- Las etiquetas `og:url` y `og:image` de `index.html` apuntan a la URL de Pages; si la URL cambia, actualizarlas.
- `og.png` (vista previa al compartir, 1200x630) se genera desde la propia página en modo `?og`, sin cifras: con `node scripts/servir.mjs` corriendo, `msedge --headless=new --hide-scrollbars --window-size=1200,630 --screenshot=og.png "http://localhost:8000/?og"`. Si cambia, subir el `?v=` de `og:image` para que WhatsApp y LinkedIn la refresquen.
- Tarea programada en la app de Claude: "Precio del combustible semanal (GitHub)", jueves 18:39 hora de Santiago.

## Actualización diaria automática (GitHub Actions)
- `.github/workflows/mercado-diario.yml` corre martes a sábado a las 08:15 de Santiago (también a mano desde la pestaña Actions) y ejecuta `scripts/actualizar-mercado.mjs`, luego `validar.mjs`, y hace commit "Mercado diario AAAA-MM-DD".
- Fuentes sin clave: Yahoo Finance (futuros BZ=F, CL=F, RB=F, HO=F, solo sesiones cerradas) y la tabla del dólar observado del SII (`sii.cl/valores_y_fechas/dolar/dolarAAAA.htm`).
- Actualiza `mercado` (último cierre) y `semanas` (promedio lunes a viernes de la semana en curso, marcada `parcial` hasta que termina). No toca semanas cerradas ni precios oficiales.
- Cerca del cambio de contrato de fin de mes, el futuro continuo de Yahoo puede diferir unos dólares del Brent ICE que usa la CNE. Si un promedio semanal se ve raro, corregirlo a mano en la tarea del jueves.
- Como hay commits diarios del bot, siempre hacer `git pull --rebase` antes de editar.

## Actualización semanal (jueves en la tarde, hora de Santiago)
1. SII (`sii.cl/valores_y_fechas/mepco/mepco<año>.htm`): componente variable vigente desde el jueves para 93, 97 y diésel. Agregar una fila a `historial.filas`.
2. UTM del mes (SII) → `utm`.
3. ENAP, informe del miércoles: variación en $/L de 93, 97 y diésel → sumarla a `mayorista`. Si el congelamiento por ley aplicó una rebaja, reflejar la rebaja real.
4. CNE / Diario Oficial (informe `AAAA_MM_DD_MEPCO.pdf`): paridad y precio de referencia superior ($/m³ ÷ 1000 → $/L) → `paridad`, `bandaSup`. Si trae ponderador de futuros, actualizar `futPeso`; si trae Anexo 1, `deriva` = (intermedio a 10 semanas − intermedio actual)/10. Poner en `refBanda` la fecha del jueves y el último cierre del Brent a esa fecha (`mercado.brent`).
5. `semanas` y `mercado` los mantiene la actualización diaria. Solo revisar que estén al día (si no, correr `node scripts/actualizar-mercado.mjs`) y que los promedios semanales sean razonables.
6. Si la actualización diaria falló varios días, revisar la pestaña Actions del repositorio y avisar a Manuel.
7. `congelamiento`: estado actual del proyecto de ley (o de la ley) en una o dos frases.
8. Si se encuentra el precio promedio en estaciones de la RM: `margen` = precio − mayorista (95: precio − promedio de mayoristas 93 y 97).
9. Recalibrar: `vigencia`, `actualizado`, `cvUTM`; `premio` = (mayorista − (iebUTM + cvUTM) × utm/1000)/1,19 − paridad (si queda fuera de −20 a 40, no cambiarlo y avisar); agregar a `base` el valor mayorista − cvUTM × utm/1000 y conservar 3; dejar en `proximasFijaciones` solo fechas futuras, cada 3 semanas.
10. `node scripts/validar.mjs`. Si pasa, commit `Datos semana AAAA-MM-DD` y push a `main`.
11. Mandar a Manuel un resumen corto: variación ENAP, componente variable, paridad vs techo de banda, Brent y dólar, estado del congelamiento, con enlaces a las fuentes.

# FutbolResultados

Web de seguimiento del fútbol español con foco en Canarias: resultados en directo, próximos partidos, clasificación, calendario por jornada, XI inicial dibujado sobre el campo y radio en directo. Todos los horarios se muestran en huso `Atlantic/Canary`.

## Contenido

- [Características](#características)
- [Ligas y vistas](#ligas-y-vistas)
- [Detalle de partido y campo SVG](#detalle-de-partido-y-campo-svg)
- [XI inicial](#xi-inicial)
- [Radio en directo](#radio-en-directo)
- [Insignias de TV](#insignias-de-tv)
- [Fuentes de datos](#fuentes-de-datos)
- [Fechas y zona horaria](#fechas-y-zona-horaria)
- [Actualización automática](#actualización-automática)
- [Responsive, modo oscuro y accesibilidad](#responsive-modo-oscuro-y-accesibilidad)
- [Stack y estructura](#stack-y-estructura)
- [Desarrollo](#desarrollo)
- [Despliegue y limitaciones conocidas](#despliegue-y-limitaciones-conocidas)

## Características

- **Seguimiento especial** de CD Tenerife (Segunda + Copa del Rey), Tenerife B (2ª RFEF) y Costa Adeje Tenerife (Liga F + Copa de la Reina). Muestra solo el siguiente partido no jugado de cada equipo, ordenado por fecha, con chip de liga, marcador o hora, chip `Con/Sin TV Canaria` y botón de XI.
- **5 ligas navegables**: Primera, Segunda, 1ª RFEF, 2ª RFEF y Liga F, con pestañas Hoy / Próximos / Resultados / Clasificación más vista de Calendario de temporada.
- **Detalle por partido** (en vivo y finalizados): goles, tarjetas y cambios por equipo + campo SVG con marcadores posicionados y XI inicial superpuesto cuando está publicado.
- **XI inicial con doble fuente y verificación**: ESPN + FotMob con validación de fecha y comparación cruzada (`✓ verificado` si ≥9 nombres coinciden). Polling en ventana de partido y auto-apertura.
- **Radio en directo** con 3 emisoras tinerfeñas, vúmetro real por Web Audio, volumen por emisora y soporte HLS (Radio Canaria).
- **TV**: insignias TV Canaria y Movistar 1ª RFEF (dial 53) calculadas por fecha y cruce de nombres.

## Ligas y vistas

Ligas configuradas en `LEAGUES` (`src/api.js`):

| Clave | Nombre | Fuente principal | `fotmobId` / `slug` ESPN |
|---|---|---|---|
| `primera` | LALIGA | ESPN | `esp.1` / 87 |
| `segunda` | LALIGA 2 | ESPN | `esp.2` / 140 |
| `rfef1` | Primera RFEF | FotMob | 8968 |
| `rfef2` | Segunda RFEF | FotMob | 9138 |
| `ligaf` | Liga F | ESPN (+ FotMob apoyo) | `esp.w.1` / 9907 |
| `copa` | Copa del Rey | ESPN | `esp.copa_del_rey` |
| `copaReina` | Copa de la Reina | ESPN | `esp.copa_de_la_reina` |

Vistas principales (`src/App.jsx` → `App`):

- **Hoy**: `offsets { hoy: [0] }`. En RFEF usa `fetchRfefBoard` (temporada actual + anterior para cubrir el arranque); en ESPN, `fetchScoreboard` por día.
- **Próximos**: offsets `[1, 2, 3, 4]`.
- **Resultados**: offsets `[-3, -2, -1]`, ordenados de más reciente a más antiguo.
- **Clasificación**: `fetchStandings` (ESPN `standings` o tabla FotMob por grupos `Grupo N`).
- **Calendario**: `fetchSeasonCalendar` (ESPN por ventanas de 300 días desde el 1-jul + dedup por id + `assignRounds`, o FotMob filtrando no finalizados). Agrupado en `sections[] → days[] → blocks[]` por jornada (`round`), fecha y grupo RFEF, con colores `cal-group-1..8`.

Estados de partido: `pre` (hora `vs`), `in` (`EN VIVO` + minuto `clock` + punto pulsante) y `post` (`Final` + marcador). Solo `in`/`post` son clicables y expanden el detalle.

## Detalle de partido y campo SVG

`MatchCard` + `MatchDetail` + `Pitch` + `XIDots`:

- **Eventos ESPN** (`fetchMatchEvents`): lee `summary?event=` → `keyEvents`. Mapea `penalty---scored`, `goal`, `own-goal`, `yellow-card`, `red-card`, `second-yellow-card` y `substitution` a `goal/yellow/red/sub`, con minuto (`parseMinute`), jugador y texto (`Entra X por Y`, `(p)` penalti, `(pp)` propia, `(2ª amarilla)`). El marcador se recalcula contando goles.
- **Eventos RFEF** (`fetchFotmobEvents`): resuelve el slug del partido (`fotmobMatchSlug` vía caché `fotmobCache`/`fotmobSlugIndex`), descarga `/matches/<slug>`, parsea `__NEXT_DATA__` → `content.matchFacts.events.events` y equipos de `header.teams`.
- **Campo SVG** (`600×400`): porterías, centro y áreas dibujadas con variables `--pitch-green` / `--pitch-line`. Marcadores por tipo:
  - `⚽` gol (círculo blanco con borde verde + minuto),
  - `▮` tarjeta (rectángulo amarillo/rojo + minuto),
  - `▲/▼` cambio local/visitante sobre el color de cada equipo,
  ordenados por minuto y con `<title>` para tooltip. Leyenda inferior + leyenda XI local/visitante.
- **XI sobre el campo** (`XIDots`): círculos con dorsal y apellido (si el apellido se repite, `Inicial. Apellido`). Local ataca →, visitante ←.

## XI inicial

Componentes `TenerifeLineup` (CD Tenerife) y `CostaAdejeLineup` (misma lógica, variante violeta, sin auto-apertura en Liga F: solo avisa `¡disponible!`).

Flujo (`fetchLineup`):

1. Lanza en paralelo `fetchEspnLineup` (si hay `slug`) y `fetchFotmobLineup` (si hay `fotmobId`; en ligas ESPN resuelve el evento por equipos + fecha con `findFotmobEvent`).
2. **ESPN**: `summary?event=` → `rosters` (titulares `starter` ordenados por `formationPlace`, suplentes, `formation`, dorsales). Sin coordenadas reales: `coordsFromFormation` deduce `x/y` normalizados por banda (POR/DEF/MED/DEL) y lado (Left/Right/Center).
3. **FotMob**: `/matches/<slug>` → `__NEXT_DATA__` → `content.lineup` con `verticalLayout` real (`coordsFromLayout`). Solo acepta `lineupType` `confirmed/standard` (ignora `lastStarting11`, el XI del partido anterior).
4. **Guardias anti-mejera**: compara `eventDate` con la fecha esperada (`date-mismatch`), resuelve `leagueKeyFromLabel` y prefiere el ID ESPN en el seguimiento (FotMob solo funciona en dev por CORS).
5. **Verificación cruzada** (`sameXi`): normaliza nombres con `normTokens` (minúsculas, sin tildes, sin `club/deportivo/cf/fc/ud/cd…`) y marca `verified` si intersectan ≥9 titulares del lado Tenerife. Se prefiere FotMob como primaria por tener coordenadas reales; `source` muestra `ESPN + FotMob` y `sourcesCount`.
6. Mensajes de estado por `reason`: `no-slug/no-lineup` (se publica ~60' antes), `no-roster/no-starters`, `network/http-*`, con botón Reintentar y enlaces oficiales (CDT/UDG, X, ESPN Match Center, FotMob Tenerife).

Polling del XI: en ventana `<90' antes o en vivo y hasta 4h después`, reintento cada 30s en segundo plano; si el panel está abierto y no hay XI (y el partido está a <36h o <4h pasado), también cada 30s. Auto-apertura una sola vez (Tenerife) si el XI aparece a <60' del inicio o en vivo; el cierre manual se respeta (`autoOpenedRef`).

## Radio en directo

`RADIOS` + `RadioPlayer` (`src/App.jsx`):

| Emisora | Dial | Stream | Web |
|---|---|---|---|
| COPE Tenerife | 97.1 FM · 882 OM | MP3 Flumotion | cope.es/directos/tenerife |
| SER Tenerife · Radio Club | 101.1 FM · 1179 OM | MP3 StreamTheWorld | cadenaser.com/radio-club-tenerife |
| Radio Canaria · Todo Goles | 104.2 FM · Liga F oficial | HLS `.m3u8` Flumotion | rtvc.es/la-radio-canaria-en-directo |

Detalles técnicos:

- `hls.js` se importa bajo demanda (`import('hls.js')`) solo para Radio Canaria. Al montar se **pre-adjunta** la fuente MSE con `autoStartLoad: false` para que el `play()` del clic sea síncrono dentro del gesto (los navegadores móviles lo exigen); en Safari se usa el HLS nativo (`canPlayType('application/vnd.apple.mpegurl')`).
- **Vúmetro**: un grafo Web Audio por emisora (`createMediaElementSource → AnalyserNode fftSize 512 → destination`), bucle `requestAnimationFrame` con RMS del dominio temporal → barra verde + pico (verde/amarillo/rojo). Reanuda el `AudioContext` suspendido en el gesto. Si el analizador devuelve ~1.5s de silencio con audio sonando (WebAudio capado en algunos móviles), activa el fallback CSS `level-sweep`.
- **Volumen** por emisora (`volumes[id]`, slider 0–100, `accent-color` verde).
- **Corte total**: al detener, HLS hace `stopLoad()` + `pause()` (mantiene MSE para el siguiente play síncrono); MP3 hace `pause()` + `removeAttribute('src')` + `load()` para no mantener la conexión ni acumular retardo. Solo suena una emisora a la vez. `hls.js` se destruye al desmontar y el `AudioContext` se cierra.

## Insignias de TV

Scraping de `futbolenlatv.es` (`src/api.js`):

- `fetchDesignacionesTV()`: para `tenerife` y `las-palmas`, busca filas con `listaCanales` + `startDate` y guarda los días cuyo segmento menciona `TV Canaria` → `{ tenerife: Set, las-palmas: Set }`. `isTvcMatch` cruza por fecha (`date.slice(0,10)`) y nombre (tenerife/palmas).
- `fetchPrimeraRfefTv()`: parsea `/competicion/primera-division-rfef`, filtra segmentos con `movistar|m+|federaci` y devuelve `{ date, h: tokens, a: tokens }`. `isMovistarRfef1` cruza por día + intersección de tokens (`normTokens`) en ambos sentidos.
- UI: `TvcBadge` (logo `tv-canaria.svg` + `TV Canaria`, en móvil solo logo), `MovistarBadge` (`Movistar 1ª RFEF` / `M+` en móvil) y `tvc-chip` (`Con/Sin TV Canaria`) en el seguimiento.

## Fuentes de datos

- **ESPN pública**: `site.api.espn.com/apis/site/v2/sports/soccer/<slug>/scoreboard?dates=&limit=`, `summary?event=` (eventos + XI) y `site.web.api.espn.com/.../standings`. Logos ESPN incluidos en la respuesta.
- **FotMob (HTML `__NEXT_DATA__`)**: `/leagues/<id>/overview|fixtures?season=`, `/matches/<slug>`, con caché en memoria (`fotmobCache`), índice de slugs y temporada `YYYY/YYYY+1` (corte en agosto). Logos: `images.fotmob.com/.../teamlogo/<id>.png`. Requiere `User-Agent` de navegador; en producción puede fallar por CORS (ver limitaciones).
- **futbolenlatv.es**: HTML scrapeado en cliente para TV (frágil ante cambios de markup).

## Fechas y zona horaria

- `TIMEZONES = { canarias: 'Atlantic/Canary', peninsular: 'Europe/Madrid' }`; todo se formatea con `toLocal` / `toDateLabel` / `toTimeLabel` en `es-ES`.
- `dateKey(offset)` genera `YYYYMMDD` local para las peticiones ESPN/FotMob.

## Actualización automática

| Qué | Intervalo | Dónde |
|---|---|---|
| Listas, Tenerife, Costa Adeje, TV | 60s | `App` |
| Eventos del partido abierto en vivo | 20s | `MatchDetail` |
| XI en ventana de partido | 30s | `TenerifeLineup` / `CostaAdejeLineup` |

## Responsive, modo oscuro y accesibilidad

- Base `max-width: 1280px` (1360px en ≥1400px) con padding fluido `clamp(16px, 4vw, 40px)`; en PC `≥900px` resultados, seguimiento y calendario pasan a 2 columnas y la radio a 3. `html/body/#root` con `overflow-x: clip` y `min-width: 0` en todas las tarjetas para impedir scroll lateral.
- Radio: grid `auto-fit minmax(min(100%, 260px), 1fr)` (1 columna en móvil ≤640px), nombres con `clamp()` + ellipsis o clamp a 2 líneas, diales con `overflow-wrap: anywhere` y slider con `clamp(64px, 22vw, 110px)`.
- Tablas de clasificación con `overflow-x: auto`; calendario y badges colapsan a versión corta (`M+`, solo logo TV Canaria) bajo 520px.
- Tema por `prefers-color-scheme` (variables `--bg/--surface/--text/--accent…`, variante violeta Costa Adeje), animaciones del `cal-round` desactivadas con `prefers-reduced-motion`, y SVG/botones con `aria-label`, `title`, `role="img"` y atajos de teclado (Enter expande el partido).

## Stack y estructura

React 19 + Vite 8, CSS propio sin framework, `hls.js` (lazy), Oxlint.

- `src/App.jsx` (~1660 lín.) — `App`, `RadioPlayer`, `TenerifeLineup`, `CostaAdejeLineup`, `MatchCard`, `MatchDetail`, `Pitch`, `XIDots`, `Standings`, `CalendarView`, `MatchRow`, `TenerifeCard`, `CostaAdejeCard`, `EventList`, const `RADIOS`.
- `src/api.js` (~1100 lín.) — `LEAGUES/TIMEZONES`, `fetchScoreboard`, `fetchSeasonCalendar`, `fetchTenerife(+Copa)`, `fetchCostaAdeje(+Copa)`, `fetchStandings`, `fetchRfefBoard`, `fetchMatchEvents`, `fetchEspnLineup`, `fetchFotmobLineup`, `fetchLineup`, `fetchDesignacionesTV`, `fetchPrimeraRfefTv`, `normTokens`, `dateKey`, `toLocal/toDateLabel/toTimeLabel`, `leagueKeyFromLabel`.
- `src/index.css` — variables, layout, badges, campo, XI, radio/vúmetro, breakpoints (≤640px, ≤520px, ≥900px, ≥1400px). `App.css` solo indica que los estilos viven en `index.css`.
- `src/main.jsx` — entrada `StrictMode`.
- `public/` — `favicon.svg`, `tv-canaria.svg`, `icons.svg`.
- `vite.config.js` — proxy dev `/fotmob → https://www.fotmob.com` con `changeOrigin` y `User-Agent` Chrome.

## Desarrollo

Requisito: Node 18+ (recomendado 20+).

```bash
npm install
npm run dev      # proxy /fotmob -> fotmob.com solo en dev (evita CORS)
npm run build    # dist/ (css ~20 kB, js ~250 kB + hls ~575 kB lazy)
npm run preview
npm run lint     # oxlint
```

## Despliegue y limitaciones conocidas

- **FotMob en producción**: fetch directo sujeto a CORS; funciona en `npm run dev` por el proxy. Por eso el seguimiento prefiere el duplicado ESPN (su ID permite XI en prod).
- **HLS/móviles**: el `play()` debe ocurrir en el gesto; la precarga MSE y no descargar segmentos hasta el clic son intencionados. Sin `hls.js` ni soporte nativo, se abre la web oficial.
- **Scraping futbolenlatv**: si cambian `listaCanales` / `itemprop="startDate|name"`, las insignias de TV dejan de detectarse (fallo silencioso → arrays/sets vacíos).
- **IDs no compartidos**: ESPN y FotMob usan IDs distintos; el cruce es por fecha + tokens de nombre (`normTokens`), con guardia de fecha para no mezclar jornadas.

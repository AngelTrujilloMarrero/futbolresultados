# FutbolResultados

Web de seguimiento del fútbol español con foco en Canarias: resultados en directo, próximos partidos, clasificación, calendario por jornada, XI inicial sobre el campo y radio en directo. Horarios en huso `Atlantic/Canary`.

## Qué incluye

- **Seguimiento especial**
  - CD Tenerife, Tenerife B y Costa Adeje Tenerife (Liga F).
  - Próximos partidos agrupados y ordenados por fecha.
  - Aviso de XI disponible y auto-apertura en ventana de partido.
- **Radio en directo**
  - COPE Tenerife, SER Tenerife (Radio Club) y Radio Canaria (Todo Goles / Liga F).
  - Radio Canaria vía HLS (`hls.js` con carga bajo demanda, nativo en Safari).
  - Vúmetro en tiempo real (Web Audio API) con fallback animado en móviles, volumen por emisora y corte total del stream al detener.
- **Ligas**
  - Primera, Segunda, 1ª RFEF, 2ª RFEF y Liga F (más Copa del Rey / Copa de la Reina en el seguimiento).
  - Fuentes: ESPN (scoreboard, eventos, XI) y FotMob (RFEF, XI con verificación cruzada).
- **Vistas**
  - Hoy / Próximos / Resultados / Clasificación + Calendario de temporada por jornada, día y grupo.
  - Tarjetas de partido con estado (previo, en vivo con minuto, final), escudos, sede y grupos RFEF.
  - Detalle expandible: goles, tarjetas y cambios por equipo + mapa del campo en SVG con marcadores.
  - XI inicial dibujado sobre el campo (dorsal + apellido, formación, suplentes, XI rival).
- **TV**
  - Insignia TV Canaria según designaciones y `Movistar 1ª RFEF` (dial 53) por cruce de fecha y equipos.
- **UX**
  - Responsive sin scroll lateral: radios y textos fluidos (`clamp()`), grids `auto-fit`, layout a todo el ancho en PC (2 columnas en resultados/seguimiento/calendario).
  - Modo oscuro automático (`prefers-color-scheme`), actualización periódica en vivo (60s listas, 20s eventos, 30s XI).

## Stack

React 19 + Vite 8, CSS propio sin framework, `hls.js` (lazy), Oxlint.

## Desarrollo

```bash
npm install
npm run dev      # proxy /fotmob -> fotmob.com solo en dev (evita CORS)
npm run build
npm run preview
npm run lint
```

## Estructura

- `src/App.jsx` — UI: seguimiento, radio, tabs, calendario, detalle, campo SVG, XI.
- `src/api.js` — ESPN / FotMob, standings, calendario, eventos, XI, TV, utilidades de fecha (`Atlantic/Canary`).
- `src/index.css` — diseño, responsive y modo oscuro (`App.css` solo reexporta).
- `src/main.jsx` — entrada React.
- `public/` — `favicon.svg`, `tv-canaria.svg`, `icons.svg`.
- `vite.config.js` — proxy de desarrollo para FotMob.

## Notas

- El XI oficial se publica ~60 min antes del inicio; fuera de esa ventana se muestra el estado y enlaces oficiales (CDT / UDG / ESPN / FotMob).
- En producción FotMob puede bloquear por CORS; en desarrollo el proxy `/fotmob` lo evita.
- El autoplay/HLS en móviles exige el `play()` dentro del gesto del usuario: la fuente HLS se pre-adjunta sin descargar segmentos para no romperlo.

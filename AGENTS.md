# AGENTS.md

## Commands

- `npm install` — both `package-lock.json` and `pnpm-lock.yaml` are committed; README documents npm, prefer it.
- `npm run dev` — Vite dev server. The `/fotmob` proxy → fotmob.com exists **only in dev** (`vite.config.js`).
- `npm run lint` — oxlint (config: `.oxlintrc.json`; `react/rules-of-hooks` is error).
- `npm run build` / `npm run preview`.
- **No test suite, no typecheck, no formatter.** Verify changes with `npm run lint` then `npm run build`.

## Architecture

- React 19 + Vite 8 SPA, plain JS/JSX (no TS, no router, no state library). Entry: `index.html` → `src/main.jsx` → `src/App.jsx`.
- `src/App.jsx` (~1660 lines) holds **all UI**: `App`, lineup panels (`TenerifeLineup`/`CostaAdejeLineup`), `RadioPlayer`, `MatchCard`/`MatchDetail`, `Pitch`/`XIDots`, `Standings`, `CalendarView`, `RADIOS`.
- `src/api.js` (~1180 lines) holds **all data logic**: `LEAGUES` config, ESPN/FotMob fetchers, lineup dual-source merge, TV badge sources, timezone helpers.
- All styles live in `src/index.css`. `src/App.css` is a stub comment — do not add styles there.
- `hls.js` is loaded via dynamic `import('hls.js')` only for Radio Canaria; keep it out of the main bundle.

## Data-source quirks (before touching fetch code)

- FotMob goes through the dev proxy (`/fotmob…`) in dev, direct URL in prod where CORS often fails — decided by `fotmobUrl()`/`isDev()` in `src/api.js`. In production prefer ESPN IDs for lineups: `fetchEspnLineup` works with open CORS, while FotMob event IDs 404 there.
- ESPN and FotMob IDs never match. Cross-source dedup matches by date + `normTokens()` team tokens and **keeps the ESPN copy** (its ID loads the XI in prod). Keep the `date-mismatch` guards in `fetchEspnLineup`/`fetchFotmobLineup` — they prevent showing another matchday's XI.
- FotMob lineups: accept only `lineupType` `confirmed`/`standard`; `lastStarting11` is the *previous* match's XI — never treat it as current.
- Aplazados/cancelados: FotMob usa `cancelled: true` + `finished`/`started` en false (no es un `pre` normal) y ESPN `STATUS_POSTPONED`/`STATUS_CANCELED` con state `post`. `parseFotmobMatch`/`parseCompetition` los exponen como `postponed`/`cancelled`; el seguimiento especial los salta (y usa el siguiente programado) para no mostrar la fecha antigua.
- Season cutoff is August (`fotmobSeason`); ESPN season calendars fetch 300-day windows from July 1 with dedup by event id.
- `LALIGA_SUBSCRIPTION_KEY` in `src/api.js` is an intentional public web key (documented in README), not a secret to extract or rotate.

## Conventions

- Display timezone is always `Atlantic/Canary` (`TIMEZONES.canarias`): format only via `toLocal`/`toDateLabel`/`toTimeLabel`; build API day keys with `dateKey(offset)` → `YYYYMMDD`.
- Comments and user-facing strings are in **Spanish** — match that.
- Match status values are `pre`/`in`/`post`; only `in`/`post` are clickable/expandable.
- Polling intervals are intentional (60s lists, 20s live match detail, 30s lineups) — don't change casually.

## Reference

- `README.md` (Spanish) is a detailed feature/data-source doc: league IDs, TV badge logic, radio setup, known limitations. Trust code over docs if they drift.

const LEAGUES = {
  primera: { source: 'espn', slug: 'esp.1', fotmobId: 87, name: 'LALIGA' },
  segunda: { source: 'espn', slug: 'esp.2', fotmobId: 140, name: 'LALIGA 2' },
  rfef1: { source: 'fotmob', fotmobId: 8968, name: 'Primera RFEF' },
  rfef2: { source: 'fotmob', fotmobId: 9138, name: 'Segunda RFEF' },
  copa: { source: 'espn', slug: 'esp.copa_del_rey', name: 'Copa del Rey' },
}

const TIMEZONES = {
  canarias: 'Atlantic/Canary',
  peninsular: 'Europe/Madrid',
}

function toLocal(dateStr, tz) {
  return new Date(dateStr).toLocaleString('es-ES', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

export function toDateLabel(dateStr, tz = TIMEZONES.canarias) {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  })
}

export function toTimeLabel(dateStr, tz = TIMEZONES.canarias) {
  return new Date(dateStr).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

function parseCompetition(comp, tz) {
  const [home, away] = comp.competitors
  const status = comp.status?.type?.state || 'pre'
  return {
    id: comp.id,
    date: comp.date,
    dateLabel: toLocal(comp.date, tz),
    status,
    detail: comp.status?.type?.detail || '',
    clock: comp.status?.type?.shortDetail || '',
    venue: comp.venue?.fullName || '',
    home: {
      name: home?.team?.shortDisplayName || home?.team?.displayName || '?',
      logo: home?.team?.logo || '',
      score: home?.score || '0',
      winner: home?.winner || false,
    },
    away: {
      name: away?.team?.shortDisplayName || away?.team?.displayName || '?',
      logo: away?.team?.logo || '',
      score: away?.score || '0',
      winner: away?.winner || false,
    },
  }
}

const fotmobCache = new Map()
const fotmobSlugIndex = new Map()

function indexFotmobSlugs(matches) {
  for (const m of matches || []) {
    if (m?.id && m?.pageUrl) {
      fotmobSlugIndex.set(String(m.id), m.pageUrl.replace(/^\/matches\//, '').replace(/#.*/, ''))
    }
  }
}

async function resolveFotmobSlug(fotmobId, eventId, dateStr) {
  const id = String(eventId)
  if (fotmobSlugIndex.has(id)) return fotmobSlugIndex.get(id)
  const season = fotmobSeason((dateStr || dateKey(0)).replaceAll('-', ''))
  try {
    const fixPage = await fetchFotmobPage(fotmobId, season, 'fixtures')
    indexFotmobSlugs(fixPage.props?.pageProps?.fixtures?.allMatches)
  } catch {}
  if (!fotmobSlugIndex.has(id)) {
    try {
      const ovPage = await fetchFotmobPage(fotmobId, season, 'overview')
      indexFotmobSlugs(ovPage.props?.pageProps?.overview?.leagueOverviewMatches)
    } catch {}
  }
  return fotmobSlugIndex.get(id) || null
}

function fotmobSeason(dateStr) {
  const y = Number(dateStr.slice(0, 4))
  const m = Number(dateStr.slice(4, 6))
  return m >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

function isDev() {
  try {
    return Boolean(import.meta?.env?.DEV)
  } catch {
    return false
  }
}

function fotmobUrl(path) {
  // path must start with /
  if (isDev()) return `/fotmob${path}`
  return `https://www.fotmob.com${path}`
}

async function fetchFotmobPage(fotmobId, season, kind) {
  const path = `/leagues/${fotmobId}/${kind}?season=${encodeURIComponent(season)}`
  const url = fotmobUrl(path)
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126.0' } })
  if (!res.ok) throw new Error(`FotMob error ${res.status}`)
  const html = await res.text()
  const m = html.match(/id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
  if (!m) throw new Error('FotMob: no NEXT_DATA')
  return JSON.parse(m[1])
}

async function fetchFotmobOverview(fotmobId, dateStr) {
  const season = fotmobSeason(dateStr)
  const key = `${fotmobId}:${season}`
  if (fotmobCache.has(key)) return fotmobCache.get(key)

  const page = await fetchFotmobPage(fotmobId, season, 'overview')
  const overview = page.props?.pageProps?.overview || {}
  const matches = overview.leagueOverviewMatches || []
  indexFotmobSlugs(matches)

  const groupById = {}
  const roundById = {}
  try {
    const fixPage = await fetchFotmobPage(fotmobId, season, 'fixtures')
    indexFotmobSlugs(fixPage.props?.pageProps?.fixtures?.allMatches)
    for (const m of fixPage.props?.pageProps?.fixtures?.allMatches || []) {
      if (m.group != null) groupById[String(m.id)] = String(m.group)
      const r = m.roundName ?? m.round
      if (r != null && !Number.isNaN(Number(r))) roundById[String(m.id)] = Number(r)
    }
  } catch {
    // sin datos de grupo/jornada: se ignoran
  }
  for (const m of matches) {
    if (m.group == null && groupById[String(m.id)] != null) m.group = groupById[String(m.id)]
    if (m.round == null && roundById[String(m.id)] != null) m.round = roundById[String(m.id)]
  }

  const data = {
    name: page.props?.pageProps?.details?.name || LEAGUES.rfef1.name,
    season,
    matches,
    table: overview.table || [],
  }
  fotmobCache.set(key, data)
  return data
}

const FOTMOB_EVENT_TYPES = {
  Goal: 'goal',
  'Yellow card': 'yellow',
  'Red card': 'red',
  Substitution: 'sub',
  Penalty: 'goal',
}

function parseFotmobMatch(m, tz) {
  const status = m.status || {}
  const finished = Boolean(status.finished)
  const started = Boolean(status.started)
  const home = m.home || {}
  const away = m.away || {}
  return {
    id: String(m.id),
    date: status.utcTime,
    dateLabel: toLocal(status.utcTime, tz),
    status: finished ? 'post' : started ? 'in' : 'pre',
    detail: status.reason?.long || (started ? 'En vivo' : ''),
    clock: status.scoreStr || status.reason?.short || '',
    venue: '',
    group: m.group != null ? `Grupo ${m.group}` : '',
    round: m.round != null && !Number.isNaN(Number(m.round)) ? Number(m.round) : null,
    home: {
      name: home.name || '?',
      logo: home.id ? `https://images.fotmob.com/image_resources/logo/teamlogo/${home.id}.png` : '',
      score: home.score ?? '0',
      winner: finished && home.score > (away.score ?? 0),
    },
    away: {
      name: away.name || '?',
      logo: away.id ? `https://images.fotmob.com/image_resources/logo/teamlogo/${away.id}.png` : '',
      score: away.score ?? '0',
      winner: finished && away.score > (home.score ?? 0),
    },
  }
}

export async function fetchScoreboard(league, dateStr, tz) {
  const cfg = LEAGUES[league]
  if (cfg.source === 'fotmob') {
    const data = await fetchFotmobOverview(cfg.fotmobId, dateStr)
    const events = data.matches
      .filter((m) => (m.status?.utcTime || '').slice(0, 10).replaceAll('-', '') === dateStr)
      .map((m) => parseFotmobMatch(m, tz))
    return { league: data.name, day: dateStr, events }
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${cfg.slug}/scoreboard?dates=${dateStr}&limit=50`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN error ${res.status}`)
  const data = await res.json()
  const events = (data.events || [])
    .filter((e) => e.competitions?.[0])
    .map((e) => parseCompetition(e.competitions[0], tz))
  return {
    league: data.leagues?.[0]?.name || cfg.name,
    day: data.day?.date,
    events,
  }
}

function assignRounds(events) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date))
  const last = new Map()
  for (const m of sorted) {
    const round =
      Math.max(last.get(m.home.name) || 0, last.get(m.away.name) || 0) + 1
    m.round = round
    last.set(m.home.name, round)
    last.set(m.away.name, round)
  }
  return sorted
}

export async function fetchSeasonCalendar(league, tz) {
  const cfg = LEAGUES[league]
  if (cfg.fotmobId) {
    const data = await fetchFotmobOverview(cfg.fotmobId, dateKey(0))
    return data.matches
      .filter((m) => !m.status?.finished)
      .map((m) => parseFotmobMatch(m, tz))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  const fmtYmd = (d) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const now = new Date()
  const seasonYear = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1
  const endD = new Date(now)
  endD.setDate(endD.getDate() + 300)

  const windows = []
  for (let cur = new Date(seasonYear, 6, 1); cur < endD; ) {
    const wStart = fmtYmd(cur)
    cur.setDate(cur.getDate() + 300)
    windows.push(`${wStart}-${cur > endD ? fmtYmd(endD) : fmtYmd(cur)}`)
  }

  const responses = await Promise.all(
    windows.map((w) =>
      fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${cfg.slug}/scoreboard?dates=${w}&limit=500`,
      ).then((res) => {
        if (!res.ok) throw new Error(`ESPN error ${res.status}`)
        return res.json()
      }),
    ),
  )

  const seen = new Set()
  const events = []
  for (const data of responses) {
    for (const e of data.events || []) {
      if (!e.competitions?.[0] || seen.has(e.id)) continue
      seen.add(e.id)
      events.push(parseCompetition(e.competitions[0], tz))
    }
  }
  assignRounds(events)
  return events.filter((m) => m.status !== 'post').sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchTenerifeCopa(tz) {
  const cfg = LEAGUES.copa
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${cfg.slug}/scoreboard?dates=${dateKey(-6)}-${dateKey(90)}&limit=200`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN error ${res.status}`)
  const data = await res.json()
  return (data.events || [])
    .filter((e) => e.competitions?.[0])
    .map((e) => parseCompetition(e.competitions[0], tz))
    .filter((m) => `${m.home.name} ${m.away.name}`.toLowerCase().includes('tenerife'))
}

const TVC_TEAMS = [
  { slug: 'tenerife', match: 'tenerife' },
  { slug: 'las-palmas', match: 'palmas' },
]

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
}

export function normTokens(s) {
  return decodeEntities(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !['club', 'deportivo', 'cf', 'fc', 'ud', 'cd', 'ad', 'sd', 'real'].includes(t))
}

// Partidos de Primera RFEF emitidos por el canal lineal "Primera Federación"
// de Movistar Plus+ según futbolenlatv.es
export async function fetchPrimeraRfefTv() {
  try {
    const res = await fetch('https://www.futbolenlatv.es/competicion/primera-division-rfef')
    if (!res.ok) return []
    const html = await res.text()
    const out = []
    for (const row of html.split(/<tr[\s>]/)) {
      const li = row.indexOf('listaCanales')
      if (li === -1) continue
      const startM = row.match(/itemprop="startDate"\s+content="([\d-]+)/)
      const nameM = row.match(/itemprop="name"\s+content="([^"]+)"/)
      if (!startM || !nameM) continue
      const end = row.indexOf('</ul>', li)
      const seg = end > -1 ? row.slice(li, end) : row.slice(li)
      if (!/(movistar|m\+|federaci)/i.test(seg.replace(/&[a-z#0-9]+;/gi, ''))) continue
      const [home, away] = decodeEntities(nameM[1]).split(/\s+-\s+/)
      if (!home || !away) continue
      out.push({ date: startM[1], h: normTokens(home), a: normTokens(away) })
    }
    return out
  } catch {
    return []
  }
}

export async function fetchDesignacionesTV() {
  const load = async (slug) => {
    try {
      const res = await fetch(`https://www.futbolenlatv.es/equipo/${slug}`)
      if (!res.ok) return new Set()
      const html = await res.text()
      const days = new Set()
      for (const row of html.split(/<tr[\s>]/)) {
        const li = row.indexOf('listaCanales')
        if (li === -1) continue
        const startM = row.match(/itemprop="startDate"\s+content="([\d-]+)/)
        if (!startM) continue
        const end = row.indexOf('</ul>', li)
        const seg = end > -1 ? row.slice(li, end) : row.slice(li)
        if (/tv\s*canaria/i.test(seg)) days.add(startM[1])
      }
      return days
    } catch {
      return new Set()
    }
  }
  const entries = await Promise.all(TVC_TEAMS.map((t) => load(t.slug)))
  return Object.fromEntries(TVC_TEAMS.map((t, i) => [t.slug, entries[i]]))
}

export async function fetchTenerife(tz) {
  const days = [-3, -2, -1, 0, 1, 2, 3, 4]
  const segunda = await Promise.all(
    days.map((o) => fetchScoreboard('segunda', dateKey(o), tz).catch(() => ({ events: [] }))),
  )
  const rfef2 = await fetchRfefBoard(LEAGUES.rfef2.fotmobId, tz).catch(() => null)
  const copa = await fetchTenerifeCopa(tz).catch(() => [])

  const hits = []
  const push = (m, league) => {
    const name = `${m.home.name} ${m.away.name}`.toLowerCase()
    // solo partidos aún no jugados (el seguimiento especial no muestra pasados)
    if (!name.includes('tenerife') || m.status === 'post') return
    const team = name.includes('palmas')
      ? 'las-palmas'
      : /\btenerife\s+b\b/.test(name)
        ? 'tenerife-b'
        : 'tenerife'
    hits.push({ ...m, league, team })
  }
  segunda.flatMap((s) => s.events).forEach((m) => push(m, 'Segunda'))
  if (rfef2) {
    rfef2.pasado.forEach((m) => push(m, '2ª RFEF'))
    rfef2.hoy.forEach((m) => push(m, '2ª RFEF'))
    rfef2.proximos.forEach((m) => push(m, '2ª RFEF'))
  }
  copa.forEach((m) => push(m, 'Copa del Rey'))
  return hits.sort((a, b) => a.date.localeCompare(b.date))
}

function parseEspnRow(entry) {
  const s = {}
  for (const st of entry.stats || []) s[st.type] = st.value ?? 0
  return {
    rank: s.rank,
    name: entry.team?.displayName || entry.team?.location || '?',
    logo: entry.team?.logos?.[0]?.href || '',
    played: s.gamesplayed,
    wins: s.wins,
    draws: s.ties,
    losses: s.losses,
    gd: s.pointdifferential,
    pts: s.points,
  }
}

export async function fetchStandings(league) {
  const cfg = LEAGUES[league]
  if (cfg.source === 'fotmob') {
    const ov = await fetchFotmobOverview(cfg.fotmobId, dateKey(0))
    const groups = []
    for (const g of ov.table?.[0]?.data?.tables || []) {
      const rows = (g.table?.all || []).map((r) => ({
        rank: r.idx,
        name: r.name || '?',
        logo: r.id ? `https://images.fotmob.com/image_resources/logo/teamlogo/${r.id}.png` : '',
        played: r.played,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        gd: r.goalConDiff,
        pts: r.pts,
      }))
      groups.push({ name: (g.leagueName || '').replace(/^Group\s+(\d+)$/i, 'Grupo $1'), rows })
    }
    return { league: ov.name, groups }
  }

  const url = `https://site.web.api.espn.com/apis/v2/sports/soccer/${cfg.slug}/standings`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN error ${res.status}`)
  const data = await res.json()
  const entries = data.children?.[0]?.standings?.entries || []
  return { league: data.children?.[0]?.name || cfg.name, groups: [{ name: '', rows: entries.map(parseEspnRow) }] }
}

export async function fetchRfefBoard(fotmobId, tz) {
  const today = dateKey(0)
  const current = await fetchFotmobOverview(fotmobId, today)
  const prevSeason = `${Number(current.season.slice(0, 4)) - 1}/${current.season.slice(5)}`
  const previous = await fetchFotmobOverview(fotmobId, `${prevSeason.replace('/', '')}15`)

  const matches = [...previous.matches, ...current.matches]
  const parsed = matches.map((m) => parseFotmobMatch(m, tz))
  const byDate = (s) => (s || '').slice(0, 10).replaceAll('-', '')

  const hoy = parsed.filter((m) => byDate(m.date) === today)
  const pasado = parsed
    .filter((m) => m.status === 'post')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
  const proximos = parsed
    .filter((m) => m.status !== 'post')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 20)

  return {
    league: current.name,
    hoy,
    pasado,
    proximos,
  }
}

const EVENT_TYPES = {
  'penalty---scored': 'goal',
  goal: 'goal',
  'yellow-card': 'yellow',
  'red-card': 'red',
  'second-yellow-card': 'red',
  substitution: 'sub',
}

export async function fetchMatchEvents(league, eventId) {
  const cfg = LEAGUES[league]
  if (cfg.source === 'fotmob') return fetchFotmobEvents(cfg.fotmobId, eventId)

  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${cfg.slug}/summary?event=${eventId}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN error ${res.status}`)
  const data = await res.json()
  const raw = data.keyEvents || []

  const comp = data.header?.competitions?.[0]
  const homeTeam = comp?.competitors?.[0]?.team
  const awayTeam = comp?.competitors?.[1]?.team
  const teamLogo = (t) => t?.logo || t?.logos?.[0]?.href || ''
  const homeNames = [homeTeam?.shortDisplayName, homeTeam?.displayName, homeTeam?.abbreviation].filter(Boolean)
  const awayNames = [awayTeam?.shortDisplayName, awayTeam?.displayName, awayTeam?.abbreviation].filter(Boolean)

  const events = []
  for (const ev of raw) {
    const rawType = ev.type?.type
    const type =
      EVENT_TYPES[rawType] ??
      (rawType === 'own-goal' || (rawType || '').startsWith('goal') ? 'goal' : null)
    if (!type) continue
    const teamName = ev.team?.displayName || ''
    const names = (ev.participants || []).map((p) => p?.athlete?.displayName || '')
    let player = names[0] || ''
    let text = ''
    if (rawType === 'substitution') {
      player = ''
      text = names[1] ? `Entra ${names[0]} por ${names[1]}` : `Entra ${names[0]}`
    } else if (rawType === 'penalty---scored') {
      if (player) player = `${player} (p)`
      text = 'Penalti convertido'
    } else if (rawType === 'own-goal') {
      if (player) player = `${player} (pp)`
      text = 'Gol en propia puerta'
    } else if (rawType === 'second-yellow-card') {
      if (player) player = `${player} (2ª amarilla)`
      text = 'Doble amarilla, roja'
    } else if (type === 'goal') {
      text = 'Gol'
    } else if (type === 'yellow') {
      text = 'Tarjeta amarilla'
    } else if (type === 'red') {
      text = 'Tarjeta roja'
    }
    events.push({
      type,
      minute: parseMinute(ev.clock?.displayValue),
      teamName,
      player,
      text,
      team: homeNames.includes(teamName) ? 'home' : awayNames.includes(teamName) ? 'away' : '',
    })
  }

  const side = (target) => events.filter((e) => e.team === target)
  const score = (target) => side(target).filter((e) => e.type === 'goal').length
  const goals = (target) =>
    side(target)
      .filter((e) => e.type === 'goal')
      .map((e) => ({ minute: e.minute, player: e.player, text: e.text }))
  const subs = (target) =>
    side(target)
      .filter((e) => e.type === 'sub')
      .map((e) => ({ minute: e.minute, text: e.text }))
  const cards = (target) =>
    side(target)
      .filter((e) => e.type === 'yellow' || e.type === 'red')
      .map((e) => ({ minute: e.minute, type: e.type, player: e.player }))

  return {
    home: {
      name: homeTeam?.displayName || 'Local',
      short: homeTeam?.shortDisplayName || '',
      logo: teamLogo(homeTeam),
      score: score('home'),
      goals: goals('home'),
      cards: cards('home'),
      subs: subs('home'),
    },
    away: {
      name: awayTeam?.displayName || 'Visitante',
      short: awayTeam?.shortDisplayName || '',
      logo: teamLogo(awayTeam),
      score: score('away'),
      goals: goals('away'),
      cards: cards('away'),
      subs: subs('away'),
    },
  }
}

async function fetchFotmobEvents(fotmobId, eventId) {
  const slug = await fotmobMatchSlug(eventId)
  if (!slug) return { home: { goals: [], cards: [], subs: [] }, away: { goals: [], cards: [], subs: [] } }
  const res = await fetch(fotmobUrl(`/matches/${slug}`), {
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126.0' },
  })
  if (!res.ok) throw new Error(`FotMob error ${res.status}`)
  const html = await res.text()
  const m = html.match(/id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
  if (!m) throw new Error('FotMob: no NEXT_DATA')
  const page = JSON.parse(m[1])
  const content = page.props?.pageProps?.content || {}
  const header = page.props?.pageProps?.header || {}

  const homeTeam = header.teams?.[0] || {}
  const awayTeam = header.teams?.[1] || {}
  const raw = content.matchFacts?.events?.events || []
  const events = []
  for (const ev of raw) {
    const type = FOTMOB_EVENT_TYPES[ev.type]
    if (!type) continue
    const player = ev.nameStr || ev.player?.name || ''
    events.push({
      type,
      minute: ev.timeStr ?? ev.time ?? 0,
      teamName: ev.isHome ? homeTeam.name : awayTeam.name,
      player,
      text: ev.goalDescription ? `${player} (${ev.goalDescription})` : ev.nameStr || '',
      team: ev.isHome ? 'home' : 'away',
    })
  }

  const side = (target) => events.filter((e) => e.team === target)
  const score = (target) => side(target).filter((e) => e.type === 'goal').length
  const goals = (target) =>
    side(target)
      .filter((e) => e.type === 'goal')
      .map((e) => ({ minute: e.minute, player: e.player, text: e.text }))
  const subs = (target) =>
    side(target)
      .filter((e) => e.type === 'sub')
      .map((e) => ({ minute: e.minute, text: e.text }))
  const cards = (target) =>
    side(target)
      .filter((e) => e.type === 'yellow' || e.type === 'red')
      .map((e) => ({ minute: e.minute, type: e.type, player: e.player }))

  return {
    home: {
      name: homeTeam.name || 'Local',
      short: '',
      logo: homeTeam.imageUrl || '',
      score: score('home'),
      goals: goals('home'),
      cards: cards('home'),
      subs: subs('home'),
    },
    away: {
      name: awayTeam.name || 'Visitante',
      short: '',
      logo: awayTeam.imageUrl || '',
      score: score('away'),
      goals: goals('away'),
      cards: cards('away'),
      subs: subs('away'),
    },
  }
}

async function fotmobMatchSlug(eventId) {
  const id = String(eventId)
  for (const data of fotmobCache.values()) {
    const found = data.matches.find((m) => String(m.id) === id)
    if (found) return found.pageUrl?.replace(/^\/matches\//, '').replace(/#.*/, '')
  }
  return null
}

function posShort(pos) {
  if (!pos) return '?'
  const p = pos.trim()
  const low = p.toLowerCase()
  if (low === 'g' || low.includes('goal') || low.includes('keeper')) return 'POR'
  if (p.length <= 5 && /^[A-Z-]+$/i.test(p)) return p.toUpperCase()
  if (low.includes('def') || low.includes('back')) return 'DEF'
  if (low.includes('mid')) return 'MED'
  if (low.includes('att') || low.includes('forw') || low.includes('wing') || low.includes('striker')) return 'DEL'
  if (low.includes('sub')) return 'SUP'
  return p.slice(0, 3).toUpperCase()
}

// Coordenadas normalizadas {x,y}: x=ancho (0 izq → 1 der), y=0 portería propia → 1 portería rival
// ESPN no da coordenadas: se deducen del lado (Left/Right/Center) y banda (DEF/MED/DEL) de posFull
function sideX(side, slot, total) {
  const base = side === 'left' ? 0.16 : side === 'right' ? 0.84 : 0.5
  if (total <= 1) return base
  const spread = side === 'center' ? 0.36 : 0.24
  return Math.min(0.92, Math.max(0.08, base - spread / 2 + (slot * spread) / (total - 1)))
}

function coordsFromFormation(starters) {
  const gk = starters.find((p) => /goal/i.test(p.posFull || '') || p.position === 'POR')
  const rest = starters.filter((p) => p !== gk)
  const out = []
  if (gk) out.push({ ...gk, x: 0.5, y: 0.05 })
  const bandOf = (p) => {
    const s = (p.posFull || '').toLowerCase()
    if (/back|defender/.test(s)) return 'def'
    if (/midfielder/.test(s)) return 'mid'
    return 'att'
  }
  const xSideOf = (p) => {
    const s = (p.posFull || '').toLowerCase()
    if (/left/.test(s)) return 'left'
    if (/right/.test(s)) return 'right'
    return 'center'
  }
  const groups = { def: [], mid: [], att: [] }
  for (const p of rest) groups[bandOf(p)].push(p)
  const yBand = { def: 0.26, mid: 0.54, att: 0.84 }
  for (const bandName of ['def', 'mid', 'att']) {
    const list = groups[bandName]
    // agrupa por lado manteniendo orden
    const bySide = { left: [], center: [], right: [] }
    list.forEach((p) => bySide[xSideOf(p)].push(p))
    let flat = []
    const maxLen = Math.max(bySide.left.length, bySide.center.length, bySide.right.length)
    for (let i = 0; i < maxLen; i++) {
      if (bySide.left[i]) flat.push({ p: bySide.left[i], side: 'left' })
      if (bySide.center[i]) flat.push({ p: bySide.center[i], side: 'center' })
      if (bySide.right[i]) flat.push({ p: bySide.right[i], side: 'right' })
    }
    const centers = flat.filter((f) => f.side === 'center').length
    let cSlot = 0
    flat.forEach(({ p, side }) => {
      let total = bySide[side].length
      let slot = side === 'center' ? cSlot++ : bySide[side].indexOf(p)
      let x = sideX(side, slot, total)
      if (side === 'center' && centers > 1) x = 0.34 + (cSlot - 1) * (0.32 / Math.max(1, centers - 1)) * 0.999
      out.push({ ...p, x, y: yBand[bandName] + ((slot % 2) * 0.03) })
    })
  }
  return out.slice(0, 11)
}

function coordsFromLayout(starters) {
  return starters.map((p) => {
    const v = p.layout?.vertical
    if (v && typeof v.y === 'number') {
      // FotMob: vertical.y=0 Portería propia arriba → nuestra y=0 es propia abajo (sin invertir)
      return { ...p, x: Math.min(0.94, Math.max(0.06, v.x ?? 0.5)), y: Math.min(0.96, Math.max(0.04, v.y)) }
    }
    return p
  })
}

export async function fetchEspnLineup(leagueKey, eventId, expectedDate) {
  try {
    const cfg = LEAGUES[leagueKey]
    if (!cfg?.slug) return { available: false, reason: 'no-slug' }
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${cfg.slug}/summary?event=${eventId}`
    const res = await fetch(url)
    if (!res.ok) return { available: false, reason: `http-${res.status}` }
    const data = await res.json()
    // guardia anti-mejera: el evento debe ser el del partido esperado
    const evDate = data.header?.competitions?.[0]?.date || ''
    if (expectedDate && evDate && evDate.slice(0, 10) !== expectedDate.slice(0, 10)) {
      return { available: false, reason: 'date-mismatch', eventDate: evDate }
    }
    const rosters = data.rosters || []
    if (!rosters.length) return { available: false, reason: 'no-roster' }
    const mapTeam = (r) => {
      const starters = (r.roster || [])
        .filter((p) => p.starter)
        .sort((a, b) => Number(a.formationPlace || 999) - Number(b.formationPlace || 999))
        .map((p) => ({
          jersey: p.jersey || '',
          name: p.athlete?.displayName || p.athlete?.shortName || '?',
          position: posShort(p.position?.abbreviation || p.position?.displayName),
          posFull: p.position?.displayName || '',
          place: p.formationPlace,
        }))
      const bench = (r.roster || [])
        .filter((p) => !p.starter)
        .map((p) => ({
          jersey: p.jersey || '',
          name: p.athlete?.displayName || '?',
          position: posShort(p.position?.abbreviation || p.position?.displayName),
        }))
      const team = {
        name: r.team?.displayName || '',
        id: r.team?.id || '',
        formation: r.formation || '',
        starters,
        bench,
      }
      return { ...team, starters: coordsFromFormation(starters) }
    }
    const home = rosters.find((r) => r.homeAway === 'home')
    const away = rosters.find((r) => r.homeAway === 'away')
    const count = (r) => (r?.roster?.filter((p) => p.starter).length || 0)
    const hasStarters = count(home) >= 10 || count(away) >= 10
    if (!hasStarters) return { available: false, reason: 'no-starters' }
    return {
      available: true,
      source: 'ESPN',
      sourceUrl: `https://www.espn.com/soccer/match/_/gameId/${eventId}`,
      eventDate: evDate,
      home: home ? mapTeam(home) : null,
      away: away ? mapTeam(away) : null,
    }
  } catch (e) {
    return { available: false, reason: 'network', error: String(e) }
  }
}

// Busca el evento de FotMob por equipos + fecha (los IDs de ESPN y FotMob no coinciden)
async function findFotmobEvent(fotmobId, expectedDate, homeName, awayName) {
  if (!expectedDate) return null
  const season = fotmobSeason(expectedDate.replaceAll('-', '').slice(0, 8))
  let all = []
  try {
    const fx = await fetchFotmobPage(fotmobId, season, 'fixtures')
    all = all.concat(fx.props?.pageProps?.fixtures?.allMatches || [])
    indexFotmobSlugs(all)
  } catch {}
  try {
    const ov = await fetchFotmobPage(fotmobId, season, 'overview')
    all = all.concat(ov.props?.pageProps?.overview?.leagueOverviewMatches || [])
    indexFotmobSlugs(all)
  } catch {}
  const day = expectedDate.slice(0, 10)
  const h = normTokens(homeName || '')
  const a = normTokens(awayName || '')
  const hit = (tokens, name) => tokens.some((t) => name.includes(t))
  for (const m of all) {
    const utc = m.status?.utcTime || ''
    if (day && utc.slice(0, 10) !== day) continue
    const hn = (m.home?.name || '').toLowerCase()
    const an = (m.away?.name || '').toLowerCase()
    if ((hit(h, hn) && hit(a, an)) || (hit(h, an) && hit(a, hn))) return m
  }
  return null
}

export async function fetchFotmobLineup(fotmobId, eventId, expectedDate, homeName, awayName) {
  try {
    let slug = (await fotmobMatchSlug(eventId)) || (await resolveFotmobSlug(fotmobId, eventId, expectedDate))
    if (!slug && (homeName || awayName)) {
      const fm = await findFotmobEvent(fotmobId, expectedDate, homeName, awayName)
      if (fm?.pageUrl) slug = fm.pageUrl.replace(/^\/matches\//, '').replace(/#.*/, '')
    }
    if (!slug) return { available: false, reason: 'no-slug' }
    const res = await fetch(fotmobUrl(`/matches/${slug}`), {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126.0' },
    })
    if (!res.ok) return { available: false, reason: `http-${res.status}` }
    const html = await res.text()
    const m = html.match(/id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)
    if (!m) return { available: false, reason: 'no-data' }
    const page = JSON.parse(m[1])
    const props = page.props?.pageProps || {}
    const lineup = props.content?.lineup
    // guardia anti-mejera: la fecha del evento debe coincidir con el partido esperado
    const evDate = props.header?.status?.utcTime || ''
    if (expectedDate && evDate && evDate.slice(0, 10) !== expectedDate.slice(0, 10)) {
      return { available: false, reason: 'date-mismatch', eventDate: evDate }
    }
    // Solo aceptar el XI publicado para ESTE partido: 'lastStarting11' es una
    // vista previa de FotMob con el XI del último partido ya disputado.
    const luType = lineup?.lineupType
    const publishedForMatch = !luType || luType === 'confirmed' || luType === 'standard'
    if (!lineup || !publishedForMatch || !lineup.homeTeam) {
      return { available: false, reason: 'no-lineup' }
    }
    const map = (team) => {
      const starters = (team.starters || []).map((p) => ({
        jersey: p.shirtNumber || '',
        name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        position: '',
        posFull: '',
        place: '',
        layout: { vertical: p.verticalLayout || null },
      }))
      return {
        name: team.name || '',
        formation: team.formation || '',
        starters: coordsFromLayout(starters),
        bench: (team.bench || []).map((p) => ({
          jersey: p.shirtNumber || '',
          name: p.name || '',
          position: '',
        })),
      }
    }
    return {
      available: true,
      source: 'FotMob',
      sourceUrl: `https://www.fotmob.com/matches/${slug}`,
      eventDate: evDate,
      home: map(lineup.homeTeam),
      away: map(lineup.awayTeam),
    }
  } catch (e) {
    return { available: false, reason: 'network', error: String(e) }
  }
}

// Doble fuente con verificación cruzada: si ESPN y FotMob coinciden → verified.
// La fecha del evento se valida contra el partido para no mostrar XIs de otra jornada.
export async function fetchLineup(leagueKey, eventId, expectedDate, homeName, awayName) {
  const cfg = LEAGUES[leagueKey]
  if (!cfg) throw new Error('Liga desconocida')
  const jobs = []
  if (cfg.slug) jobs.push(fetchEspnLineup(leagueKey, eventId, expectedDate))
  if (cfg.fotmobId && cfg.source !== 'espn') {
    jobs.push(fetchFotmobLineup(cfg.fotmobId, eventId, expectedDate))
  } else if (cfg.fotmobId) {
    // liga ESPN con id FotMob conocido: resolver evento por equipos+fecha
    jobs.push(fetchFotmobLineup(cfg.fotmobId, null, expectedDate, homeName, awayName))
  }
  const settled = await Promise.allSettled(jobs)
  const results = settled.map((r) => (r.status === 'fulfilled' ? r.value : null)).filter(Boolean)
  const ok = results.filter((r) => r.available)

  if (ok.length === 0) {
    const rank = ['no-starters', 'no-lineup', 'no-roster', 'no-data', 'no-slug', 'date-mismatch']
    let reason = results[0]?.reason || 'network'
    for (const r of rank) {
      if (results.some((x) => x.reason === r)) {
        reason = r
        break
      }
    }
    return { available: false, reason, fetchedAt: Date.now() }
  }

  // preferir FotMob como primaria (coordenadas reales del campo)
  ok.sort((a, b) => {
    const fa = a.source === 'FotMob' ? 0 : 1
    const fb = b.source === 'FotMob' ? 0 : 1
    return fa - fb || Boolean(b.eventDate) - Boolean(a.eventDate)
  })
  const primary = ok[0]
  let verified = false
  if (ok.length >= 2 && primary.eventDate && ok[1].eventDate) {
    verified = sameXi(primary, ok[1])
  }
  return {
    ...primary,
    source: ok.map((r) => r.source).join(' + '),
    verified,
    sourcesCount: ok.length,
    fetchedAt: Date.now(),
  }
}

function sameXi(a, b) {
  const names = (t) => (t?.starters || []).map((p) => normTokens(p.name).join(' ')).sort().join('|')
  if (!a?.home || !b?.home) return false
  const aHomeIsT = a.home.name.toLowerCase().includes('tenerife')
  const bHomeIsT = b.home.name.toLowerCase().includes('tenerife')
  const at = aHomeIsT ? a.home : a.away
  const bt = bHomeIsT ? b.home : b.away
  if (!at || !bt) return false
  const n1 = names(at)
  const n2 = names(bt)
  if (!n1 || !n2) return false
  const s1 = new Set(n1.split('|'))
  const inter = n2.split('|').filter((n) => s1.has(n)).length
  return inter >= 9
}

// convenience for Tenerife: deduce leagueKey from label
export function leagueKeyFromLabel(label) {
  const l = (label || '').toLowerCase()
  if (l.includes('segunda') && !l.includes('rfef')) return 'segunda'
  if (l.includes('1ª') || l.includes('primera rfef') || l.includes('1a')) return 'rfef1'
  if (l.includes('2ª') || l.includes('2a') || l.includes('segunda rfef')) return 'rfef2'
  if (l.includes('copa')) return 'copa'
  if (l.includes('primera') && !l.includes('rfef')) return 'primera'
  return 'segunda'
}

function parseMinute(display) {
  const m = (display || '').match(/(\d+)\+?/)
  return m ? Number(m[1]) : 0
}

export function dateKey(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export { LEAGUES, TIMEZONES, toLocal }
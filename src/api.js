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

function fotmobSeason(dateStr) {
  const y = Number(dateStr.slice(0, 4))
  const m = Number(dateStr.slice(4, 6))
  return m >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

async function fetchFotmobPage(fotmobId, season, kind) {
  const url = `https://www.fotmob.com/leagues/${fotmobId}/${kind}?season=${encodeURIComponent(season)}`
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

  const groupById = {}
  const roundById = {}
  try {
    const fixPage = await fetchFotmobPage(fotmobId, season, 'fixtures')
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
    if (name.includes('tenerife')) {
      const team = name.includes('palmas') ? 'las-palmas' : 'tenerife'
      hits.push({ ...m, league, team })
    }
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
  const res = await fetch(`https://www.fotmob.com/matches/${slug}`, {
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
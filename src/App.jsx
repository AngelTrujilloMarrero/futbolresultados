import { useEffect, useRef, useState } from 'react'
import {
  fetchScoreboard,
  fetchRfefBoard,
  fetchTenerife,
  fetchStandings,
  fetchSeasonCalendar,
  fetchDesignacionesTV,
  fetchPrimeraRfefTv,
  fetchMatchEvents,
  fetchLineup,
  leagueKeyFromLabel,
  normTokens,
  dateKey,
  toTimeLabel,
  toDateLabel,
  LEAGUES,
  TIMEZONES,
} from './api'
import './App.css'

function ScoreBlock({ team }) {
  return (
    <div className="team">
      <img className="logo" src={team.logo} alt={team.name} loading="lazy" />
      <span className="team-name">{team.name}</span>
    </div>
  )
}

function isTvcMatch(designaciones, m) {
  if (!m?.date) return false
  const name = `${m.home.name} ${m.away.name}`.toLowerCase()
  const key = name.includes('tenerife') ? 'tenerife' : name.includes('palmas') ? 'las-palmas' : null
  if (!key || !designaciones[key]) return false
  return designaciones[key].has(m.date.slice(0, 10))
}

function isMovistarRfef1(list, m) {
  if (!m?.date) return false
  const dk = m.date.slice(0, 10)
  const cands = (list || []).filter((x) => x.date === dk)
  if (!cands.length) return false
  const th = normTokens(m.home.name)
  const ta = normTokens(m.away.name)
  const hit = (a, b) => a.some((t) => b.includes(t))
  return cands.some((c) => (hit(th, c.h) && hit(ta, c.a)) || (hit(th, c.a) && hit(ta, c.h)))
}

const MovistarBadge = () => (
  <span className="mv-badge" title="Emitido en el canal Primera Federación de Movistar Plus+ (dial 53)">
    <span className="badge-long">Movistar 1ª RFEF</span>
    <span className="badge-short">M+</span>
  </span>
)

function TvcBadge() {
  return (
    <span className="tvc-badge" title="Designado en TV Canaria">
      <img src="/tv-canaria.svg" alt="TV Canaria" loading="lazy" />
      <span className="badge-long">TV Canaria</span>
    </span>
  )
}

function MatchCard({ match, onSelect, expanded, tvc, mov }) {
  const isLive = match.status === 'in'
  const isFinal = match.status === 'post'
  const interactive = isLive || isFinal
  return (
    <div
      className={`match${interactive ? ' clickable' : ''}${expanded ? ' expanded' : ''}`}
      onClick={interactive ? () => onSelect(match) : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => e.key === 'Enter' && onSelect(match) : undefined}
    >
      <div className="match-date">
        {match.group ? <span className="group-chip">{match.group}</span> : null}
        {isLive ? <span className="live-dot" /> : null}
        <span>{isFinal ? 'Final' : isLive ? `EN VIVO ${match.clock}` : match.dateLabel}</span>
        {tvc ? <TvcBadge /> : null}
        {mov ? <MovistarBadge /> : null}
      </div>
      <div className="teams">
        <ScoreBlock team={match.home} />
        <div className="score">
          {isLive || isFinal ? (
            <span className="score-num">
              {match.home.score} - {match.away.score}
            </span>
          ) : (
            <span className="vs">vs</span>
          )}
        </div>
        <ScoreBlock team={match.away} />
      </div>
      {match.venue ? <div className="venue">{match.venue}</div> : null}
      {interactive ? (
        <div className="hint">{expanded ? '▲ Ocultar detalles' : '▼ Ver detalles (goles, tarjetas, cambios)'}</div>
      ) : null}
    </div>
  )
}

function EventList({ title, items, empty }) {
  if (!items.length) return null
  return (
    <div className="events">
      <h4>{title}</h4>
      {items.map((it, i) => (
        <div key={i} className="event">
          <span className="min">{it.minute}'</span>
          {it.player ? <strong>{it.player}</strong> : <span>{it.text}</span>}
        </div>
      ))}
      {!items.length && empty ? <span className="empty">{empty}</span> : null}
    </div>
  )
}

const PITCH_W = 600
const PITCH_H = 400

// Convierte coords normalizadas del XI a puntos del campo 600x400 (local ataca →, visitante ←)
function xiPoints(home, away) {
  const pts = []
  const safe = (n) => Math.min(0.96, Math.max(0.04, Number(n) || 0.5))
  home?.starters?.forEach((p) =>
    pts.push({ ...p, cx: 16 + safe(p.y) * 276, cy: 22 + safe(p.x) * 356, side: 'home' }),
  )
  away?.starters?.forEach((p) =>
    pts.push({ ...p, cx: PITCH_W - 16 - safe(p.y) * 276, cy: 22 + safe(p.x) * 356, side: 'away' }),
  )
  return pts
}

// Nombre corto para la camiseta: apellido; si se repite, inicial + apellido
function xiShortName(name, dupes) {
  const parts = (name || '?').trim().split(/\s+/)
  const last = parts[parts.length - 1]
  if (dupes?.has(last) && parts.length > 1) {
    return `${parts[0][0].toUpperCase()}. ${last}`
  }
  return last
}

function XIDots({ home, away }) {
  const pts = xiPoints(home, away)
  if (!pts.length) return null
  const counts = new Map()
  pts.forEach((p) => {
    const last = (p.name || '?').trim().split(/\s+/).pop()
    counts.set(last, (counts.get(last) || 0) + 1)
  })
  const dupes = new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k))
  return (
    <g className="xi-dots">
      {pts.map((p, i) => (
        <g key={`xi-${i}`}>
          <title>{`#${p.jersey} ${p.name}`}</title>
          <circle cx={p.cx} cy={p.cy} r={12} fill={p.side === 'home' ? 'var(--team-home)' : 'var(--team-away)'} stroke="#fff" strokeWidth={1.5} opacity={0.92} />
          <text className="pitch-label" x={p.cx} y={p.cy + 4} textAnchor="middle" fontSize={11}>
            {p.jersey}
          </text>
          <text className="pitch-label xi-player-name" x={p.cx} y={p.cy + 26} textAnchor="middle" fontSize={10.5}>
            {xiShortName(p.name, dupes)}
          </text>
        </g>
      ))}
    </g>
  )
}

function markerPos(type, side, index) {
  const spread = (i, n, start) => start + ((i % n) * 37) % 260
  if (type === 'goal') {
    const x = side === 'home' ? 500 : 100
    return { x, y: 60 + spread(index, 6, 0) }
  }
  if (type === 'sub') {
    const x = 160 + ((index * 43) % 280)
    return { x, y: side === 'home' ? 30 : 370 }
  }
  const x = 240 + ((index * 29) % 120)
  return { x, y: 80 + spread(index, 5, 0) }
}

function Pitch({ home, away, xi }) {
  const markers = []
  const push = (items, type, side) =>
    items.forEach((it, i) => {
      const pos = markerPos(type, side, i)
      const color =
        type === 'goal'
          ? '#22c55e'
          : type === 'sub'
            ? side === 'home'
              ? 'var(--team-home)'
              : 'var(--team-away)'
            : it.type === 'red'
              ? '#ef4444'
              : '#facc15'
      const symbol =
        type === 'goal' ? '⚽' : type === 'sub' ? (side === 'home' ? '▲' : '▼') : '▮'
      markers.push({ ...pos, type, symbol, color, minute: it.minute, player: it.player || it.text })
    })
  push(home.goals, 'goal', 'home')
  push(home.cards, 'card', 'home')
  push(home.subs, 'sub', 'home')
  push(away.goals, 'goal', 'away')
  push(away.cards, 'card', 'away')
  push(away.subs, 'sub', 'away')
  markers.sort((a, b) => a.minute - b.minute)

  const rect = (x, y, w, h) => <rect x={x} y={y} width={w} height={h} fill="none" stroke="var(--pitch-line)" strokeWidth={2} />
  return (
    <div className="pitch">
      <svg viewBox={`0 0 ${PITCH_W} ${PITCH_H}`} role="img" aria-label="Campo con goles, tarjetas y cambios">
        <rect width={PITCH_W} height={PITCH_H} fill="var(--pitch-green)" />
        <g stroke="var(--pitch-line)" strokeWidth={2} fill="none">
          <rect x={2} y={2} width={PITCH_W - 4} height={PITCH_H - 4} rx={4} />
          <line x1={PITCH_W / 2} y1={0} x2={PITCH_W / 2} y2={PITCH_H} />
          <circle cx={PITCH_W / 2} cy={PITCH_H / 2} r={45} />
          <circle cx={PITCH_W / 2} cy={PITCH_H / 2} r={2} fill="var(--pitch-line)" />
          {rect(4, 140, 80, 120)}
          {rect(PITCH_W - 84, 140, 80, 120)}
          {rect(4, 110, 16, 180)}
          {rect(PITCH_W - 20, 110, 16, 180)}
        </g>
        {xi?.available ? <XIDots home={xi.home} away={xi.away} /> : null}
        {markers.map((m, i) => (
          <g key={i} className="pitch-marker">
            <title>{`${m.minute}' ${m.player}`}</title>
            {m.type === 'sub' ? (
              <g>
                <circle cx={m.x} cy={m.y} r={12} fill={m.color} opacity={0.95} />
                <text className="pitch-label" x={m.x} y={m.y + 4} textAnchor="middle" fontSize={12}>
                  {m.symbol}
                </text>
                <text className="pitch-label" x={m.x} y={m.y + 24} textAnchor="middle" fontSize={10}>
                  {m.minute}'
                </text>
              </g>
            ) : m.type === 'goal' ? (
              <g>
                <circle cx={m.x} cy={m.y} r={13} fill="#fff" stroke={m.color} strokeWidth={3} />
                <text x={m.x} y={m.y + 5} textAnchor="middle" fontSize={13}>
                  {m.symbol}
                </text>
                <text className="pitch-label" x={m.x} y={m.y + 26} textAnchor="middle" fontSize={10}>
                  {m.minute}'
                </text>
              </g>
            ) : (
              <g>
                <rect
                  x={m.x - 8}
                  y={m.y - 11}
                  width={16}
                  height={22}
                  rx={3}
                  fill={m.color}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
                <text className="pitch-label" x={m.x} y={m.y + 4} textAnchor="middle" fontSize={11}>
                  {m.minute}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
      <div className="pitch-legend">
        <span><span style={{ color: '#22c55e' }}>⚽</span> Gol</span>
        <span><span style={{ color: '#facc15' }}>▮</span> Amarilla</span>
        <span><span style={{ color: '#ef4444' }}>▮</span> Roja</span>
        <span><span style={{ color: 'var(--team-home)' }}>▲</span> Cambio local</span>
        <span><span style={{ color: 'var(--team-away)' }}>▼</span> Cambio visitante</span>
        {xi?.available ? (
          <>
            <span><span className="legend-xi legend-xi-home">●</span> XI local</span>
            <span><span className="legend-xi legend-xi-away">●</span> XI visitante</span>
          </>
        ) : null}
      </div>
    </div>
  )
}

function MatchDetail({ match, league }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [xi, setXi] = useState(null)
  const isLive = match.status === 'in'

  useEffect(() => {
    let active = true
    const load = () =>
      fetchMatchEvents(league, match.id)
        .then((d) => {
          if (!active) return
          setData(d)
          setError(null)
          setLastUpdate(new Date())
        })
        .catch(() => active && setError('No se pudieron cargar los eventos.'))

    load()
    // XI inicial sobre el mapa (una sola carga; se reintenta si aún no está publicado)
    const loadXi = () =>
      fetchLineup(league, match.id, match.date, match.home.name, match.away.name)
        .then((d) => {
          if (active && d?.available) setXi(d)
          return d
        })
        .catch(() => null)
    loadXi().then((d) => {
      if (!active || d?.available) return
      const t = setInterval(() => {
        if (!active) return clearInterval(t)
        loadXi().then((r) => r?.available && clearInterval(t))
      }, 60000)
    })
    if (isLive) {
      const interval = setInterval(load, 20000)
      return () => {
        active = false
        clearInterval(interval)
      }
    }
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, match.id, isLive])

  return (
    <div className="details">
      <div className="modal-score">
        <span>{data ? data.home.name : match.home.name}</span>
        <strong>
          {data ? `${data.home.score} - ${data.away.score}` : `${match.home.score} - ${match.away.score}`}
        </strong>
        <span>{data ? data.away.name : match.away.name}</span>
      </div>
      {match.venue ? <div className="modal-venue">{match.venue}</div> : null}
      {isLive && lastUpdate ? (
        <div className="live-update">
          <span className="live-dot" /> EN VIVO · actualización cada 20s
        </div>
      ) : null}

      {error ? <p className="msg error">{error}</p> : null}
      {!data && !error ? <p className="msg">Cargando eventos…</p> : null}
      {data ? (
        <>
          <Pitch home={data.home} away={data.away} xi={xi} />
          <div className="modal-grid">
            <div>
              <EventList title="Goles" items={data.home.goals} empty="Sin goles" />
              <EventList title="Tarjetas" items={data.home.cards} empty="Sin tarjetas" />
              <EventList title="Cambios" items={data.home.subs} empty="Sin cambios" />
            </div>
            <div>
              <EventList title="Goles" items={data.away.goals} empty="Sin goles" />
              <EventList title="Tarjetas" items={data.away.cards} empty="Sin tarjetas" />
              <EventList title="Cambios" items={data.away.subs} empty="Sin cambios" />
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

function Standings({ standings }) {
  const { groups, loading, error } = standings
  if (loading) return <p className="msg">Cargando clasificación…</p>
  if (error) return <p className="msg error">{error}</p>
  if (!groups.length) return <p className="msg">Sin datos de clasificación.</p>
  return (
    <div className="standings">
      {groups.map((g, gi) => (
        <div key={gi} className="standings-group">
          {g.name ? <h3>{g.name}</h3> : null}
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Equipo</th>
                <th>PJ</th>
                <th>G</th>
                <th>E</th>
                <th>P</th>
                <th>DG</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={`${gi}-${r.name}`} className={r.name.toLowerCase().includes('tenerife') ? 'tenerife-row' : ''}>
                  <td>{r.rank}</td>
                  <td className="standings-team">
                    {r.logo ? <img src={r.logo} alt="" loading="lazy" /> : null}
                    <span>{r.name}</span>
                  </td>
                  <td>{r.played}</td>
                  <td>{r.wins}</td>
                  <td>{r.draws}</td>
                  <td>{r.losses}</td>
                  <td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                  <td className="pts">{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

const groupOrder = (g) => {
  const n = g && g.match(/\d+/)
  return n ? Number(n[0]) : Infinity
}

const groupColorClass = (g) => {
  const n = g && g.match(/\d+/)
  return n ? `cal-group-${n[0]}` : ''
}

function CalendarView({ state, designaciones, rfef1tv }) {
  const { sections, loading, error } = state
  if (loading) return <p className="msg">Cargando calendario…</p>
  if (error) return <p className="msg error">{error}</p>
  if (!sections.length) return <p className="msg">No quedan partidos programados esta temporada.</p>
  return (
    <div className="calendar">
      {sections.map((sec, i) => (
        <div key={i} className="cal-section">
          {sec.round ? (
            <h3 className="cal-round">
              <span className="cal-round-label">Jornada</span> {sec.round}
            </h3>
          ) : null}
          {sec.days.map((day) => (
            <section key={day.key} className="cal-day">
              <h4>{day.label}</h4>
              {day.blocks.map((b, bi) =>
                sec.groups > 1 && b.group ? (
                  <div key={bi} className="cal-block">
                    <div className={`cal-group-name ${groupColorClass(b.group)}`}>{b.group}</div>
                    {b.matches.map((m) => (
                      <MatchRow
                        key={m.id}
                        match={m}
                        tvc={isTvcMatch(designaciones, m)}
                        mov={isMovistarRfef1(rfef1tv, m)}
                      />
                    ))}
                  </div>
                ) : (
                  b.matches.map((m) => (
                    <MatchRow
                      key={m.id}
                      match={m}
                      chip={sec.groups > 1 ? null : m.group}
                      tvc={isTvcMatch(designaciones, m)}
                      mov={isMovistarRfef1(rfef1tv, m)}
                    />
                  ))
                ),
              )}
            </section>
          ))}
        </div>
      ))}
    </div>
  )
}

function MatchRow({ match: m, chip, tvc, mov }) {
  return (
    <div className="cal-match">
      {chip ? <span className={`group-chip ${groupColorClass(chip)}`}>{chip}</span> : null}
      <img src={m.home.logo} alt="" loading="lazy" />
      <span className="cal-team home">{m.home.name}</span>
      <strong className="cal-time">{toTimeLabel(m.date)}</strong>
      <span className="cal-team">{m.away.name}</span>
      <img src={m.away.logo} alt="" loading="lazy" />
      {tvc ? <TvcBadge /> : null}
      {mov ? <MovistarBadge /> : null}
    </div>
  )
}

function TenerifeLineup({ match }) {
  const [open, setOpen] = useState(false)
  const [lineup, setLineup] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const isTenerifeHome = (match.home.name || '').toLowerCase().includes('tenerife')
  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const key = leagueKeyFromLabel(match.league)
      // fecha + equipos: activan la guardia anti-mejera y la resolución cruzada FotMob
      const data = await fetchLineup(key, match.id, match.date, match.home.name, match.away.name)
      setLineup(data)
      if (!data.available) {
        const r = data.reason || ''
        if (r === 'no-slug' || r === 'no-lineup') setError('XI aún no publicado (se publica ~60 min antes)')
        else if (r === 'no-roster' || r === 'no-starters') setError('XI aún no disponible en la fuente')
        else if (r === 'network' || r.startsWith('http')) setError('Fuente temporalmente no disponible')
        else setError('XI aún no disponible')
      }
    } catch {
      setError('No se pudo cargar el XI')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (next && !lineup && !loading) load()
  }

  // Background polling: 10' antes ya hay XI en fuentes oficiales →
  // si faltan <90' para el inicio (o el partido está en vivo), intentar cargar
  // en segundo plano cada 30s y auto-abrir cuando se detecte.
  // La ventana de recuperación no se cierra al poco del saque: se mantiene
  // hasta 4h después para que un intento fallido previo se recupere solo.
  useEffect(() => {
    if (lineup?.available) return
    if (match.status === 'post') return
    const checkWindow = () => {
      const diffMs = new Date(match.date).getTime() - Date.now()
      const diffMin = diffMs / 60000
      if (match.status === 'in') return true
      return diffMin < 90 && diffMin > -240
    }
    if (!checkWindow()) return
    // carga inicial en segundo plano si aún no hay datos
    if (!lineup && !loading) load()
    const id = setInterval(() => {
      if (!checkWindow()) return
      load()
    }, 30000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.date, match.status, lineup?.available])

  // auto-abrir UNA sola vez cuando aparece el XI (el cierre manual se respeta)
  const autoOpenedRef = useRef(false)
  useEffect(() => {
    if (!lineup?.available) {
      autoOpenedRef.current = false
      return
    }
    if (autoOpenedRef.current || open) return
    const diffMin = (new Date(match.date).getTime() - Date.now()) / 60000
    if ((diffMin < 60 && diffMin > -30) || match.status === 'in') {
      setOpen(true)
      autoOpenedRef.current = true
    }
  }, [lineup?.available, match.date, match.status, open])

  // auto-refresh si panel abierto y aún no hay XI
  useEffect(() => {
    if (!open) return
    if (lineup?.available) return
    if (match.status === 'post') return
    const ms = Date.now()
    const matchMs = new Date(match.date).getTime()
    const diffHours = (matchMs - ms) / 3600000
    if (diffHours > 36 || diffHours < -4) return
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lineup, match.date, match.status])

  // identify Tenerife side
  const tenSide = lineup?.available
    ? lineup.home?.name?.toLowerCase().includes('tenerife')
      ? lineup.home
      : lineup.away?.name?.toLowerCase().includes('tenerife')
        ? lineup.away
        : isTenerifeHome
          ? lineup.home
          : lineup.away
    : null
  const rivalSide = lineup?.available
    ? tenSide === lineup.home
      ? lineup.away
      : lineup.home
    : null

  const xiReady = Boolean(lineup?.available)
  return (
    <div className="tenerife-xi">
      <button className={`xi-toggle ${open ? 'active' : ''} ${xiReady && !open ? 'xi-ready' : ''}`} onClick={handleToggle}>
        {open ? '▲ Ocultar XI' : xiReady ? '✓ Ver XI inicial' : '▼ Ver XI inicial'}
        {!open && !xiReady && match.status === 'pre' ? <span className="xi-hint">· se publica ~60' antes</span> : null}
        {!open && xiReady ? <span className="xi-hint xi-hint-ready">· ¡disponible!</span> : null}
      </button>
      {open ? (
        <div className="xi-panel">
          {loading ? <p className="xi-msg">Cargando XI inicial…</p> : null}
          {error && !loading ? (
            <div className="xi-msg">
              <p>{error}.</p>
              <span className="xi-sub">
                El XI oficial se publica unos 60 min antes en{' '}
                <a href="https://www.clubdeportivotenerife.es/noticias" target="_blank" rel="noreferrer">clubdeportivotenerife.es</a>{' '}
                y <a href="https://x.com/CDTOficial" target="_blank" rel="noreferrer">X @CDTOficial</a>.{' '}
                {(() => {
                  const k = leagueKeyFromLabel(match.league)
                  if (k === 'segunda' || k === 'copa' || k === 'primera') {
                    return (
                      <>
                        Ver también en{' '}
                        <a href={`https://www.espn.com/soccer/match/_/gameId/${match.id}`} target="_blank" rel="noreferrer">ESPN Match Center</a>{' '}
                      </>
                    )
                  }
                  if (k === 'rfef1' || k === 'rfef2') {
                    return (
                      <>
                        Ver también en{' '}
                        <a href="https://www.fotmob.com/teams/9867/overview/tenerife" target="_blank" rel="noreferrer">FotMob Tenerife</a>{' '}
                      </>
                    )
                  }
                  return null
                })()}
                · <button className="xi-retry" onClick={load}>Reintentar</button>
              </span>
              {lineup?.reason === 'network' ? (
                <p className="xi-sub" style={{ marginTop: 6 }}>
                  La fuente directa puede estar bloqueada por CORS en producción. En desarrollo (`npm run dev`) el proxy `/fotmob` evita el bloqueo.
                </p>
              ) : null}
            </div>
          ) : null}
          {lineup?.available && tenSide ? (
            <>
              <div className="xi-header">
                <span className="xi-team">XI CD Tenerife</span>
                {tenSide.formation ? <span className="xi-formation">{tenSide.formation}</span> : null}
                {lineup.verified ? <span className="xi-verified" title={`Coincide en ${lineup.sourcesCount} fuentes`}>✓ verificado</span> : null}
                <span className="xi-source">Fuente: <a href={lineup.sourceUrl} target="_blank" rel="noreferrer">{lineup.source}</a> · oficial <a href="https://www.clubdeportivotenerife.es" target="_blank" rel="noreferrer">CDT</a></span>
              </div>
              <div className="xi-context">
                {match.home.name} vs {match.away.name} · {new Date(match.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })} · {toTimeLabel(match.date)}
              </div>
              <div className="xi-board">
                <svg viewBox={`0 0 ${PITCH_W} ${PITCH_H}`} role="img" aria-label="XI en el campo">
                  <rect width={PITCH_W} height={PITCH_H} fill="var(--pitch-green)" />
                  <g stroke="var(--pitch-line)" strokeWidth={2} fill="none">
                    <rect x={2} y={2} width={PITCH_W - 4} height={PITCH_H - 4} rx={4} />
                    <line x1={PITCH_W / 2} y1={0} x2={PITCH_W / 2} y2={PITCH_H} />
                    <circle cx={PITCH_W / 2} cy={PITCH_H / 2} r={45} />
                  </g>
                  <XIDots home={lineup.home} away={lineup.away} />
                </svg>
                <div className="xi-board-labels">
                  <span style={{ color: 'var(--team-home)' }}>■ {lineup.home?.name}</span>
                  <span style={{ color: 'var(--team-away)' }}>■ {lineup.away?.name}</span>
                </div>
              </div>
              <ol className="xi-list">
                {tenSide.starters.map((p, i) => (
                  <li key={i}>
                    <span className="xi-num">{p.jersey}</span>
                    <span className="xi-pos">{p.position || 'XI'}</span>
                    <span className="xi-name">{p.name}</span>
                  </li>
                ))}
              </ol>
              {tenSide.bench?.length ? (
                <details className="xi-bench">
                  <summary>Suplentes ({tenSide.bench.length})</summary>
                  <ul>
                    {tenSide.bench.map((p, i) => (
                      <li key={i}><span className="xi-num">{p.jersey}</span> {p.name}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {rivalSide?.starters?.length ? (
                <details className="xi-bench">
                  <summary>XI rival: {rivalSide.name} {rivalSide.formation ? `(${rivalSide.formation})` : ''}</summary>
                  <ol className="xi-list">
                    {rivalSide.starters.map((p, i) => (
                      <li key={i}><span className="xi-num">{p.jersey}</span> {p.name}</li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function TenerifeCard({ m, tvc }) {
  const isFinal = m.status === 'post'
  const isLive = m.status === 'in'
  const badgeable = m.league === 'Segunda' || m.league === 'Copa del Rey'
  const onTvc = tvc
  return (
    <div className="tenerife-item-wrap">
      <div className="tenerife-item">
        <span className="tenerife-league">{m.league}</span>
        <span className="tenerife-teams">
          {m.home.name} {isFinal || isLive ? `${m.home.score} - ${m.away.score}` : 'vs'} {m.away.name}
        </span>
        {badgeable ? (
          <span className={`tvc-chip ${onTvc ? 'tvc-si' : 'tvc-no'}`} title={onTvc ? 'Designado en TV Canaria' : 'Sin designación de TV Canaria'}>
            {onTvc ? 'Con TV Canaria' : 'Sin TV Canaria'}
          </span>
        ) : null}
        <span className="tenerife-date">{isFinal ? 'Final' : isLive ? `EN VIVO ${m.clock}` : m.dateLabel}</span>
      </div>
      <TenerifeLineup match={m} />
    </div>
  )
}

export default function App() {
  const [league, setLeague] = useState('primera')
  const [tab, setTab] = useState('hoy')
  const [expandedId, setExpandedId] = useState(null)
  const [lists, setLists] = useState({
    hoy: { events: [], loading: true, error: null },
    pasado: { events: [], loading: true, error: null },
    proximos: { events: [], loading: true, error: null },
  })
  const [calOpen, setCalOpen] = useState(false)
  const [calendar, setCalendar] = useState({ sections: [], loading: false, error: null })
  const [tenerife, setTenerife] = useState([])
  const [designaciones, setDesignaciones] = useState({ tenerife: new Set(), 'las-palmas': new Set() })
  const [rfef1tv, setRfef1tv] = useState([])
  const [standings, setStandings] = useState({ groups: [], loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    fetchTenerife(TIMEZONES.canarias)
      .then((hits) => !cancelled && setTenerife(hits))
      .catch(() => !cancelled && setTenerife([]))
    fetchDesignacionesTV()
      .then((d) => !cancelled && setDesignaciones(d))
      .catch(() => {})
    fetchPrimeraRfefTv()
      .then((l) => !cancelled && setRfef1tv(l))
      .catch(() => {})
    const interval = setInterval(() => {
      fetchTenerife(TIMEZONES.canarias)
        .then((hits) => !cancelled && setTenerife(hits))
        .catch(() => !cancelled && setTenerife([]))
      fetchDesignacionesTV()
        .then((d) => !cancelled && setDesignaciones(d))
        .catch(() => {})
      fetchPrimeraRfefTv()
        .then((l) => !cancelled && setRfef1tv(l))
        .catch(() => {})
    }, 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const offsets = { hoy: [0], pasado: [-3, -2, -1], proximos: [1, 2, 3, 4] }
    let cancelled = false
    const isRfef = LEAGUES[league].source === 'fotmob'

    const load = async () => {
      const base = {
        hoy: { events: [], loading: true, error: null },
        pasado: { events: [], loading: true, error: null },
        proximos: { events: [], loading: true, error: null },
      }
      if (!cancelled) setLists(base)
      try {
        fetchStandings(league)
          .then((st) => !cancelled && setStandings({ groups: st.groups, loading: false, error: null }))
          .catch(() => !cancelled && setStandings((prev) => ({ ...prev, loading: false, error: 'No se pudo cargar la clasificación.' })))
        if (isRfef) {
          const board = await fetchRfefBoard(LEAGUES[league].fotmobId, TIMEZONES.canarias)
          if (cancelled) return
          setLists({
            hoy: { events: board.hoy, loading: false, error: null },
            pasado: { events: board.pasado, loading: false, error: null },
            proximos: { events: board.proximos, loading: false, error: null },
          })
          return
        }

        const results = await Promise.all(
          Object.entries(offsets).map(async ([k, days]) => {
            const chunks = await Promise.all(
              days.map((o) => fetchScoreboard(league, dateKey(o), TIMEZONES.canarias).catch(() => ({ events: [] }))),
            )
            const events = chunks.flatMap((c) => c.events)
            return [k, { events, loading: false, error: null }]
          }),
        )
        if (cancelled) return
        const next = {}
        for (const [k, state] of results) {
          next[k] = state
        }
        setLists((prev) => ({ ...prev, ...next }))
      } catch {
        if (cancelled) return
        const err = { events: [], loading: false, error: 'Error al cargar datos. Reintenta en un momento.' }
        setLists({ hoy: err, pasado: err, proximos: err })
      }
    }

    load()
    const interval = setInterval(load, 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [league])

  useEffect(() => {
    if (!calOpen) return undefined
    let cancelled = false
    fetchSeasonCalendar(league, TIMEZONES.canarias)
      .then((events) => {
        if (cancelled) return
        const sections = []
        for (const m of events) {
          let sec = sections[sections.length - 1]
          if (!sec || (m.round != null && sec.round !== m.round)) {
            sec = { round: m.round ?? null, groups: new Set(), days: [] }
            sections.push(sec)
          }
          if (m.group) sec.groups.add(m.group)
          const key = m.date.slice(0, 10)
          let day = sec.days.find((d) => d.key === key)
          if (!day) {
            day = { key, label: toDateLabel(m.date), blocks: [] }
            sec.days.push(day)
          }
          let block = day.blocks.find((b) => b.group === (m.group || null))
          if (!block) {
            block = { group: m.group || null, matches: [] }
            day.blocks.push(block)
          }
          block.matches.push(m)
        }
        for (const sec of sections) {
          for (const day of sec.days) {
            day.blocks.sort((a, b) => groupOrder(a.group) - groupOrder(b.group))
          }
          sec.groups = sec.groups.size
        }
        setCalendar({ sections, loading: false, error: null })
      })
      .catch(() => {
        if (!cancelled) setCalendar({ sections: [], loading: false, error: 'No se pudo cargar el calendario.' })
      })
    return () => {
      cancelled = true
    }
  }, [calOpen, league])

  const list = lists[tab] ?? { events: [], loading: false, error: null }
  const shownEvents =
    tab === 'pasado' ? [...list.events].sort((a, b) => b.date.localeCompare(a.date)) : list.events

  const selectLeague = (l) => {
    setLeague(l)
    if (calOpen) setCalendar({ sections: [], loading: true, error: null })
  }

  return (
    <div className="app">
      {tenerife.length > 0 ? (
        <section className="tenerife">
          <h3>⭐ CD Tenerife</h3>
          <p className="tenerife-sub">Seguimiento especial · Segunda · 2ª RFEF · Copa del Rey · XI inicial ~60' antes</p>
          <div className="tenerife-list">
            {tenerife.map((m) => (
              <TenerifeCard key={`${m.league}-${m.id}`} m={m} tvc={isTvcMatch(designaciones, m)} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="cal-toggle">
        <button
          className={calOpen ? 'active' : ''}
          onClick={() => {
            if (!calOpen) setCalendar({ sections: [], loading: true, error: null })
            setCalOpen((v) => !v)
          }}
        >
          Calendario
        </button>
      </div>

      <nav className="league-tabs">
        <button
          className={league === 'primera' ? 'active' : ''}
          onClick={() => selectLeague('primera')}
        >
          Primera
        </button>
        <button
          className={league === 'segunda' ? 'active' : ''}
          onClick={() => selectLeague('segunda')}
        >
          Segunda
        </button>
        <button
          className={league === 'rfef1' ? 'active' : ''}
          onClick={() => selectLeague('rfef1')}
        >
          1ª RFEF
        </button>
        <button
          className={league === 'rfef2' ? 'active' : ''}
          onClick={() => selectLeague('rfef2')}
        >
          2ª RFEF
        </button>
      </nav>

      <nav className="tabs">
        <button
          className={!calOpen && tab === 'hoy' ? 'active' : ''}
          onClick={() => {
            setCalOpen(false)
            setTab('hoy')
          }}
        >
          Hoy
        </button>
        <button
          className={!calOpen && tab === 'proximos' ? 'active' : ''}
          onClick={() => {
            setCalOpen(false)
            setTab('proximos')
          }}
        >
          Próximos
        </button>
        <button
          className={!calOpen && tab === 'pasado' ? 'active' : ''}
          onClick={() => {
            setCalOpen(false)
            setTab('pasado')
          }}
        >
          Resultados
        </button>
        <button
          className={!calOpen && tab === 'clasificacion' ? 'active' : ''}
          onClick={() => {
            setCalOpen(false)
            setTab('clasificacion')
          }}
        >
          Clasificación
        </button>
      </nav>

      <main className="content">
        {calOpen ? (
          <CalendarView state={calendar} designaciones={designaciones} rfef1tv={rfef1tv} />
        ) : tab === 'clasificacion' ? (
          <Standings standings={standings} />
        ) : (
          <>
            {list.loading ? <p className="msg">Cargando…</p> : null}
            {list.error ? <p className="msg error">{list.error}</p> : null}
            {!list.loading && !list.error && shownEvents.length === 0 ? (
              <p className="msg">Sin partidos en este rango de fechas.</p>
            ) : null}
            <div className="matches">
              {shownEvents.map((m) => {
                const expanded = expandedId === m.id
                return (
                  <div key={m.id} className="match-item">
                    <MatchCard
                      match={m}
                      expanded={expanded}
                      onSelect={() => setExpandedId(expanded ? null : m.id)}
                      tvc={(tab === 'hoy' || tab === 'proximos') && isTvcMatch(designaciones, m)}
                      mov={
                        (tab === 'hoy' || tab === 'proximos') &&
                        league === 'rfef1' &&
                        isMovistarRfef1(rfef1tv, m)
                      }
                    />
                    {expanded ? (
                      <MatchDetail match={m} league={league} />
                    ) : null}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
import { useEffect, useState } from 'react'
import {
  fetchScoreboard,
  fetchRfefBoard,
  fetchTenerife,
  fetchStandings,
  fetchSeasonCalendar,
  fetchMatchEvents,
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

function MatchCard({ match, onSelect, expanded }) {
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
        {isFinal ? 'Final' : isLive ? `EN VIVO ${match.clock}` : match.dateLabel}
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

function Pitch({ home, away }) {
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
      </div>
    </div>
  )
}

function MatchDetail({ match, league }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
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
          <Pitch home={data.home} away={data.away} />
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

function CalendarView({ state }) {
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
                    <div className="cal-group-name">{b.group}</div>
                    {b.matches.map((m) => (
                      <MatchRow key={m.id} match={m} />
                    ))}
                  </div>
                ) : (
                  b.matches.map((m) => (
                    <MatchRow key={m.id} match={m} chip={sec.groups > 1 ? null : m.group} />
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

function MatchRow({ match: m, chip }) {
  return (
    <div className="cal-match">
      {chip ? <span className="group-chip">{chip}</span> : null}
      <img src={m.home.logo} alt="" loading="lazy" />
      <span className="cal-team home">{m.home.name}</span>
      <strong className="cal-time">{toTimeLabel(m.date)}</strong>
      <span className="cal-team">{m.away.name}</span>
      <img src={m.away.logo} alt="" loading="lazy" />
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
  const [standings, setStandings] = useState({ groups: [], loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    fetchTenerife(TIMEZONES.canarias)
      .then((hits) => !cancelled && setTenerife(hits))
      .catch(() => !cancelled && setTenerife([]))
    const interval = setInterval(() => {
      fetchTenerife(TIMEZONES.canarias)
        .then((hits) => !cancelled && setTenerife(hits))
        .catch(() => !cancelled && setTenerife([]))
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
          <p className="tenerife-sub">Seguimiento especial · Segunda y 2ª RFEF</p>
          <div className="tenerife-list">
            {tenerife.map((m) => {
              const isFinal = m.status === 'post'
              const isLive = m.status === 'in'
              return (
                <div key={`${m.league}-${m.id}`} className="tenerife-item">
                  <span className="tenerife-league">{m.league}</span>
                  <span className="tenerife-teams">
                    {m.home.name} {isFinal || isLive ? `${m.home.score} - ${m.away.score}` : 'vs'} {m.away.name}
                  </span>
                  <span className="tenerife-date">
                    {isFinal ? 'Final' : isLive ? `EN VIVO ${m.clock}` : m.dateLabel}
                  </span>
                </div>
              )
            })}
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
          <CalendarView state={calendar} />
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
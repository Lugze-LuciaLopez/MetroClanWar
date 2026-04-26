// Demo bridge: a localhost-only WebSocket server hosted inside the player-peer.
//
// The browser UI connects here to (a) trigger the static demo routes,
// (b) receive STATION_DETECTED ticks for the progression visual, and
// (c) see swarm events (own + peers') for live ranking/feedback.
//
// All actual game events are still produced via signEvent() and broadcast
// over the Hyperswarm topic — the WebSocket only carries UI hints and
// command messages.

import { WebSocketServer } from 'ws'
import { signEvent } from '../core/events/event-signer.js'
import { encode, MSG_TYPE } from './shared/protocol.js'
import { EventType } from '../core/events/event-types.js'
import { weekId } from '../core/weekly-engine/week-utils.js'
import { nowSecs } from '../core/weekly-engine/clock.js'
import { applyScoreCaps } from '../core/scoring/score-calculator.js'
import { saveIdentity } from '../core/crypto/identity.js'
import { demoRoutes, describeRoutes } from '../simulator/demo/routes.js'
import { runRoute } from '../simulator/demo/route-runner.js'

const FORWARDED_TYPES = new Set([
  EventType.METRO_SESSION_CONFIRMED,
  EventType.METRO_SESSION_REJECTED,
  EventType.SCORE_GRANTED,
  EventType.WEEKLY_RESULT,
  EventType.INVASION_RESULT,
  EventType.CLAN_MEMBERSHIP_CHANGED
])

export function startDemoBridge({
  port = 8787,
  swarm,
  broadcast,
  keypair,
  pid,
  identity,
  identityPath,
  linesData,
  stationsIndex,
  verbose = true
}) {
  const wss = new WebSocketServer({ port })
  const clients = new Set()
  const caps = { dailyTotal: 0, weeklyTotal: 0 }
  let activeRun = null

  // Read the clan freshly from the shared identity object every time we
  // need it. The player-peer can mutate identity.clanId at any moment
  // (assignClan via UI, or CLAN_MEMBERSHIP_CHANGED via swarm) and signing
  // must reflect the latest value. Caching the clan in a local variable
  // would silently produce events with the wrong clanId after a transfer.
  function currentClanId() {
    return identity?.clanId ?? null
  }

  // Running accumulator of events seen by this peer. Used to send a
  // STATE_SNAPSHOT to UIs when they connect, so a fresh page or a peer that
  // just joined the swarm starts with the current ranking already populated.
  // We collect score and rejection events and recompute the snapshot on
  // demand, which keeps the result self-consistent even if events arrive
  // out of order (e.g. a SCORE_GRANTED via sync followed by its rejection).
  const scoreEvents = []
  const weeklyResults = []
  const rejectedSessionIds = new Set()
  const seenEventIds = new Set()

  function recordEvent(event) {
    if (!event?.eventId) return
    if (seenEventIds.has(event.eventId)) return
    seenEventIds.add(event.eventId)
    if (event.type === EventType.SCORE_GRANTED) {
      scoreEvents.push(event)
    } else if (event.type === EventType.METRO_SESSION_REJECTED) {
      const sid = event.payload?.sessionId
      if (sid) rejectedSessionIds.add(sid)
    } else if (event.type === EventType.WEEKLY_RESULT) {
      weeklyResults.push(event)
    }
  }

  function latestWeeklyResult() {
    if (weeklyResults.length === 0) return null
    return weeklyResults.reduce((a, b) => (a.timestamp > b.timestamp ? a : b))
  }

  function buildSnapshot() {
    // Two parallel views: global (cumulative all-time) and current-week
    // (events submitted strictly after the most recent finalized WEEKLY_RESULT).
    // War clans are excluded from the weekly view because they have their
    // own war ranking — same rule the validator applies.
    const globalScores = {}
    const weeklyScores = {}
    let myTotalPoints = 0
    const includedEventIds = []

    const lastWR = latestWeeklyResult()
    const lastWeekId = lastWR?.weekId ?? null
    const warPair = lastWR?.payload?.nextWarPair ?? null
    const warClans = new Set([
      warPair?.attackerClanId,
      warPair?.defenderClanId
    ].filter(Boolean))

    for (const ev of scoreEvents) {
      const sid = ev.payload?.sessionId
      if (sid && rejectedSessionIds.has(sid)) continue
      const clan = ev.payload?.clanId
      const pts = ev.payload?.points ?? 0
      if (!clan || !pts) continue

      globalScores[clan] = (globalScores[clan] || 0) + pts
      if (ev.playerId === pid) myTotalPoints += pts

      const isCurrentWeek = !lastWeekId || (ev.weekId && ev.weekId > lastWeekId)
      if (isCurrentWeek && !warClans.has(clan)) {
        weeklyScores[clan] = (weeklyScores[clan] || 0) + pts
      }
      includedEventIds.push(ev.eventId)
    }
    if (lastWR) includedEventIds.push(lastWR.eventId)

    return {
      globalScores,
      weeklyScores,
      myTotalPoints,
      warClans: Array.from(warClans),
      warPair,
      latestWeeklyResult: lastWR ?? null,
      seenEventIds: includedEventIds
    }
  }

  if (verbose) console.log(`[demo-bridge] listening ws://localhost:${port}`)

  function sendAll(obj) {
    const msg = JSON.stringify(obj)
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg)
    }
  }

  function send(ws, obj) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj))
  }

  wss.on('connection', (ws) => {
    clients.add(ws)
    if (verbose) console.log('[demo-bridge] ui connected')
    send(ws, { type: 'HELLO', playerId: pid, clanId: currentClanId() })
    send(ws, { type: 'AVAILABLE_ROUTES', routes: describeRoutes() })
    send(ws, { type: 'STATE_SNAPSHOT', ...buildSnapshot() })

    ws.on('message', async (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (!msg?.action) return

      if (msg.action === 'reset') {
        sendAll({ type: 'RESET' })
        return
      }

      if (msg.action === 'assignClan') {
        await handleAssignClan(msg.clanId)
        return
      }

      if (msg.action === 'runRoute') {
        if (!currentClanId()) {
          send(ws, { type: 'ERROR', reason: 'Cap clan assignat encara' })
          return
        }
        await handleRunRoute(msg.routeId)
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
      if (verbose) console.log('[demo-bridge] ui disconnected')
    })
    ws.on('error', () => {})
  })

  async function handleAssignClan(requestedClan) {
    if (!requestedClan || !linesData[requestedClan]) {
      sendAll({ type: 'ERROR', reason: `Clan desconegut: ${requestedClan}` })
      return
    }
    if (currentClanId() === requestedClan) {
      // already set; just re-emit HELLO so the UI advances
      sendAll({ type: 'HELLO', playerId: pid, clanId: requestedClan })
      return
    }
    if (identity) {
      identity.clanId = requestedClan
      if (identityPath) {
        try {
          await saveIdentity(identity, identityPath)
          if (verbose) console.log(`[demo-bridge] clan assigned via UI: ${requestedClan} (saved)`)
        } catch (e) {
          if (verbose) console.warn('[demo-bridge] saveIdentity failed:', e.message)
        }
      }
    }
    sendAll({ type: 'HELLO', playerId: pid, clanId: requestedClan })
  }

  async function handleRunRoute(routeId) {
    const route = demoRoutes[routeId]
    if (!route) {
      sendAll({ type: 'ERROR', reason: `Ruta desconeguda: ${routeId}` })
      return
    }

    if (activeRun) {
      activeRun.stop()
      activeRun = null
    }

    sendAll({
      type: 'ROUTE_STARTED',
      routeId,
      label: route.label,
      lineId: route.lineId,
      totalStations: route.stations.length
    })

    // Note: we DO NOT pre-validate here. The player runs the route, signs the
    // events, and broadcasts them. The validator-peer is the one that catches
    // impossible routes and emits METRO_SESSION_REJECTED. This way the demo
    // shows the visual progression even for cheats — and the rejection alert
    // arrives a moment later from the network.

    const startTimestamp = nowSecs()
    activeRun = runRoute({
      route,
      stationsIndex,
      linesData,
      startTimestamp,
      onTick: tick => sendAll({ ...tick, source: 'self', routeId })
    })

    let result
    try {
      result = await activeRun.promise
    } catch (e) {
      if (verbose) console.error('[demo-bridge] run failed', e)
      return
    }
    activeRun = null

    const { sessionPayload, points: rawPoints } = result
    const { points, newDailyTotal, newWeeklyTotal } = applyScoreCaps(rawPoints, caps)
    caps.dailyTotal = newDailyTotal
    caps.weeklyTotal = newWeeklyTotal

    const tsConfirmed = sessionPayload.endTimestamp
    const confirmed = signEvent({
      schemaVersion: 1,
      type: EventType.METRO_SESSION_CONFIRMED,
      playerId: pid,
      timestamp: tsConfirmed,
      weekId: weekId(tsConfirmed),
      sequence: 0,
      prevHash: null,
      payload: sessionPayload
    }, keypair)

    const tsScore = tsConfirmed + 1
    const score = signEvent({
      schemaVersion: 1,
      type: EventType.SCORE_GRANTED,
      playerId: pid,
      timestamp: tsScore,
      weekId: weekId(tsScore),
      sequence: 0,
      prevHash: null,
      payload: {
        sessionId: sessionPayload.sessionId,
        lineId: sessionPayload.lineId,
        clanId: currentClanId(),
        points,
        reason: 'VALIDATED_METRO_SESSION'
      }
    }, keypair)

    broadcast(swarm, encode(MSG_TYPE.EVENT, confirmed))
    broadcast(swarm, encode(MSG_TYPE.EVENT, score))

    recordEvent(confirmed)
    recordEvent(score)

    sendAll({ ...confirmed, source: 'self' })
    sendAll({ ...score, source: 'self' })

    if (verbose) console.log(`[demo-bridge] published session ${sessionPayload.sessionId} (${points} pts)`)
  }

  function forwardSwarmEvent(event) {
    if (!event?.type || !FORWARDED_TYPES.has(event.type)) return

    // Always accumulate so the snapshot stays current — including own
    // events that come back via SYNC_RESPONSE on rejoin.
    recordEvent(event)

    // Side-effects on bridge state when certain events arrive:
    //   - CLAN_MEMBERSHIP_CHANGED for us → update identity and re-broadcast
    //     HELLO so all UI clients repaint clan colour, indicator and banner.
    //   - WEEKLY_RESULT → reset per-week point caps so the next week starts
    //     with a clean budget (otherwise applyScoreCaps would clamp every
    //     new SCORE_GRANTED to 0 once the weekly limit was hit).
    if (event.type === EventType.CLAN_MEMBERSHIP_CHANGED &&
        event.payload?.affectedPlayerId === pid &&
        event.payload?.toClanId) {
      if (identity) identity.clanId = event.payload.toClanId
      if (identityPath && identity) {
        saveIdentity(identity, identityPath).catch(() => {})
      }
      sendAll({ type: 'HELLO', playerId: pid, clanId: currentClanId() })
      if (verbose) console.log(`[demo-bridge] clan changed to ${event.payload.toClanId} via invasion`)
    }

    if (event.type === EventType.WEEKLY_RESULT) {
      caps.dailyTotal = 0
      caps.weeklyTotal = 0
    }

    if (event.playerId === pid) return // already sent as 'self' when it was created
    sendAll({ ...event, source: 'swarm' })
  }

  return { forwardSwarmEvent, close: () => wss.close() }
}

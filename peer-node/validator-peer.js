// Validator peer: always-on scoring authority.
// - Verifies all incoming events (signature + anti-cheat).
// - Computes WEEKLY_RESULT when the week ends (or on --compute-results flag).
// - Signs and broadcasts the result; stores it for late-joining peers.

import { createSwarm, onConnection, broadcast } from './shared/swarm-utils.js'
import { encode, decode, createLineReader, MSG_TYPE } from './shared/protocol.js'
import { EventStore } from './shared/event-store.js'
import { verifyEvent } from '../core/events/event-verifier.js'
import { buildWeeklyRanking, buildGlobalRanking, clanRanking } from '../core/scoring/ranking.js'
import { computeInvasionResult } from '../core/invasion/invasion-engine.js'
import { signEvent } from '../core/events/event-signer.js'
import { EventType } from '../core/events/event-types.js'
import { weekId, weekStart } from '../core/weekly-engine/week-utils.js'
import { nowSecs, getWeekOffset, setWeekOffset } from '../core/weekly-engine/clock.js'
import { generateKeypair, playerId, saveKeypair, loadKeypair } from '../core/crypto/identity.js'
import { validateStaticRoute } from '../simulator/demo/static-validator.js'
import { homedir } from 'os'
import { join } from 'path'
import { mkdir, readFile } from 'fs/promises'

const DEFAULT_STORE   = join(homedir(), '.metro-clan-war', 'validator-store')
const IDENTITY_PATH   = join(homedir(), '.metro-clan-war', 'validator-identity.json')

async function loadOrCreateKeypair(path) {
  const existing = await loadKeypair(path)
  if (existing) return existing
  const kp = generateKeypair()
  await mkdir(join(homedir(), '.metro-clan-war'), { recursive: true })
  await saveKeypair(kp, path)
  return kp
}

export async function startValidator({
  storePath = DEFAULT_STORE,
  identityPath = IDENTITY_PATH,
  computeResults = false,
  demo = false,
  demoPort = 8786,
  verbose = true
} = {}) {
  const keypair = await loadOrCreateKeypair(identityPath)
  const validatorId = playerId(keypair.publicKey)

  const store = new EventStore(storePath)
  await store.init()

  // Load metro graph data once for static-route validation.
  const linesData = JSON.parse(await readFile(new URL('../data/lines.json', import.meta.url), 'utf8'))
  const stationsArr = JSON.parse(await readFile(new URL('../data/stations.json', import.meta.url), 'utf8'))
  const stationsIndex = Object.fromEntries(stationsArr.map(s => [s.stationId, s]))
  const rejectedSessionIds = new Set()

  const { swarm } = createSwarm({ server: true, client: true })

  if (verbose) {
    console.log('[validator] starting, id:', validatorId.slice(0, 16) + '...')
    console.log('[validator] store:', storePath)
  }

  let bridge = null
  if (demo) {
    const { startValidatorBridge } = await import('./validator-bridge.js')
    bridge = startValidatorBridge({
      port: demoPort,
      validatorId,
      computeNow: async () => {
        const wid = weekId(nowSecs())
        const result = await computeAndPublish(wid, keypair, validatorId, store, swarm, verbose, bridge)
        // Auto-advance the validator's clock only if a WEEKLY_RESULT was
        // actually published — otherwise the players (which auto-advance on
        // receiving the WEEKLY_RESULT, see player-peer.js maybeAdvanceWeek)
        // would stay behind and the validator would drift.
        if (result) {
          const offsetWeeks = getWeekOffset() / (7 * 86400)
          setWeekOffset(offsetWeeks + 1)
          if (verbose) console.log(`[validator] week advanced to ${weekId(nowSecs())}`)
        }
        return result
      },
      verbose
    })
  }

  if (computeResults) {
    // Receive SYNC_RESPONSE from any peer (persistent validator/replica)
    // and persist those events to the local store before computing.
    onConnection(swarm, (conn) => {
      createLineReader(conn, async (line) => {
        const msg = decode(line)
        if (!msg) return
        if (msg.msgType === MSG_TYPE.SYNC_RESPONSE) {
          const events = msg.payload?.events ?? []
          const known = await store.knownIds()
          for (const event of events) {
            if (!event?.eventId || !event?.playerId) continue
            const { valid } = verifyEvent(event, Buffer.from(event.playerId, 'hex'))
            if (!valid) continue
            if (known.has(event.eventId)) continue
            await store.append(event)
            known.add(event.eventId)
          }
          if (verbose && events.length > 0) console.log(`[validator] synced ${events.length} events from peer`)
        }
      })
    })

    await swarm.flush()
    await new Promise(r => setTimeout(r, 2000))
    const total = (await store.readAll()).length
    if (verbose) console.log(`[validator] store has ${total} events`)
    const wid = weekId(nowSecs())
    await computeAndPublish(wid, keypair, validatorId, store, swarm, verbose)
    await swarm.destroy()
    process.exit(0)
  }

  onConnection(swarm, async (conn) => {
    if (verbose) console.log('[validator] peer connected')

    // Sync stored events to new peer
    const all = await store.readAll()
    if (all.length > 0) {
      conn.write(encode(MSG_TYPE.SYNC_RESPONSE, { events: all }))
    }

    createLineReader(conn, async (line) => {
      const msg = decode(line)
      if (!msg) return

      if (msg.msgType === MSG_TYPE.EVENT) {
        const event = msg.payload
        if (!event?.eventId || !event?.playerId) return

        if (bridge) bridge.notifyReceived(event)

        const pubKey = Buffer.from(event.playerId, 'hex')
        const result = verifyEvent(event, pubKey)
        if (!result.valid) {
          if (verbose) console.warn('[validator] rejected:', result.error)
          if (bridge) bridge.notifyRejected(event, result.error)
          return
        }

        // Static-route gate for METRO_SESSION_CONFIRMED. Catches impossible
        // routes (different lines, non-consecutive stops, teleport timings)
        // signed by an authentic player.
        if (event.type === EventType.METRO_SESSION_CONFIRMED) {
          const stops = (event.payload?.stations ?? []).map((id, i, arr) => ({
            stationId: id,
            tOffsetSecs: arr.length > 1 && event.payload?.durationSeconds
              ? Math.round((event.payload.durationSeconds * i) / (arr.length - 1))
              : i * 90
          }))
          const check = validateStaticRoute(stops, linesData, stationsIndex)
          if (!check.valid) {
            const ts = nowSecs()
            const rejection = signEvent({
              schemaVersion: 1,
              type: EventType.METRO_SESSION_REJECTED,
              playerId: validatorId,
              timestamp: ts,
              weekId: weekId(ts),
              sequence: 0,
              prevHash: null,
              payload: {
                sessionId: event.payload?.sessionId,
                originalEventId: event.eventId,
                originalPlayerId: event.playerId,
                reason: check.reason
              }
            }, keypair)
            await store.append(rejection)
            rejectedSessionIds.add(event.payload?.sessionId)
            broadcast(swarm, encode(MSG_TYPE.EVENT, rejection))
            if (verbose) console.log(`[validator] route rejected: session ${event.payload?.sessionId} — ${check.reason}`)
            if (bridge) {
              bridge.notifyRejected(event, check.reason)
              bridge.notifyPublished(rejection)
            }
            return
          }
        }

        // Drop SCORE_GRANTED events tied to a session we've already rejected.
        if (event.type === EventType.SCORE_GRANTED &&
            rejectedSessionIds.has(event.payload?.sessionId)) {
          if (verbose) console.log(`[validator] dropping SCORE_GRANTED for rejected session ${event.payload?.sessionId}`)
          if (bridge) bridge.notifyRejected(event, 'session previously rejected')
          return
        }

        const known = await store.knownIds()
        if (known.has(event.eventId)) return

        await store.append(event)
        if (verbose) console.log(`[validator] accepted ${event.type} from ${event.playerId.slice(0, 8)}`)
        if (bridge) bridge.notifyAccepted(event)

        // Re-broadcast to other peers
        broadcast(swarm, encode(MSG_TYPE.EVENT, event), conn)
      }

      if (msg.msgType === MSG_TYPE.SYNC_REQUEST) {
        const all = await store.readAll()
        conn.write(encode(MSG_TYPE.SYNC_RESPONSE, { events: all }))
      }
    })
  })

  await swarm.flush()
  if (verbose) console.log('[validator] ready')

  process.on('SIGINT', async () => {
    await swarm.destroy()
    process.exit(0)
  })

  return { swarm, store, computeAndPublish: (wid) => computeAndPublish(wid, keypair, validatorId, store, swarm, verbose, bridge) }
}

async function computeAndPublish(wid, keypair, validatorId, store, swarm, verbose, bridge = null) {
  // ── War pair from previous week's nextWarPair ─────────────────────────────
  const now    = nowSecs()
  const prevWid = weekId(weekStart(now) - 1)
  const allWeeklyResults = await store.readByType(EventType.WEEKLY_RESULT)
  const prevResult = allWeeklyResults.find(e => e.weekId === prevWid)
  const warPair = prevResult?.payload?.nextWarPair ?? null

  // ── Split events by war / non-war clans ──────────────────────────────────
  const allScoreEvents = await store.readByType(EventType.SCORE_GRANTED)
  const thisWeekEvents = allScoreEvents.filter(e => e.weekId === wid)

  if (thisWeekEvents.length === 0) {
    if (verbose) console.log(`[validator] no SCORE_GRANTED events for week ${wid}`)
    return null
  }

  const warClanIds   = warPair ? new Set([warPair.attackerClanId, warPair.defenderClanId]) : new Set()
  const warEvents    = thisWeekEvents.filter(e => warClanIds.has(e.payload?.clanId))
  const nonWarEvents = thisWeekEvents.filter(e => !warClanIds.has(e.payload?.clanId))

  // ── War result ────────────────────────────────────────────────────────────
  const existingInvasion = await store.readByType(EventType.INVASION_RESULT)
  const alreadyDone = existingInvasion.some(e => e.weekId === wid)

  let hadInvasion = false
  let newInvasionResult = null

  if (warPair && !alreadyDone) {
    const { attackerClanId, defenderClanId } = warPair
    if (verbose) console.log(`[validator] war: ${attackerClanId} → ${defenderClanId}`)

    const invasion = computeInvasionResult({ scoreGrantedEvents: warEvents, attackerClanId, defenderClanId, weekId: wid })
    const winnerClanId = invasion.winner === 'ATTACKER' ? attackerClanId : defenderClanId
    const loserClanId  = invasion.winner === 'ATTACKER' ? defenderClanId : attackerClanId

    // Upset bonus: if defender wins, transfer 1% of attacker's all-time global points
    let upsetBonus = null
    if (invasion.winner === 'DEFENDER') {
      const attackerGlobalPts = allScoreEvents
        .filter(e => e.payload?.clanId === attackerClanId)
        .reduce((sum, e) => sum + (e.payload?.points ?? 0), 0)
      const amount = Math.floor(attackerGlobalPts * 0.01)
      if (amount > 0) upsetBonus = { amount, fromClanId: attackerClanId, toClanId: defenderClanId }
    }

    const invasionResult = signEvent({
      schemaVersion: 1,
      type: EventType.INVASION_RESULT,
      playerId: validatorId,
      timestamp: now,
      weekId: wid,
      sequence: 0,
      prevHash: null,
      payload: {
        weekId: wid,
        attackerClanId,
        defenderClanId,
        targetLineId: invasion.targetLineId,
        attackerPoints: invasion.attackerPoints,
        defenderPoints: invasion.defenderPoints,
        winner: invasion.winner,
        membersToTransfer: invasion.membersToTransfer,
        upsetBonus
      }
    }, keypair)

    await store.append(invasionResult)
    broadcast(swarm, encode(MSG_TYPE.EVENT, invasionResult))
    if (bridge) bridge.notifyPublished(invasionResult)
    newInvasionResult = invasionResult

    for (const affectedPlayerId of invasion.membersToTransfer) {
      const membership = signEvent({
        schemaVersion: 1,
        type: EventType.CLAN_MEMBERSHIP_CHANGED,
        playerId: validatorId,
        timestamp: now,
        weekId: wid,
        sequence: 0,
        prevHash: null,
        payload: {
          affectedPlayerId,
          fromClanId: loserClanId,
          toClanId: winnerClanId,
          reason: 'INVASION_LOSS'
        }
      }, keypair)

      await store.append(membership)
      broadcast(swarm, encode(MSG_TYPE.EVENT, membership))
    }

    hadInvasion = true
    if (verbose) {
      console.log(`[validator] WAR RESULT: ${winnerClanId} wins (${invasion.winner}), ${invasion.attackerPoints} vs ${invasion.defenderPoints} pts`)
      if (invasion.membersToTransfer.length) console.log(`[validator] transferred ${invasion.membersToTransfer.length} members: ${loserClanId} → ${winnerClanId}`)
      if (upsetBonus) console.log(`[validator] upset bonus: ${upsetBonus.amount} pts from ${upsetBonus.fromClanId} to ${upsetBonus.toClanId}`)
    }
  }

  // ── Weekly ranking (non-war clans only, this week) ────────────────────────
  const { clanScores: weekClanScores } = buildWeeklyRanking(nonWarEvents)
  const weeklyRanking = clanRanking(weekClanScores, wid)

  // ── Global ranking (all clans, all time + upset bonus adjustments) ────────
  const allInvasionResults = [...existingInvasion, ...(newInvasionResult ? [newInvasionResult] : [])]
  const globalRanking = buildGlobalRanking(allScoreEvents, allInvasionResults)

  // ── Next war pair = top 2 of weekly ranking ───────────────────────────────
  // War clans are excluded from weeklyRanking → automatic 1-week truce
  const nextWarPair = weeklyRanking.length >= 2
    ? { attackerClanId: weeklyRanking[0].clanId, defenderClanId: weeklyRanking[1].clanId }
    : null

  // ── Publish WEEKLY_RESULT ─────────────────────────────────────────────────
  const weeklyResult = signEvent({
    schemaVersion: 1,
    type: EventType.WEEKLY_RESULT,
    playerId: validatorId,
    timestamp: now,
    weekId: wid,
    sequence: 0,
    prevHash: null,
    payload: {
      weekId: wid,
      weeklyRanking,
      globalRanking,
      warResult: newInvasionResult?.payload ?? null,
      nextWarPair,
      hadInvasion
    }
  }, keypair)

  await store.append(weeklyResult)
  broadcast(swarm, encode(MSG_TYPE.EVENT, weeklyResult))
  if (bridge) bridge.notifyPublished(weeklyResult)

  if (verbose) {
    console.log(`[validator] WEEKLY_RESULT published for ${wid}`)
    if (weeklyRanking.length) console.log(`[validator] weekly top: ${weeklyRanking[0].clanId} (${weeklyRanking[0].points} pts)`)
    if (nextWarPair) console.log(`[validator] next war: ${nextWarPair.attackerClanId} → ${nextWarPair.defenderClanId}`)
  }

  return weeklyResult
}


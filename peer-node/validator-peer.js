// Validator peer: always-on scoring authority.
// - Verifies all incoming events (signature + anti-cheat).
// - Computes WEEKLY_RESULT when the week ends (or on --compute-results flag).
// - Signs and broadcasts the result; stores it for late-joining peers.

import { createSwarm, onConnection, broadcast } from './shared/swarm-utils.js'
import { encode, decode, createLineReader, MSG_TYPE } from './shared/protocol.js'
import { EventStore } from './shared/event-store.js'
import { verifyEvent } from '../core/events/event-verifier.js'
import { buildWeeklyRanking, clanRanking, getLeastActivePlayers } from '../core/scoring/ranking.js'
import { signEvent } from '../core/events/event-signer.js'
import { EventType } from '../core/events/event-types.js'
import { weekId, weekStart } from '../core/weekly-engine/week-utils.js'
import { generateKeypair, playerId, saveKeypair, loadKeypair } from '../core/crypto/identity.js'
import { homedir } from 'os'
import { join } from 'path'
import { mkdir } from 'fs/promises'

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
  verbose = true
} = {}) {
  const keypair = await loadOrCreateKeypair(identityPath)
  const validatorId = playerId(keypair.publicKey)

  const store = new EventStore(storePath)
  await store.init()

  const { swarm } = createSwarm({ server: true, client: true })

  if (verbose) {
    console.log('[validator] starting, id:', validatorId.slice(0, 16) + '...')
    console.log('[validator] store:', storePath)
  }

  if (computeResults) {
    // Wait briefly for peers to connect and sync before computing
    await new Promise(r => setTimeout(r, 2000))
    const wid = weekId(Math.floor(Date.now() / 1000))
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

        const pubKey = Buffer.from(event.playerId, 'hex')
        const result = verifyEvent(event, pubKey)
        if (!result.valid) {
          if (verbose) console.warn('[validator] rejected:', result.error)
          return
        }

        const known = await store.knownIds()
        if (known.has(event.eventId)) return

        await store.append(event)
        if (verbose) console.log(`[validator] accepted ${event.type} from ${event.playerId.slice(0, 8)}`)

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

  return { swarm, store, computeAndPublish: (wid) => computeAndPublish(wid, keypair, validatorId, store, swarm, verbose) }
}

async function computeAndPublish(wid, keypair, validatorId, store, swarm, verbose) {
  const scoreEvents = await store.readByType(EventType.SCORE_GRANTED)
  const weekEvents  = scoreEvents.filter(e => e.weekId === wid)

  if (weekEvents.length === 0) {
    if (verbose) console.log(`[validator] no SCORE_GRANTED events for week ${wid}`)
    return null
  }

  const { playerScores, clanScores } = buildWeeklyRanking(weekEvents)
  const clans = clanRanking(clanScores, wid)
  const winner = clans[0] ?? null

  // Build per-player summary for invasion check
  const playerSummary = buildPlayerSummary(weekEvents, wid)
  let membersTransferred = []

  if (winner && clans.length >= 2) {
    const runnerUp = clans[1]
    const defenders = Object.values(playerSummary).filter(p => p.clanId === runnerUp.clanId)
    const least = getLeastActivePlayers(defenders, wid, 0.25)
    membersTransferred = least.map(p => p.playerId)
  }

  const now = Math.floor(Date.now() / 1000)
  let sequence = 0
  const bare = {
    schemaVersion: 1,
    type: EventType.WEEKLY_RESULT,
    playerId: validatorId,
    timestamp: now,
    weekId: wid,
    sequence,
    prevHash: null,
    payload: {
      weekId: wid,
      clanRanking: clans,
      playerScores,
      clanScores,
      winner: winner?.clanId ?? null,
      membersTransferred
    }
  }

  const signed = signEvent(bare, keypair)
  await store.append(signed)
  broadcast(swarm, encode(MSG_TYPE.WEEKLY_RESULT, signed))

  if (verbose) {
    console.log(`[validator] WEEKLY_RESULT published for ${wid}`)
    if (winner) console.log(`[validator] winner: ${winner.clanId} (${winner.points} pts)`)
    if (membersTransferred.length) console.log(`[validator] transferred: ${membersTransferred.length} members`)
  }

  return signed
}

function buildPlayerSummary(scoreEvents, wid) {
  const map = {}
  for (const ev of scoreEvents) {
    if (ev.weekId !== wid) continue
    const pid = ev.playerId
    const clanId = ev.payload?.clanId
    if (!map[pid]) {
      map[pid] = { playerId: pid, clanId, weekScores: {}, weekSessions: {}, activeDays: {} }
    }
    const p = map[pid]
    p.weekScores[wid] = (p.weekScores[wid] ?? 0) + (ev.payload?.points ?? 0)
    p.weekSessions[wid] = (p.weekSessions[wid] ?? 0) + 1
    // Approximate active days from timestamp
    const day = Math.floor(ev.timestamp / 86400)
    if (!p._days) p._days = new Set()
    p._days.add(day)
    p.activeDays[wid] = p._days.size
  }
  return map
}

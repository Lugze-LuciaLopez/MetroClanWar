// Player peer: connects to the swarm, sends signed events, receives WEEKLY_RESULT.
// In --simulate mode it drives the weekly simulator and broadcasts the produced events.

import { createSwarm, onConnection } from './shared/swarm-utils.js'
import { encode, decode, createLineReader, MSG_TYPE } from './shared/protocol.js'
import { generateKeypair, playerId, saveKeypair, loadKeypair } from '../core/crypto/identity.js'
import { homedir } from 'os'
import { join } from 'path'
import { mkdir } from 'fs/promises'
import { readFile } from 'fs/promises'

const IDENTITY_PATH = join(homedir(), '.metro-clan-war', 'identity.json')

async function loadOrCreateKeypair(path) {
  const existing = await loadKeypair(path)
  if (existing) return existing
  const kp = generateKeypair()
  await mkdir(join(homedir(), '.metro-clan-war'), { recursive: true })
  await saveKeypair(kp, path)
  return kp
}

export async function startPlayer({
  identityPath = IDENTITY_PATH,
  simulate = false,
  verbose = true
} = {}) {
  const keypair = await loadOrCreateKeypair(identityPath)
  const pid = playerId(keypair.publicKey)

  if (verbose) console.log(`[player] id: ${pid.slice(0, 16)}...`)

  const { swarm } = createSwarm({ server: false, client: true })

  // Collect WEEKLY_RESULT events received from validators
  const results = []

  onConnection(swarm, (conn) => {
    if (verbose) console.log('[player] connected to peer')

    // Announce identity
    conn.write(encode(MSG_TYPE.PEER_INFO, { playerId: pid, publicKey: keypair.publicKey.toString('hex') }))

    createLineReader(conn, (line) => {
      const msg = decode(line)
      if (!msg) return

      if (msg.msgType === MSG_TYPE.WEEKLY_RESULT) {
        const result = msg.payload
        results.push(result)
        if (verbose) printWeeklyResult(result)
      }

      if (msg.msgType === MSG_TYPE.SYNC_RESPONSE) {
        const events = msg.payload?.events ?? []
        // Filter and print any WEEKLY_RESULT events received during sync
        for (const ev of events) {
          if (ev.type === 'WEEKLY_RESULT') {
            results.push(ev)
            if (verbose) printWeeklyResult(ev)
          }
        }
      }
    })
  })

  await swarm.flush()
  if (verbose) console.log('[player] connected to swarm')

  if (simulate) {
    await runSimulation(keypair, pid, swarm, verbose)
  }

  process.on('SIGINT', async () => {
    await swarm.destroy()
    process.exit(0)
  })

  return { swarm, keypair, playerId: pid, results, sendEvent: (event) => broadcastEvent(swarm, event) }
}

function broadcastEvent(swarm, event) {
  const msg = encode(MSG_TYPE.EVENT, event)
  for (const conn of swarm.connections) {
    conn.write(msg)
  }
}

async function runSimulation(keypair, pid, swarm, verbose) {
  const { createFakePlayer } = await import('../simulator/fake-player.js')
  const { simulateSession } = await import('../simulator/fake-route.js')
  const lines = JSON.parse(await readFile(new URL('../data/lines.json', import.meta.url), 'utf8'))

  // Use L3 clan as demo
  const clanId = 'L3'
  const player = createFakePlayer(clanId, `player-${pid.slice(0, 8)}`)
  const lineStations = lines[clanId]?.stations ?? []

  if (verbose) console.log(`[player] simulating 3 sessions on ${clanId}...`)

  const caps = { dailyTotal: 0, weeklyTotal: 0 }
  const now = Math.floor(Date.now() / 1000)

  for (let i = 0; i < 3; i++) {
    const startIdx = Math.floor(Math.random() * Math.max(1, lineStations.length - 8))
    const result = simulateSession({
      player,
      lineId: clanId,
      lineStations,
      startIdx,
      stationCount: 5 + i,
      startTimestamp: now - (3 - i) * 3600,
      linesData: lines,
      caps
    })
    caps.dailyTotal = result.newCaps.dailyTotal
    caps.weeklyTotal = result.newCaps.weeklyTotal

    // Send both the session confirmation and the score event
    broadcastEvent(swarm, result.confirmed)
    broadcastEvent(swarm, result.score)

    if (verbose) console.log(`[player] sent session ${i + 1} (${result.points} pts)`)
    await new Promise(r => setTimeout(r, 300))
  }

  if (verbose) console.log('[player] simulation complete. Waiting for WEEKLY_RESULT...')
}

function printWeeklyResult(result) {
  const payload = result.payload ?? result
  console.log(`\n[player] === WEEKLY_RESULT received for ${payload.weekId} ===`)
  if (payload.clanRanking) {
    payload.clanRanking.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.clanId.padEnd(5)} ${c.points} pts`)
    })
  }
  if (payload.winner) console.log(`  Winner: ${payload.winner}`)
}

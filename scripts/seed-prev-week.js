#!/usr/bin/env node
// Injecta un WEEKLY_RESULT de la setmana anterior al store del validator.
// Permet provar el flux d'invasió sense esperar una setmana real.
//
// Usage:
//   node scripts/seed-prev-week.js
//   node scripts/seed-prev-week.js --winner=L3 --runner-up=L5

import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { generateKeypair, playerId } from '../core/crypto/identity.js'
import { signEvent } from '../core/events/event-signer.js'
import { EventType } from '../core/events/event-types.js'
import { weekId, weekStart } from '../core/weekly-engine/week-utils.js'

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
    const [k, v] = a.slice(2).split('=')
    return [k, v ?? true]
  })
)

const winner   = args['winner']    ?? 'L3'
const runnerUp = args['runner-up'] ?? 'L5'

const STORE_DIR  = join(homedir(), '.metro-clan-war', 'validator-store')
const STORE_PATH = join(STORE_DIR, 'events.jsonl')

const now        = Math.floor(Date.now() / 1000)
const prevWeekTs = weekStart(now) - 1   // últim segon de la setmana anterior
const prevWid    = weekId(prevWeekTs)

const kp  = generateKeypair()
const vid = playerId(kp.publicKey)

const event = signEvent({
  schemaVersion: 1,
  type: EventType.WEEKLY_RESULT,
  playerId: vid,
  timestamp: prevWeekTs,
  weekId: prevWid,
  sequence: 0,
  prevHash: null,
  payload: {
    weekId: prevWid,
    clanRanking: [
      { clanId: winner,   points: 200 },
      { clanId: runnerUp, points: 150 }
    ],
    playerScores: {},
    clanScores: {},
    winner,
    membersTransferred: []
  }
}, kp)

await mkdir(STORE_DIR, { recursive: true })
await writeFile(STORE_PATH, JSON.stringify(event) + '\n', { flag: 'a', encoding: 'utf8' })

console.log(`Seeded WEEKLY_RESULT for ${prevWid}`)
console.log(`  Winner:    ${winner}`)
console.log(`  Runner-up: ${runnerUp}`)
console.log(`\nEl proper --compute-results declararà invasió: ${winner} → ${runnerUp}`)

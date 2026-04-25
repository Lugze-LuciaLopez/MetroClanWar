#!/usr/bin/env node
// Simulates a full week of MetroClanWar with N fake players.
// Prints a ranked summary of individual and clan scores to stdout.

import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createFakePlayer } from './fake-player.js'
import { simulateSession } from './fake-route.js'
import { buildWeeklyRanking, clanRanking } from '../core/scoring/ranking.js'
import { weekId, weekStart } from '../core/weekly-engine/week-utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

async function main() {
  const lines = JSON.parse(await readFile(join(ROOT, 'data/lines.json'), 'utf8'))

  // ── Config ──────────────────────────────────────────────────────────────────
  const GAME_LINES = ['L1', 'L2', 'L3', 'L4', 'L5']  // clans in this simulation
  const PLAYERS_PER_CLAN = 3
  const SESSIONS_PER_DAY = 2   // sessions each player does per active day
  const ACTIVE_DAYS = 5        // Mon–Fri active

  // Week starts next Monday 00:00 UTC
  const NOW = Math.floor(Date.now() / 1000)
  const WEEK_START = weekStart(NOW + 7 * 24 * 3600)  // simulate next week
  const WID = weekId(WEEK_START)

  console.log(`\n=== MetroClanWar Weekly Simulation ===`)
  console.log(`Week: ${WID}\n`)

  // ── Create players ──────────────────────────────────────────────────────────
  const players = []
  for (const clanId of GAME_LINES) {
    for (let i = 0; i < PLAYERS_PER_CLAN; i++) {
      players.push(createFakePlayer(clanId, `${clanId}-p${i + 1}`))
    }
  }

  // ── Simulate week ───────────────────────────────────────────────────────────
  const allScoreEvents = []
  const playerCaps = {}  // playerId → { dailyTotal, weeklyTotal }

  for (let day = 0; day < ACTIVE_DAYS; day++) {
    const dayStart = WEEK_START + day * 24 * 3600

    for (const player of players) {
      if (!playerCaps[player.playerId]) {
        playerCaps[player.playerId] = { dailyTotal: 0, weeklyTotal: 0 }
      }
      playerCaps[player.playerId].dailyTotal = 0  // reset daily cap each day

      const lineStations = lines[player.clanId]?.stations
      if (!lineStations) continue

      for (let s = 0; s < SESSIONS_PER_DAY; s++) {
        const sessionStart = dayStart + 8 * 3600 + s * 4 * 3600  // 08:00 and 12:00
        const startIdx = Math.floor(Math.random() * Math.max(1, lineStations.length - 8))

        const result = simulateSession({
          player,
          lineId: player.clanId,
          lineStations,
          startIdx,
          stationCount: 5 + Math.floor(Math.random() * 6),
          startTimestamp: sessionStart,
          linesData: lines,
          caps: playerCaps[player.playerId]
        })

        playerCaps[player.playerId] = result.newCaps
        allScoreEvents.push(result.score)
      }
    }
  }

  // ── Build ranking ───────────────────────────────────────────────────────────
  const { playerScores, clanScores } = buildWeeklyRanking(allScoreEvents)

  // Individual ranking
  console.log('── Individual Ranking ─────────────────────────────')
  const individualRanking = players
    .map(p => ({
      name: p.displayName,
      clanId: p.clanId,
      points: playerScores[p.playerId]?.[WID] ?? 0
    }))
    .sort((a, b) => b.points - a.points)

  individualRanking.forEach((p, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${p.name.padEnd(12)} [${p.clanId}]  ${p.points} pts`)
  })

  // Clan ranking
  console.log('\n── Clan Ranking ───────────────────────────────────')
  const clans = clanRanking(clanScores, WID)
  clans.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.clanId.padEnd(5)}  ${c.points} pts`)
  })

  if (clans.length > 0) {
    console.log(`\n  🏆 Winner: ${clans[0].clanId} with ${clans[0].points} pts`)
    console.log(`  → They may declare an invasion for next week.\n`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })

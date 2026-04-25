// Player peer: connects to the swarm, sends signed events, receives WEEKLY_RESULT.
// In --simulate mode it drives the weekly simulator and broadcasts the produced events.

import { createSwarm, onConnection } from './shared/swarm-utils.js'
import { encode, decode, createLineReader, MSG_TYPE } from './shared/protocol.js'
import { generateKeypair, playerId, saveIdentity, loadIdentity } from '../core/crypto/identity.js'
import { homedir } from 'os'
import { join } from 'path'
import { mkdir } from 'fs/promises'
import { readFile } from 'fs/promises'
import { createInterface } from 'readline'
import { nowSecs, getWeekOffset, setWeekOffset } from '../core/weekly-engine/clock.js'
import { weekId } from '../core/weekly-engine/week-utils.js'

const IDENTITY_PATH = join(homedir(), '.metro-clan-war', 'identity.json')

let activePromptAbort = null

function promptUser(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve, reject) => {
    activePromptAbort = () => {
      activePromptAbort = null
      rl.close()
      reject(new Error('PROMPT_ABORTED'))
    }
    rl.question(question, ans => {
      activePromptAbort = null
      rl.close()
      resolve(ans.trim())
    })
  })
}

export async function startPlayer({
  identityPath = IDENTITY_PATH,
  simulate = false,
  verbose = true
} = {}) {
  await mkdir(join(homedir(), '.metro-clan-war'), { recursive: true })

  // Load or create identity (keypair + clanId)
  let identity = await loadIdentity(identityPath)
  if (!identity) {
    identity = { keypair: generateKeypair(), clanId: null }
  }

  // First run: assign clan and save
  if (!identity.clanId) {
    const lines = JSON.parse(await readFile(new URL('../data/lines.json', import.meta.url), 'utf8'))
    console.log(`\nBenvingut a MetroClanWar!`)
    console.log(`Clans disponibles: ${Object.keys(lines).join(', ')}`)
    let clanId
    do {
      clanId = await promptUser('Escull el teu clan: ')
      if (!lines[clanId]) console.log(`  Clan "${clanId}" no existeix.`)
    } while (!lines[clanId])
    identity.clanId = clanId
    await saveIdentity(identity, identityPath)
    console.log(`  Clan ${clanId} guardat.`)
  }

  const { keypair, clanId } = identity
  const pid = playerId(keypair.publicKey)

  if (verbose) console.log(`\n[player] id: ${pid.slice(0, 16)}... | clan: ${clanId}`)

  // Shared state updated from network messages
  let latestWeeklyResult = null
  const results = []
  const seenEventIds = new Set()
  let lastIntroWeek = null

  const { swarm } = createSwarm({ server: false, client: true })

  onConnection(swarm, (conn) => {
    if (verbose && !simulate) console.log('[player] connected to peer')
    conn.write(encode(MSG_TYPE.PEER_INFO, { playerId: pid, publicKey: keypair.publicKey.toString('hex') }))

    createLineReader(conn, (line) => {
      const msg = decode(line)
      if (!msg) return

      if (msg.msgType === MSG_TYPE.EVENT) {
        const ev = msg.payload
        if (!ev?.eventId || seenEventIds.has(ev.eventId)) return
        seenEventIds.add(ev.eventId)

        if (ev.type === 'WEEKLY_RESULT') {
          results.push(ev)
          updateLatestWeeklyResult(ev)
          if (verbose) printWeeklyResult(ev, identity.clanId)
          maybeAdvanceWeek(ev)
        }
        if (ev.type === 'INVASION_RESULT' && verbose) printInvasionResult(ev)
        if (ev.type === 'CLAN_MEMBERSHIP_CHANGED') {
          if (verbose) printMembershipChange(ev)
          if (ev.payload?.affectedPlayerId === pid) {
            identity.clanId = ev.payload.toClanId
            saveIdentity(identity, identityPath).catch(() => {})
            console.log(`\n[player] *** El teu clan ha canviat a ${ev.payload.toClanId} i s'ha guardat ***`)
          }
        }
      }

      if (msg.msgType === MSG_TYPE.SYNC_RESPONSE) {
        const events = msg.payload?.events ?? []
        let syncLatest = null
        for (const ev of events) {
          if (ev.type === 'WEEKLY_RESULT') {
            if (!seenEventIds.has(ev.eventId)) {
              results.push(ev)
              if (!syncLatest || ev.timestamp > syncLatest.timestamp) syncLatest = ev
              updateLatestWeeklyResult(ev)
              seenEventIds.add(ev.eventId)
            }
          }
          if (ev.type === 'INVASION_RESULT') {
            if (!seenEventIds.has(ev.eventId)) {
              if (verbose) printInvasionResult(ev)
              seenEventIds.add(ev.eventId)
            }
          }
          if (ev.type === 'CLAN_MEMBERSHIP_CHANGED') {
            if (!seenEventIds.has(ev.eventId)) {
              seenEventIds.add(ev.eventId)
              if (verbose) printMembershipChange(ev)
              if (ev.payload?.affectedPlayerId === pid) {
                identity.clanId = ev.payload.toClanId
                saveIdentity(identity, identityPath).catch(() => {})
                console.log(`\n[player] *** El teu clan ha canviat a ${ev.payload.toClanId} i s'ha guardat ***`)
              }
            }
          }
        }
        if (syncLatest && verbose) printWeeklyResult(syncLatest, identity.clanId)
        if (syncLatest) maybeAdvanceWeek(syncLatest)
      }
    })
  })

  function maybeAdvanceWeek(ev) {
    if (ev.weekId !== weekId(nowSecs())) return
    const currentOffsetWeeks = getWeekOffset() / (7 * 86400)
    setWeekOffset(currentOffsetWeeks + 1)
    if (verbose) console.log(`[clock] auto-advance → ${weekId(nowSecs())} (offset=${currentOffsetWeeks + 1})`)
    printIntroIfNewWeek()
    if (activePromptAbort) activePromptAbort()
  }

  function printIntroIfNewWeek() {
    const wid = weekId(nowSecs())
    if (wid === lastIntroWeek) return
    lastIntroWeek = wid
    if (verbose) printWeekIntro(latestWeeklyResult, identity.clanId)
  }

  function updateLatestWeeklyResult(ev) {
    if (!latestWeeklyResult || ev.timestamp > latestWeeklyResult.timestamp) {
      latestWeeklyResult = ev
    }
  }

  await swarm.flush()
  if (verbose) console.log('[player] connected to swarm')

  if (simulate) {
    // Wait for SYNC_RESPONSE to arrive before starting simulation
    await new Promise(r => setTimeout(r, 1500))
    while (true) {
      printIntroIfNewWeek()
      try {
        await runSimulation(identity, keypair, pid, swarm, verbose)
      } catch (e) {
        if (e.message !== 'PROMPT_ABORTED') throw e
        // auto-advance aborted the round; loop iterates with new week
      }
    }
  }

  process.on('SIGINT', async () => {
    await swarm.destroy()
    process.exit(0)
  })

  return { swarm, keypair, playerId: pid, results, sendEvent: (event) => broadcastEvent(swarm, event) }
}

function broadcastEvent(swarm, event) {
  const msg = encode(MSG_TYPE.EVENT, event)
  for (const conn of swarm.connections) conn.write(msg)
}

async function runSimulation(identity, keypair, pid, swarm, verbose) {
  const { createFakePlayer } = await import('../simulator/fake-player.js')
  const { simulateSession } = await import('../simulator/fake-route.js')
  const lines = JSON.parse(await readFile(new URL('../data/lines.json', import.meta.url), 'utf8'))

  const clanId = identity.clanId
  console.log(`Línies disponibles: ${Object.keys(lines).join(', ')}`)

  let chosenLine
  do {
    chosenLine = await promptUser('Quina línia vols simular? ')
    if (!lines[chosenLine]) console.log(`  Línia "${chosenLine}" no existeix.`)
  } while (!lines[chosenLine])

  const lineStations = lines[chosenLine]?.stations ?? []
  const maxStations = lineStations.length

  // Min 5 stations to guarantee > 5 min duration (5-1)*90s = 360s = 6 min
  const minStations = Math.min(5, maxStations)
  let stationCount = 0
  do {
    const raw = await promptUser(`Quantes estacions per sessió? (${minStations}–${maxStations}): `)
    stationCount = parseInt(raw)
    if (isNaN(stationCount) || stationCount < minStations || stationCount > maxStations) {
      console.log(`  Ha de ser un número entre ${minStations} i ${maxStations}.`)
    }
  } while (isNaN(stationCount) || stationCount < minStations || stationCount > maxStations)

  let numSessions = 0
  do {
    const raw = await promptUser('Quantes sessions? (1–10): ')
    numSessions = parseInt(raw)
    if (isNaN(numSessions) || numSessions < 1 || numSessions > 10) {
      console.log('  Ha de ser un número entre 1 i 10.')
    }
  } while (isNaN(numSessions) || numSessions < 1 || numSessions > 10)

  const player = createFakePlayer(clanId, `player-${pid.slice(0, 8)}`, keypair)
  if (verbose) console.log(`\n[player] simulant ${numSessions} sessions — clan ${clanId} a línia ${chosenLine} (${stationCount} estacions)...`)

  const caps = { dailyTotal: 0, weeklyTotal: 0 }
  const now = nowSecs()

  for (let i = 0; i < numSessions; i++) {
    const startIdx = Math.floor(Math.random() * Math.max(1, lineStations.length - stationCount))
    const result = simulateSession({
      player,
      lineId: chosenLine,
      lineStations,
      startIdx,
      stationCount,
      startTimestamp: now - (numSessions - i) * 3600,
      linesData: lines,
      caps
    })
    caps.dailyTotal = result.newCaps.dailyTotal
    caps.weeklyTotal = result.newCaps.weeklyTotal
    broadcastEvent(swarm, result.confirmed)
    broadcastEvent(swarm, result.score)
    if (verbose) console.log(`[player] sessió ${i + 1}/${numSessions} enviada (${result.points} pts)`)
    await new Promise(r => setTimeout(r, 300))
  }

  if (verbose) console.log('[player] simulació completa.')
}

function printWeekIntro(latestWeeklyResult, clanId) {
  const nextWarPair = latestWeeklyResult?.payload?.nextWarPair
  const prevWarResult = latestWeeklyResult?.payload?.warResult
  const isTruce = latestWeeklyResult?.payload?.hadInvasion === true &&
    (prevWarResult?.attackerClanId === clanId || prevWarResult?.defenderClanId === clanId)
  const isAttacker = nextWarPair?.attackerClanId === clanId
  const isDefender = nextWarPair?.defenderClanId === clanId

  console.log('\n─────────────────────────────────')
  console.log(`Setmana ${weekId(nowSecs())} | Clan: ${clanId}`)
  if (isTruce) {
    console.log(`*** SETMANA DE TREGUA ***`)
    console.log(`Cap invasió aquesta setmana.`)
  } else if (isAttacker) {
    console.log(`*** MODE INVASIÓ — ATACANT ***`)
    console.log(`Envaeixes ${nextWarPair.defenderClanId} aquesta setmana.`)
    console.log(`Per guanyar, juga a les estacions de ${nextWarPair.defenderClanId}.`)
  } else if (isDefender) {
    console.log(`*** MODE DEFENSA ***`)
    console.log(`${nextWarPair.attackerClanId} envaeix la teva línia.`)
    console.log(`Defensa jugant a les teves estacions (${clanId}).`)
  } else if (nextWarPair) {
    console.log(`Guerra en curs: ${nextWarPair.attackerClanId} → ${nextWarPair.defenderClanId}`)
    console.log(`No hi participes. Juga normalment.`)
  } else {
    console.log(`Setmana normal.`)
  }
  console.log('─────────────────────────────────\n')
}

function printWeeklyResult(ev, myClanId) {
  const p = ev.payload ?? ev
  const myMark = id => id === myClanId ? ' ← tu' : ''
  console.log(`\n[player] === SETMANA ${p.weekId} ===`)

  // War result — visible to all players
  console.log(`  Guerra:`)
  if (p.warResult) {
    const wr = p.warResult
    const winner = wr.winner === 'ATTACKER' ? wr.attackerClanId : wr.defenderClanId
    const loser  = wr.winner === 'ATTACKER' ? wr.defenderClanId : wr.attackerClanId
    console.log(`    ${wr.attackerClanId}${myMark(wr.attackerClanId)} (atacant): ${wr.attackerPoints} pts`)
    console.log(`    ${wr.defenderClanId}${myMark(wr.defenderClanId)} (defensor): ${wr.defenderPoints} pts`)
    console.log(`    ${winner}${myMark(winner)} guanya`)
    if (wr.membersToTransfer?.length) {
      console.log(`    ${loser} penalitzat: ${wr.membersToTransfer.length} membre(s) a ${winner}`)
    }
    if (wr.upsetBonus) {
      const b = wr.upsetBonus
      console.log(`    Bonus sorpresa: ${b.amount} pts de ${b.fromClanId} a ${b.toClanId}`)
    }
    if (myClanId === wr.attackerClanId || myClanId === wr.defenderClanId) {
      console.log(`    → ${winner === myClanId ? 'HAS GUANYAT!' : 'has perdut'}`)
    }
  } else {
    console.log(`    no hi ha guerra`)
  }

  // Weekly ranking (non-war clans only)
  const weekly = p.weeklyRanking ?? p.clanRanking
  if (weekly?.length) {
    console.log(`  Ranking setmanal:`)
    weekly.forEach((c, i) => {
      console.log(`    ${i + 1}. ${c.clanId.padEnd(5)} ${c.points} pts${myMark(c.clanId)}`)
    })
  }

  // Global ranking (all clans, all time)
  if (p.globalRanking?.length) {
    console.log(`  Ranking global:`)
    p.globalRanking.forEach((c, i) => {
      console.log(`    ${i + 1}. ${c.clanId.padEnd(5)} ${c.points} pts${myMark(c.clanId)}`)
    })
  }

  if (p.nextWarPair) {
    console.log(`  Propera guerra: ${p.nextWarPair.attackerClanId} → ${p.nextWarPair.defenderClanId}`)
  }
}

function printInvasionResult(ev) {
  const p = ev.payload
  const winnerClan = p.winner === 'ATTACKER' ? p.attackerClanId : p.defenderClanId
  console.log(`\n[player] === INVASION_RESULT ${p.weekId} ===`)
  console.log(`  ${p.attackerClanId} (atacant): ${p.attackerPoints} pts`)
  console.log(`  ${p.defenderClanId} (defensor): ${p.defenderPoints} pts`)
  console.log(`  Guanyador: ${winnerClan} — ${p.membersToTransfer?.length ?? 0} membres transferits`)
  if (p.upsetBonus) console.log(`  Bonus sorpresa: ${p.upsetBonus.amount} pts`)
}

function printMembershipChange(ev) {
  const p = ev.payload
  console.log(`[player] CLAN_MEMBERSHIP_CHANGED: ${p.affectedPlayerId?.slice(0, 12)}... de ${p.fromClanId} a ${p.toClanId} (${p.reason})`)
}

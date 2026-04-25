import test from 'brittle'
import { computeInvasionResult } from '../core/invasion/invasion-engine.js'

const WEEK = '2026-W17'
const DAY_TS = 1745539200  // any fixed Monday timestamp

function scoreEvent(playerId, clanId, lineId, points, dayOffset = 0) {
  return {
    type: 'SCORE_GRANTED',
    playerId,
    weekId: WEEK,
    timestamp: DAY_TS + dayOffset * 86400,
    payload: { clanId, lineId, points, reason: 'VALIDATED_METRO_SESSION' }
  }
}

test('invasion: attacker wins with more points on target line', t => {
  const events = [
    scoreEvent('attacker-p1', 'L3', 'L5', 50),
    scoreEvent('attacker-p2', 'L3', 'L5', 40),
    scoreEvent('defender-p1', 'L5', 'L5', 30),
  ]
  const result = computeInvasionResult({ scoreGrantedEvents: events, attackerClanId: 'L3', defenderClanId: 'L5', weekId: WEEK })
  t.is(result.winner, 'ATTACKER')
  t.is(result.attackerPoints, 90)
  t.is(result.defenderPoints, 30)
  t.is(result.targetLineId, 'L5')
})

test('invasion: defender wins with more points on target line', t => {
  const events = [
    scoreEvent('attacker-p1', 'L3', 'L5', 20),
    scoreEvent('defender-p1', 'L5', 'L5', 60),
    scoreEvent('defender-p2', 'L5', 'L5', 40),
  ]
  const result = computeInvasionResult({ scoreGrantedEvents: events, attackerClanId: 'L3', defenderClanId: 'L5', weekId: WEEK })
  t.is(result.winner, 'DEFENDER')
  t.is(result.attackerPoints, 20)
  t.is(result.defenderPoints, 100)
})

test('invasion: defender wins on tie (home advantage)', t => {
  const events = [
    scoreEvent('attacker-p1', 'L3', 'L5', 50),
    scoreEvent('defender-p1', 'L5', 'L5', 50),
  ]
  const result = computeInvasionResult({ scoreGrantedEvents: events, attackerClanId: 'L3', defenderClanId: 'L5', weekId: WEEK })
  t.is(result.winner, 'DEFENDER')
})

test('invasion: attacker wins, selects 5% (ceil) least active from defenders', t => {
  const events = [
    scoreEvent('attacker-p1', 'L3', 'L5', 100),
    scoreEvent('defender-p1', 'L5', 'L5', 10),
    scoreEvent('defender-p2', 'L5', 'L5', 5),
    scoreEvent('defender-p3', 'L5', 'L5', 20),
    scoreEvent('defender-p4', 'L5', 'L5', 15),
  ]
  const result = computeInvasionResult({ scoreGrantedEvents: events, attackerClanId: 'L3', defenderClanId: 'L5', weekId: WEEK })
  t.is(result.winner, 'ATTACKER')
  // 4 defenders × 0.05 = 0.2 → ceil = 1 transferred
  t.is(result.membersToTransfer.length, 1)
  // defender-p2 has fewest points (5)
  t.is(result.membersToTransfer[0], 'defender-p2')
})

test('invasion: 5% ceil — 21 players in loser team → 2 transferred', t => {
  const attackerEvent = scoreEvent('attacker-p1', 'L3', 'L5', 99999)
  const defenderEvents = Array.from({ length: 21 }, (_, i) =>
    scoreEvent(`defender-p${String(i).padStart(2, '0')}`, 'L5', 'L5', (i + 1) * 10)
  )
  const result = computeInvasionResult({
    scoreGrantedEvents: [attackerEvent, ...defenderEvents],
    attackerClanId: 'L3', defenderClanId: 'L5', weekId: WEEK
  })
  t.is(result.winner, 'ATTACKER')
  // ceil(21 × 0.05) = ceil(1.05) = 2
  t.is(result.membersToTransfer.length, 2)
})

test('invasion: no events on target line → defender wins 0-0', t => {
  const events = [
    scoreEvent('attacker-p1', 'L3', 'L3', 50),  // scored on own line, not L5
  ]
  const result = computeInvasionResult({ scoreGrantedEvents: events, attackerClanId: 'L3', defenderClanId: 'L5', weekId: WEEK })
  t.is(result.winner, 'DEFENDER')
  t.is(result.attackerPoints, 0)
  t.is(result.defenderPoints, 0)
  t.is(result.membersToTransfer.length, 0)
})

test('invasion: ignores events from wrong week', t => {
  const events = [
    scoreEvent('attacker-p1', 'L3', 'L5', 999),
  ]
  // Change weekId so it doesn't match
  events[0].weekId = '2026-W01'
  const result = computeInvasionResult({ scoreGrantedEvents: events, attackerClanId: 'L3', defenderClanId: 'L5', weekId: WEEK })
  t.is(result.attackerPoints, 0)
  t.is(result.winner, 'DEFENDER')
})

test('invasion: membersToTransfer is deterministic', t => {
  const events = [
    scoreEvent('attacker-p1', 'L3', 'L5', 100),
    scoreEvent('defender-aaa', 'L5', 'L5', 10, 0),
    scoreEvent('defender-bbb', 'L5', 'L5', 10, 1),
  ]
  // Both defenders have same points but different days active → same points, same sessions,
  // same days (1 each) → tiebreak by playerId lexicographic
  const r1 = computeInvasionResult({ scoreGrantedEvents: events, attackerClanId: 'L3', defenderClanId: 'L5', weekId: WEEK })
  const r2 = computeInvasionResult({ scoreGrantedEvents: events, attackerClanId: 'L3', defenderClanId: 'L5', weekId: WEEK })
  t.alike(r1.membersToTransfer, r2.membersToTransfer)
  // 'defender-aaa' < 'defender-bbb' alphabetically → aaa is selected
  t.is(r1.membersToTransfer[0], 'defender-aaa')
})

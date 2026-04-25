// P2P integration tests — run all peers in-process using direct stream pairs.
// No real Hyperswarm/DHT needed: we wire streams manually and test the protocol layer.

import test from 'brittle'
import { PassThrough } from 'stream'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { encode, decode, createLineReader, MSG_TYPE } from '../peer-node/shared/protocol.js'
import { EventStore } from '../peer-node/shared/event-store.js'
import { generateKeypair, playerId } from '../core/crypto/identity.js'
import { signEvent } from '../core/events/event-signer.js'
import { verifyEvent } from '../core/events/event-verifier.js'
import { EventType } from '../core/events/event-types.js'
import { weekId } from '../core/weekly-engine/week-utils.js'
import { buildWeeklyRanking, clanRanking } from '../core/scoring/ranking.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePair() {
  // Returns two PassThrough streams wired so writes to A appear on B and vice versa.
  const a = new PassThrough()
  const b = new PassThrough()
  a.pipe(b)   // writing to a → readable from b... but we need bidirectional:
  // We actually need two separate channels.
  const aTob = new PassThrough()
  const bToa = new PassThrough()
  return [
    { write: (d) => aTob.write(d), readable: bToa },
    { write: (d) => bToa.write(d), readable: aTob }
  ]
}

function makeSignedEvent(kp, type, payload, seq = 0) {
  const ts = Math.floor(Date.now() / 1000)
  const pid = playerId(kp.publicKey)
  const wid = weekId(ts)
  return signEvent({
    schemaVersion: 1,
    type,
    playerId: pid,
    timestamp: ts,
    weekId: wid,
    sequence: seq,
    prevHash: null,
    payload
  }, kp)
}

// ── protocol.js ───────────────────────────────────────────────────────────────

test('protocol: encode/decode roundtrip', t => {
  const msg = encode(MSG_TYPE.EVENT, { foo: 'bar' })
  const decoded = decode(msg.trim())
  t.is(decoded.msgType, MSG_TYPE.EVENT)
  t.is(decoded.payload.foo, 'bar')
})

test('protocol: decode returns null for malformed input', t => {
  t.is(decode('not-json'), null)
  t.is(decode(''), null)
})

test('protocol: createLineReader splits by newline', t => {
  t.plan(3)
  const stream = new PassThrough()
  const lines = []
  createLineReader(stream, l => lines.push(l))
  stream.write('line1\nline2\n')
  stream.write('line3\n')
  t.is(lines[0], 'line1')
  t.is(lines[1], 'line2')
  t.is(lines[2], 'line3')
})

// ── EventStore ────────────────────────────────────────────────────────────────

test('EventStore: append and readAll', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mcw-test-'))
  const store = new EventStore(join(dir, 'events.jsonl'))
  await store.init()

  const kp = generateKeypair()
  const ev = makeSignedEvent(kp, EventType.STATION_DETECTED, { stationId: 'DIAGONAL', lineCandidates: ['L3'], accuracy: 40, source: 'gps' })
  await store.append(ev)

  const all = await store.readAll()
  t.is(all.length, 1)
  t.is(all[0].eventId, ev.eventId)
  await rm(dir, { recursive: true })
})

test('EventStore: readByType filters correctly', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mcw-test-'))
  const store = new EventStore(join(dir, 'events.jsonl'))
  await store.init()

  const kp = generateKeypair()
  const e1 = makeSignedEvent(kp, EventType.STATION_DETECTED, { stationId: 'A', lineCandidates: [], accuracy: 40, source: 'gps' }, 0)
  const e2 = makeSignedEvent(kp, EventType.SCORE_GRANTED, { sessionId: 'x', lineId: 'L3', clanId: 'L3', points: 10, reason: 'test' }, 1)
  await store.append(e1)
  await store.append(e2)

  const scores = await store.readByType(EventType.SCORE_GRANTED)
  t.is(scores.length, 1)
  t.is(scores[0].type, EventType.SCORE_GRANTED)
  await rm(dir, { recursive: true })
})

test('EventStore: knownIds deduplication', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mcw-test-'))
  const store = new EventStore(join(dir, 'events.jsonl'))
  await store.init()

  const kp = generateKeypair()
  const ev = makeSignedEvent(kp, EventType.STATION_DETECTED, { stationId: 'B', lineCandidates: [], accuracy: 40, source: 'gps' })
  await store.append(ev)

  const ids = await store.knownIds()
  t.ok(ids.has(ev.eventId))
  await rm(dir, { recursive: true })
})

// ── Replica logic (in-process, no real Hyperswarm) ────────────────────────────

test('replica: stores incoming EVENT and rejects tampered one', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mcw-test-'))
  const store = new EventStore(join(dir, 'events.jsonl'))
  await store.init()

  const kp = generateKeypair()
  const good = makeSignedEvent(kp, EventType.STATION_DETECTED, { stationId: 'C', lineCandidates: ['L3'], accuracy: 40, source: 'gps' })
  const tampered = { ...good, payload: { ...good.payload, stationId: 'HACKED' } }

  // Simulate replica processing
  async function replicaProcess(event) {
    const pubKey = Buffer.from(event.playerId, 'hex')
    const result = verifyEvent(event, pubKey)
    if (!result.valid) return false
    const known = await store.knownIds()
    if (known.has(event.eventId)) return false
    await store.append(event)
    return true
  }

  t.ok(await replicaProcess(good))
  t.absent(await replicaProcess(tampered))

  const all = await store.readAll()
  t.is(all.length, 1)
  t.is(all[0].eventId, good.eventId)
  await rm(dir, { recursive: true })
})

test('replica: does not store duplicate events', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mcw-test-'))
  const store = new EventStore(join(dir, 'events.jsonl'))
  await store.init()

  const kp = generateKeypair()
  const ev = makeSignedEvent(kp, EventType.STATION_DETECTED, { stationId: 'D', lineCandidates: ['L3'], accuracy: 40, source: 'gps' })

  async function replicaProcess(event) {
    const pubKey = Buffer.from(event.playerId, 'hex')
    if (!verifyEvent(event, pubKey).valid) return false
    const known = await store.knownIds()
    if (known.has(event.eventId)) return false
    await store.append(event)
    return true
  }

  await replicaProcess(ev)
  await replicaProcess(ev)  // duplicate

  const all = await store.readAll()
  t.is(all.length, 1)
  await rm(dir, { recursive: true })
})

// ── Validator logic (scoring + WEEKLY_RESULT) ─────────────────────────────────

test('validator: buildWeeklyRanking from SCORE_GRANTED events', t => {
  const ts = Math.floor(Date.now() / 1000)
  const wid = weekId(ts)
  const events = [
    { playerId: 'p1', weekId: wid, payload: { points: 30, clanId: 'L3' } },
    { playerId: 'p1', weekId: wid, payload: { points: 20, clanId: 'L3' } },
    { playerId: 'p2', weekId: wid, payload: { points: 50, clanId: 'L4' } }
  ]
  const { playerScores, clanScores } = buildWeeklyRanking(events)
  t.is(playerScores.p1[wid], 50)
  t.is(clanScores.L3[wid], 50)
  t.is(clanScores.L4[wid], 50)
})

test('validator: WEEKLY_RESULT event is signed and verifiable', t => {
  const kp = generateKeypair()
  const validatorId = playerId(kp.publicKey)
  const ts = Math.floor(Date.now() / 1000)
  const wid = weekId(ts)

  const result = signEvent({
    schemaVersion: 1,
    type: EventType.WEEKLY_RESULT,
    playerId: validatorId,
    timestamp: ts,
    weekId: wid,
    sequence: 0,
    prevHash: null,
    payload: { weekId: wid, clanRanking: [], playerScores: {}, clanScores: {}, winner: null, membersTransferred: [] }
  }, kp)

  const verified = verifyEvent(result, kp.publicKey)
  t.ok(verified.valid)
})

test('validator: clanRanking sorts correctly', t => {
  const wid = weekId(Math.floor(Date.now() / 1000))
  const clanScores = { L3: { [wid]: 200 }, L1: { [wid]: 350 }, L4: { [wid]: 100 } }
  const ranking = clanRanking(clanScores, wid)
  t.is(ranking[0].clanId, 'L1')
  t.is(ranking[2].clanId, 'L4')
})

// ── Wire protocol round-trip ──────────────────────────────────────────────────

test('wire: SYNC_RESPONSE carries events end-to-end', t => {
  t.plan(2)
  const [side1, side2] = makePair()

  const kp = generateKeypair()
  const ev = makeSignedEvent(kp, EventType.STATION_DETECTED, { stationId: 'E', lineCandidates: ['L3'], accuracy: 40, source: 'gps' })

  // side2 listens for SYNC_RESPONSE
  createLineReader(side2.readable, (line) => {
    const msg = decode(line)
    if (msg?.msgType === MSG_TYPE.SYNC_RESPONSE) {
      t.is(msg.payload.events.length, 1)
      t.is(msg.payload.events[0].eventId, ev.eventId)
    }
  })

  // side1 sends SYNC_RESPONSE
  side1.write(encode(MSG_TYPE.SYNC_RESPONSE, { events: [ev] }))
})

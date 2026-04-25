import test from 'brittle'
import { generateKeypair, playerId } from '../core/crypto/identity.js'
import { canonicalizeEvent, hashEvent } from '../core/crypto/canonical.js'
import { signEvent } from '../core/events/event-signer.js'
import { verifyEvent, verifyChain } from '../core/events/event-verifier.js'
import { EventType } from '../core/events/event-types.js'
import { weekId } from '../core/weekly-engine/week-utils.js'

function bareEvent(overrides = {}) {
  const ts = 1714000000
  return {
    schemaVersion: 1,
    type: EventType.STATION_DETECTED,
    playerId: 'deadbeef',
    timestamp: ts,
    weekId: weekId(ts),
    sequence: 0,
    prevHash: null,
    payload: { stationId: 'DIAGONAL', lineCandidates: ['L3', 'L5'], accuracy: 45, source: 'gps' },
    ...overrides
  }
}

// ── Identity ──────────────────────────────────────────────────────────────────
test('generateKeypair returns correct buffer sizes', t => {
  const kp = generateKeypair()
  t.is(kp.publicKey.length, 32)
  t.is(kp.secretKey.length, 64)
})

test('playerId is 64-char hex', t => {
  const kp = generateKeypair()
  const pid = playerId(kp.publicKey)
  t.is(pid.length, 64)
  t.ok(/^[0-9a-f]+$/.test(pid))
})

// ── Canonical ─────────────────────────────────────────────────────────────────
test('canonicalizeEvent excludes eventId and signature', t => {
  const ev = { ...bareEvent(), eventId: 'abc', signature: 'def' }
  const canonical = canonicalizeEvent(ev)
  t.absent(canonical.includes('eventId'))
  t.absent(canonical.includes('signature'))
  t.ok(canonical.includes('STATION_DETECTED'))
})

test('canonicalizeEvent is key-order independent', t => {
  const a = { b: 2, a: 1 }
  const b = { a: 1, b: 2 }
  const evA = bareEvent({ payload: a })
  const evB = bareEvent({ payload: b })
  t.is(canonicalizeEvent(evA), canonicalizeEvent(evB))
})

test('hashEvent produces 64-char hex', t => {
  const h = hashEvent(bareEvent())
  t.is(h.length, 64)
  t.ok(/^[0-9a-f]+$/.test(h))
})

test('hashEvent is deterministic', t => {
  const ev = bareEvent()
  t.is(hashEvent(ev), hashEvent({ ...ev }))
})

// ── Sign / Verify ─────────────────────────────────────────────────────────────
test('signEvent adds eventId and signature', t => {
  const kp = generateKeypair()
  const signed = signEvent(bareEvent(), kp)
  t.ok(signed.eventId)
  t.ok(signed.signature)
  t.is(signed.eventId.length, 64)
  t.is(signed.signature.length, 128)
})

test('verifyEvent passes for valid event', t => {
  const kp = generateKeypair()
  const ev = bareEvent({ playerId: playerId(kp.publicKey) })
  const signed = signEvent(ev, kp)
  const result = verifyEvent(signed, kp.publicKey)
  t.ok(result.valid, result.error)
})

test('verifyEvent fails with wrong public key', t => {
  const kp = generateKeypair()
  const kp2 = generateKeypair()
  const signed = signEvent(bareEvent(), kp)
  const result = verifyEvent(signed, kp2.publicKey)
  t.absent(result.valid)
})

test('verifyEvent fails when payload tampered', t => {
  const kp = generateKeypair()
  const signed = signEvent(bareEvent(), kp)
  const tampered = { ...signed, payload: { ...signed.payload, stationId: 'HACKED' } }
  const result = verifyEvent(tampered, kp.publicKey)
  t.absent(result.valid)
  t.ok(result.error.includes('tampered') || result.error.includes('integrity'))
})

// ── Chain verification ────────────────────────────────────────────────────────
test('verifyChain links correctly', t => {
  const kp = generateKeypair()
  const ev0 = signEvent(bareEvent({ sequence: 0, prevHash: null }), kp)
  const ev1 = signEvent(bareEvent({ sequence: 1, prevHash: ev0.eventId }), kp)
  t.ok(verifyChain(ev0, null).valid)
  t.ok(verifyChain(ev1, ev0).valid)
})

test('verifyChain detects broken chain', t => {
  const kp = generateKeypair()
  const ev0 = signEvent(bareEvent({ sequence: 0, prevHash: null }), kp)
  const ev1 = signEvent(bareEvent({ sequence: 1, prevHash: 'wronghash' }), kp)
  t.absent(verifyChain(ev1, ev0).valid)
})

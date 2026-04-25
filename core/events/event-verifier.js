// Verifies a signed event. Two checks are required and both must pass:
//   1. eventId integrity  — recompute hash and compare with event.eventId
//   2. signature validity — Ed25519.verify(eventId, signature, publicKey)
//
// A valid signature ONLY proves authorship and integrity.
// It does NOT prove the payload content is truthful (anti-cheat is separate).

import hyperCrypto from 'hypercore-crypto'
import { hashEvent } from '../crypto/canonical.js'

export function verifyEvent(event, publicKey) {
  if (!event.eventId) return { valid: false, error: 'missing eventId' }
  if (!event.signature) return { valid: false, error: 'missing signature' }

  // 1. Integrity: does the canonical hash match the stored eventId?
  const expectedId = hashEvent(event) // canonicalizeEvent strips eventId+signature
  if (expectedId !== event.eventId) {
    return { valid: false, error: 'eventId integrity check failed (payload tampered)' }
  }

  // 2. Signature: does the signature match the eventId under the given public key?
  const pubKeyBuf = Buffer.isBuffer(publicKey) ? publicKey : Buffer.from(publicKey, 'hex')
  const msgBuf = Buffer.from(event.eventId, 'hex')
  const sigBuf = Buffer.from(event.signature, 'hex')

  const ok = hyperCrypto.verify(msgBuf, sigBuf, pubKeyBuf)
  return ok ? { valid: true } : { valid: false, error: 'invalid signature' }
}

// Verify that prevHash correctly links to the previousEvent
export function verifyChain(event, previousEvent) {
  if (event.sequence === 0) {
    if (event.prevHash !== null) {
      return { valid: false, error: 'first event must have prevHash: null' }
    }
    return { valid: true }
  }
  if (!previousEvent) return { valid: false, error: 'missing previous event' }
  if (event.prevHash !== previousEvent.eventId) {
    return { valid: false, error: 'prevHash does not match previous eventId' }
  }
  if (event.sequence !== previousEvent.sequence + 1) {
    return { valid: false, error: 'sequence gap detected' }
  }
  return { valid: true }
}

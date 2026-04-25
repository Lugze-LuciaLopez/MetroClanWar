// Canonical event serialisation for deterministic hashing and signing.
//
// Rule: exclude `eventId` and `signature` fields, sort all object keys
// recursively, then JSON.stringify. The result is BLAKE2b-hashed via
// hypercore-crypto (32-byte output, returned as hex string).
//
// This means two events with identical logical content but different key
// insertion order will always produce the same hash — crucial for
// distributed validator agreement.

import hyperCrypto from 'hypercore-crypto'

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(k => [k, sortKeys(value[k])])
    )
  }
  return value
}

// Returns the canonical JSON string (no eventId, no signature).
export function canonicalizeEvent(event) {
  const { eventId: _e, signature: _s, ...rest } = event
  return JSON.stringify(sortKeys(rest))
}

// Returns BLAKE2b(canonical) as a 64-char hex string.
export function hashEvent(event) {
  const canonical = canonicalizeEvent(event)
  return hyperCrypto.hash(Buffer.from(canonical, 'utf8')).toString('hex')
}

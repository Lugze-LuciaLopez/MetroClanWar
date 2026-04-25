// Signs a bare event (without eventId/signature) and returns the complete event.
//
// Protocol:
//   eventId  = BLAKE2b( canonicalize(event_without_eventId_and_signature) )  → hex
//   signature = Ed25519.sign( Buffer.from(eventId, 'hex'), secretKey )        → hex

import hyperCrypto from 'hypercore-crypto'
import { hashEvent } from '../crypto/canonical.js'

export function signEvent(bareEvent, keypair) {
  const eventId = hashEvent(bareEvent)
  const signature = hyperCrypto
    .sign(Buffer.from(eventId, 'hex'), keypair.secretKey)
    .toString('hex')
  return { ...bareEvent, eventId, signature }
}

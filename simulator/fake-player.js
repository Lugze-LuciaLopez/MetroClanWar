// Creates a simulated player with a real Ed25519 keypair.
// All events it produces are cryptographically signed and chain-linked.

import { generateKeypair, playerId } from '../core/crypto/identity.js'
import { signEvent } from '../core/events/event-signer.js'
import { weekId } from '../core/weekly-engine/week-utils.js'

export function createFakePlayer(clanId, name = null, existingKeypair = null) {
  const keypair = existingKeypair ?? generateKeypair()
  const pid = playerId(keypair.publicKey)
  const displayName = name ?? `player-${pid.slice(0, 8)}`
  let sequence = 0
  let prevHash = null

  function makeEvent(type, payload, timestamp = Math.floor(Date.now() / 1000)) {
    const bare = {
      schemaVersion: 1,
      type,
      playerId: pid,
      timestamp,
      weekId: weekId(timestamp),
      sequence: sequence++,
      prevHash,
      payload
    }
    const signed = signEvent(bare, keypair)
    prevHash = signed.eventId
    return signed
  }

  return { keypair, playerId: pid, clanId, displayName, makeEvent }
}

// Replica peer: always-on storage node.
// - Receives signed events from any peer and stores them (no validation of route/scoring logic).
// - On new connection, sends all stored events (sync).
// - Re-broadcasts any new event to all other connected peers.

import { createSwarm, onConnection, broadcast } from './shared/swarm-utils.js'
import { encode, decode, createLineReader, MSG_TYPE } from './shared/protocol.js'
import { EventStore } from './shared/event-store.js'
import { verifyEvent } from '../core/events/event-verifier.js'
import { homedir } from 'os'
import { join } from 'path'

const DEFAULT_STORE = join(homedir(), '.metro-clan-war', 'replica-store')

export async function startReplica({ storePath = DEFAULT_STORE, verbose = true } = {}) {
  const store = new EventStore(storePath)
  await store.init()

  const { swarm } = createSwarm({ server: true, client: true })

  if (verbose) console.log('[replica] starting, store:', storePath)

  onConnection(swarm, async (conn) => {
    if (verbose) console.log('[replica] peer connected')

    // Send all stored events to the new peer for sync
    const all = await store.readAll()
    if (all.length > 0) {
      conn.write(encode(MSG_TYPE.SYNC_RESPONSE, { events: all }))
      if (verbose) console.log(`[replica] sent ${all.length} events in sync`)
    }

    createLineReader(conn, async (line) => {
      const msg = decode(line)
      if (!msg) return

      if (msg.msgType === MSG_TYPE.EVENT) {
        const event = msg.payload
        // Basic signature verification before storing
        if (!event || !event.eventId || !event.playerId) return
        const pubKeyBuf = Buffer.from(event.playerId, 'hex')
        const result = verifyEvent(event, pubKeyBuf)
        if (!result.valid) {
          if (verbose) console.warn('[replica] rejected invalid event:', result.error)
          return
        }
        // Deduplicate
        const known = await store.knownIds()
        if (known.has(event.eventId)) return

        await store.append(event)
        if (verbose) console.log(`[replica] stored event ${event.type} from ${event.playerId.slice(0, 8)}`)

        // Re-broadcast to all other peers
        broadcast(swarm, encode(MSG_TYPE.EVENT, event), conn)
      }

      if (msg.msgType === MSG_TYPE.SYNC_REQUEST) {
        const all = await store.readAll()
        conn.write(encode(MSG_TYPE.SYNC_RESPONSE, { events: all }))
      }
    })
  })

  await swarm.flush()
  if (verbose) console.log('[replica] ready — listening for peers')

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await swarm.destroy()
    process.exit(0)
  })

  return { swarm, store }
}

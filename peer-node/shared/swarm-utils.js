import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'

// Fixed 32-byte topic — all peers of this app join the same swarm.
// b4a.from pads/truncates to 32 bytes when given a string.
const TOPIC_STRING = 'metro-clan-war-v1'

function appTopic() {
  const buf = Buffer.alloc(32)
  Buffer.from(TOPIC_STRING).copy(buf)
  return buf
}

// Creates a Hyperswarm instance and joins the shared app topic.
// Returns { swarm, topic } — caller must await swarm.flush() if needed before use.
export function createSwarm({ server = true, client = true } = {}) {
  const swarm = new Hyperswarm()
  const topic = appTopic()
  swarm.join(topic, { server, client })
  return { swarm, topic }
}

// Convenience: wraps swarm 'connection' events into a callback.
// handler(conn, peerInfo) is called for each new connection.
export function onConnection(swarm, handler) {
  swarm.on('connection', (conn, info) => {
    conn.on('error', () => {})   // suppress unhandled errors on disconnect
    handler(conn, info)
  })
}

// Broadcast a raw string to all currently connected peers except `except`.
export function broadcast(swarm, message, except = null) {
  for (const conn of swarm.connections) {
    if (conn !== except) {
      conn.write(message)
    }
  }
}

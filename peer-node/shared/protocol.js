export const MSG_TYPE = Object.freeze({
  EVENT:         'EVENT',
  SYNC_REQUEST:  'SYNC_REQUEST',
  SYNC_RESPONSE: 'SYNC_RESPONSE',
  WEEKLY_RESULT: 'WEEKLY_RESULT',
  PEER_INFO:     'PEER_INFO'
})

export function encode(msgType, payload) {
  return JSON.stringify({ msgType, payload }) + '\n'
}

export function decode(line) {
  try {
    const msg = JSON.parse(line)
    if (!msg.msgType) return null
    return msg
  } catch {
    return null
  }
}

// Splits a readable stream by newlines and calls onLine(line) for each complete line.
export function createLineReader(stream, onLine) {
  let buf = ''
  stream.on('data', chunk => {
    buf += chunk.toString()
    let idx
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (line) onLine(line)
    }
  })
}

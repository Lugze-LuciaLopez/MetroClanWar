// Validator bridge: a localhost-only WebSocket server hosted inside the
// validator-peer. Read-only by default — streams every incoming event with
// its verification verdict. Accepts a single command, `computeNow`, that
// triggers an immediate WEEKLY_RESULT publication.

import { WebSocketServer } from 'ws'

export function startValidatorBridge({
  port = 8786,
  validatorId,
  computeNow,
  verbose = true
}) {
  const wss = new WebSocketServer({ port })
  const clients = new Set()

  if (verbose) console.log(`[validator-bridge] listening ws://localhost:${port}`)

  function sendAll(obj) {
    const msg = JSON.stringify(obj)
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg)
    }
  }

  function send(ws, obj) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj))
  }

  wss.on('connection', (ws) => {
    clients.add(ws)
    if (verbose) console.log('[validator-bridge] ui connected')
    send(ws, { type: 'HELLO', validatorId })

    ws.on('message', async (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (msg?.action === 'computeNow' && computeNow) {
        try {
          const result = await computeNow()
          send(ws, { type: 'COMPUTE_DONE', published: !!result })
        } catch (e) {
          send(ws, { type: 'COMPUTE_ERROR', message: String(e?.message ?? e) })
        }
      }
    })

    ws.on('close', () => clients.delete(ws))
    ws.on('error', () => {})
  })

  return {
    notifyReceived(event) {
      sendAll({ type: 'EVENT_RECEIVED', event: summarize(event) })
    },
    notifyAccepted(event) {
      sendAll({ type: 'EVENT_ACCEPTED', event: summarize(event) })
    },
    notifyRejected(event, reason) {
      sendAll({ type: 'EVENT_REJECTED', event: summarize(event), reason })
    },
    notifyPublished(event) {
      sendAll({ type: 'EVENT_PUBLISHED', event: summarize(event) })
    },
    close: () => wss.close()
  }
}

function summarize(event) {
  if (!event) return null
  return {
    eventId: event.eventId,
    type: event.type,
    playerId: event.playerId,
    weekId: event.weekId,
    timestamp: event.timestamp,
    payload: event.payload
  }
}

#!/usr/bin/env node
// Entry point for all peer roles.
//
// Usage:
//   node peer-node/start.js --role=replica  [--store=PATH]
//   node peer-node/start.js --role=validator [--store=PATH] [--compute-results]
//   node peer-node/start.js --role=player   [--simulate]

import { homedir } from 'os'
import { setWeekOffset, nowSecs } from '../core/weekly-engine/clock.js'
import { weekId } from '../core/weekly-engine/week-utils.js'

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=')
      return [k, v ?? true]
    })
)

// Expand ~ in path arguments
function expandPath(p) {
  return p ? p.replace(/^~/, homedir()) : p
}

const weekOffset = args['week-offset'] ? Number(args['week-offset']) : 0
if (weekOffset) {
  setWeekOffset(weekOffset)
  console.log(`[clock] week-offset=${weekOffset} → setmana actual: ${weekId(nowSecs())}`)
}

const role = args['role'] ?? 'player'

if (role === 'replica') {
  const { startReplica } = await import('./replica-peer.js')
  await startReplica({ storePath: expandPath(args['store']) })

} else if (role === 'validator') {
  const { startValidator } = await import('./validator-peer.js')
  await startValidator({
    storePath: expandPath(args['store']),
    computeResults: args['compute-results'] === true || args['compute-results'] === 'true',
    demo: args['demo'] === true || args['demo'] === 'true',
    demoPort: args['demo-port'] ? Number(args['demo-port']) : undefined
  })

} else {
  const { startPlayer } = await import('./player-peer.js')
  await startPlayer({
    simulate: args['simulate'] === true || args['simulate'] === 'true',
    demo: args['demo'] === true || args['demo'] === 'true',
    demoPort: args['demo-port'] ? Number(args['demo-port']) : undefined,
    autoClan: args['clan'] || undefined,
    identityPath: expandPath(args['identity']) || undefined
  })
}

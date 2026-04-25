#!/usr/bin/env node
// Entry point for all peer roles.
//
// Usage:
//   node peer-node/start.js --role=replica  [--store=PATH]
//   node peer-node/start.js --role=validator [--store=PATH] [--compute-results]
//   node peer-node/start.js --role=player   [--simulate]

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=')
      return [k, v ?? true]
    })
)

const role = args['role'] ?? 'player'

if (role === 'replica') {
  const { startReplica } = await import('./replica-peer.js')
  await startReplica({ storePath: args['store'] })

} else if (role === 'validator') {
  const { startValidator } = await import('./validator-peer.js')
  await startValidator({
    storePath: args['store'],
    computeResults: args['compute-results'] === true || args['compute-results'] === 'true'
  })

} else {
  const { startPlayer } = await import('./player-peer.js')
  await startPlayer({ simulate: args['simulate'] === true || args['simulate'] === 'true' })
}

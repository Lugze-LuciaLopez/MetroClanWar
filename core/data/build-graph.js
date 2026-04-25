import { haversineMeters } from './geofence-utils.js'

const MAX_SPEED_MS = 40000 / 3600  // 40 km/h in m/s (fastest plausible)
const MIN_SPEED_MS = 15000 / 3600  // 15 km/h in m/s (slowest plausible)

// Build metro graph from normalised stations and ordered lines.
// Returns { nodes, edges } where:
//   nodes: { [stationId]: { lat, lon, lineIds, name } }
//   edges: Array of line edges + transfer edges
export function buildGraph(stations, lines) {
  const nodes = {}
  const edges = []

  for (const s of stations) {
    nodes[s.stationId] = { lat: s.lat, lon: s.lon, lineIds: s.lineIds, name: s.name }
  }

  // Line edges: consecutive stations within each ordered line
  for (const [lineId, lineData] of Object.entries(lines)) {
    const ids = lineData.stations
    for (let i = 0; i < ids.length - 1; i++) {
      const fromId = ids[i]
      const toId = ids[i + 1]
      const from = nodes[fromId]
      const to = nodes[toId]
      if (!from || !to) {
        console.warn(`[build-graph] unknown station in ${lineId}: ${fromId} → ${toId}`)
        continue
      }
      const dist = haversineMeters(from.lat, from.lon, to.lat, to.lon)
      edges.push({
        from: fromId,
        to: toId,
        lineId,
        distanceMeters: Math.round(dist),
        expectedMinSeconds: Math.round(dist / MAX_SPEED_MS),
        expectedMaxSeconds: Math.round(dist / MIN_SPEED_MS),
        type: 'line'
      })
    }
  }

  // Transfer edges: stations serving multiple lines get internal transfer edges
  // between each pair of lineIds (models the platform-change time).
  for (const s of stations) {
    if (s.lineIds.length < 2) continue
    for (let i = 0; i < s.lineIds.length - 1; i++) {
      for (let j = i + 1; j < s.lineIds.length; j++) {
        edges.push({
          from: s.stationId,
          to: s.stationId,
          fromLine: s.lineIds[i],
          toLine: s.lineIds[j],
          type: 'transfer',
          transferSeconds: 120
        })
      }
    }
  }

  return { nodes, edges }
}

// Orders a set of stations along a MULTILINESTRING by projecting each station
// point onto the line and computing its arc-length from the start.
// This gives a deterministic, geometry-based ordering without manual data.

import { haversineMeters } from './geofence-utils.js'

// Returns the arc-length (metres from line start) of the closest projection
// of (lat, lon) onto the given MULTILINESTRING (array of linestrings).
function arcLength(lat, lon, lineStrings) {
  let bestDist = Infinity
  let bestArc = 0
  let cumLen = 0

  for (const ls of lineStrings) {
    for (let i = 0; i < ls.length - 1; i++) {
      const A = ls[i]   // { x: lon, y: lat }
      const B = ls[i + 1]

      const segLen = haversineMeters(A.y, A.x, B.y, B.x)

      // Local planar projection (accurate enough for metro distances < 50 km)
      const midLat = (lat + A.y + B.y) / 3
      const cosLat = Math.cos(midLat * Math.PI / 180)
      const px = (lon - A.x) * cosLat
      const py = lat - A.y
      const dx = (B.x - A.x) * cosLat
      const dy = B.y - A.y
      const lenSq = dx * dx + dy * dy

      let t, dist
      if (lenSq < 1e-20) {
        t = 0
        dist = haversineMeters(lat, lon, A.y, A.x)
      } else {
        t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq))
        const pLon = A.x + (B.x - A.x) * t
        const pLat = A.y + (B.y - A.y) * t
        dist = haversineMeters(lat, lon, pLat, pLon)
      }

      if (dist < bestDist) {
        bestDist = dist
        bestArc = cumLen + t * segLen
      }
      cumLen += segLen
    }
  }
  return bestArc
}

// Returns stations sorted by their position along lineStrings.
export function orderStationsForLine(stations, lineStrings) {
  return stations
    .map(s => ({ ...s, _arc: arcLength(s.lat, s.lon, lineStrings) }))
    .sort((a, b) => a._arc - b._arc)
    .map(({ _arc, ...s }) => s)
}

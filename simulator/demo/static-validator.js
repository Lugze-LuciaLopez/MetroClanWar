// Minimal, pure static validator used by the player-peer (pre-flight) and
// reusable by anyone who needs to gate a static route without GPS.
//
// Inputs:
//   stations: [{ stationId, tOffsetSecs }]
//   linesData: { [lineId]: { stations: [stationId, ...] } }   (data/lines.json)
//   stationsIndex: { [stationId]: { lineIds: [...] } }        (built from data/stations.json)
//
// Returns { valid:true, reason, lineId } on success,
// or     { valid:false, reason } on the first failed rule.

const MIN_SECS_BETWEEN_STATIONS = 30

export function validateStaticRoute(stations, linesData, stationsIndex) {
  if (!Array.isArray(stations) || stations.length < 2) {
    return { valid: false, reason: 'Ruta massa curta' }
  }

  // 1. Existence
  for (const s of stations) {
    if (!stationsIndex[s.stationId]) {
      return { valid: false, reason: `Estació desconeguda: ${s.stationId}` }
    }
  }

  // 2. Common line: pick a lineId that contains every station of the route.
  const candidateLines = stations
    .map(s => new Set(stationsIndex[s.stationId].lineIds))
    .reduce((acc, set) => acc === null ? set : new Set([...acc].filter(x => set.has(x))), null)

  if (!candidateLines || candidateLines.size === 0) {
    return { valid: false, reason: 'Estacions de línies diferents' }
  }

  // 3. Order & consecutivity within the chosen line.
  let pickedLine = null
  for (const lineId of candidateLines) {
    const order = linesData[lineId]?.stations
    if (!order) continue
    const indices = stations.map(s => order.indexOf(s.stationId))
    if (indices.some(i => i < 0)) continue
    const direction = Math.sign(indices[1] - indices[0])
    if (direction === 0) continue
    let ok = true
    for (let i = 1; i < indices.length; i++) {
      const delta = indices[i] - indices[i - 1]
      if (delta !== direction) { ok = false; break } // strictly consecutive, monotonic
    }
    if (ok) { pickedLine = lineId; break }
  }

  if (!pickedLine) {
    return { valid: false, reason: 'Estacions no consecutives' }
  }

  // 4. No teleport: enforce a minimum simulated time between stops.
  for (let i = 1; i < stations.length; i++) {
    const dt = stations[i].tOffsetSecs - stations[i - 1].tOffsetSecs
    if (dt < MIN_SECS_BETWEEN_STATIONS) {
      return { valid: false, reason: 'Ruta impossible: temps massa curt' }
    }
  }

  return { valid: true, reason: 'Trajecte coherent', lineId: pickedLine }
}

export function buildStationsIndex(stationsArray) {
  const idx = {}
  for (const s of stationsArray) idx[s.stationId] = s
  return idx
}

// Replays a static route in scaled real time, emitting STATION_DETECTED ticks.
// Resolves with the session payload that the demo-bridge will sign and
// broadcast as a METRO_SESSION_CONFIRMED event.

import { POINTS_PER_STATION } from './routes.js'

export function runRoute({
  route,
  stationsIndex,
  linesData,
  timeScale = 1 / 60,
  pointsPerStation = POINTS_PER_STATION,
  startTimestamp = Math.floor(Date.now() / 1000),
  onTick = () => {}
}) {
  let cancelled = false
  const timers = []

  const promise = new Promise((resolve) => {
    const stations = route.stations
    let accumulatedPoints = 0

    stations.forEach((stop, i) => {
      const delta = i === 0 ? 0 : stop.tOffsetSecs - stations[i - 1].tOffsetSecs
      const previousMs = i === 0 ? 0 : (stations[i - 1].tOffsetSecs * timeScale * 1000)
      const fireAtMs = previousMs + delta * timeScale * 1000

      const t = setTimeout(() => {
        if (cancelled) return
        const meta = stationsIndex[stop.stationId]
        accumulatedPoints += pointsPerStation
        onTick({
          type: 'STATION_DETECTED',
          stationId: stop.stationId,
          stationName: meta?.name ?? stop.stationId,
          lineId: route.lineId,
          lat: meta?.lat,
          lon: meta?.lon,
          simulatedTimestamp: startTimestamp + stop.tOffsetSecs,
          indexInRoute: i,
          totalStations: stations.length,
          accumulatedPoints
        })

        if (i === stations.length - 1) {
          const last = stations[stations.length - 1]
          const sessionPayload = {
            sessionId: `${route.routeId}-${startTimestamp}`,
            lineId: route.lineId,
            stations: stations.map(s => s.stationId),
            startTimestamp,
            endTimestamp: startTimestamp + last.tOffsetSecs,
            durationSeconds: last.tOffsetSecs,
            confidence: 1.0
          }
          resolve({
            sessionPayload,
            points: accumulatedPoints,
            routeId: route.routeId
          })
        }
      }, fireAtMs)
      timers.push(t)
    })
  })

  return {
    promise,
    stop() {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }
}

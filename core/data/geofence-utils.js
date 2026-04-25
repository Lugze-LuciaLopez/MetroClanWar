const EARTH_RADIUS_M = 6371000

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const a = sinDLat * sinDLat +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * sinDLon * sinDLon
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

export function pointInGeofence(lat, lon, fence) {
  return haversineMeters(lat, lon, fence.lat, fence.lon) <= fence.radiusMeters
}

// Build geofences with adaptive radii: stations closer than denseThreshold
// to any neighbour get a reduced radius to avoid false positives.
export function buildGeofences(stations, {
  baseRadius = 80,
  denseRadius = 50,
  denseThreshold = 150
} = {}) {
  return stations.map(station => {
    const hasDenseNeighbour = stations.some(other => {
      if (other.stationId === station.stationId) return false
      return haversineMeters(station.lat, station.lon, other.lat, other.lon) < denseThreshold
    })
    return {
      stationId: station.stationId,
      lat: station.lat,
      lon: station.lon,
      radiusMeters: hasDenseNeighbour ? denseRadius : baseRadius,
      lineIds: station.lineIds
    }
  })
}

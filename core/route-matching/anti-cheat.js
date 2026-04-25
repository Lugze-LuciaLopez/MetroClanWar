import { haversineMeters } from '../data/geofence-utils.js'

// Speed thresholds (km/h)
const SPEED_SOFT_LIMIT = 45   // suspicious — reduce confidence
const SPEED_HARD_LIMIT = 60   // impossible for BCN metro — reject segment

// Max allowed time skew vs current clock
const MAX_FUTURE_SECS = 5 * 60       // 5 min in the future
const MAX_PAST_SECS = 7 * 24 * 3600  // 7 days in the past

export function estimateSpeedKmh(lat1, lon1, ts1, lat2, lon2, ts2) {
  const distMeters = haversineMeters(lat1, lon1, lat2, lon2)
  const timeSec = Math.abs(ts2 - ts1)
  if (timeSec === 0) return Infinity
  return (distMeters / timeSec) * 3.6
}

// Returns { ok, speedKmh, reason }
export function checkSegmentSpeed(lat1, lon1, ts1, lat2, lon2, ts2) {
  const speedKmh = estimateSpeedKmh(lat1, lon1, ts1, lat2, lon2, ts2)
  if (speedKmh > SPEED_HARD_LIMIT) {
    return { ok: false, speedKmh, reason: `speed ${speedKmh.toFixed(1)} km/h exceeds hard limit` }
  }
  return { ok: true, speedKmh, suspicious: speedKmh > SPEED_SOFT_LIMIT }
}

export function validateTimestamp(timestamp, nowSecs = Math.floor(Date.now() / 1000)) {
  if (timestamp > nowSecs + MAX_FUTURE_SECS) return { valid: false, reason: 'timestamp too far in the future' }
  if (timestamp < nowSecs - MAX_PAST_SECS) return { valid: false, reason: 'timestamp too old' }
  return { valid: true }
}

// Detect mock/spoofed location (device flag, best-effort).
export function isMockLocation(sample) {
  return sample.isMock === true || sample.mockProvider === true
}

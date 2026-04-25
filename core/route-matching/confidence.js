// Computes a confidence score [0, 1] for a route match result.
// All penalties are cumulative; the final value is clamped to [0, 1].
//
// A score of 0 means the session is rejected outright.
// Values below 0.30 also result in zero points (see score-calculator).

const BASE = 0.85

export function calculateConfidence({
  gpsAccuracyMeters = 0,  // worst accuracy reading in the session
  maxSpeedKmh = 0,        // fastest inter-station speed detected
  gaps = 0,               // stations skipped in the best match
  coverage = 1,           // fraction of detected stations matched to the line
  hasMockLocation = false
}) {
  if (hasMockLocation) return 0
  if (maxSpeedKmh > 60) return 0   // hard reject

  let c = BASE

  // GPS accuracy penalty
  if (gpsAccuracyMeters > 100) c -= 0.20
  else if (gpsAccuracyMeters > 50) c -= 0.10

  // Speed penalty (soft)
  if (maxSpeedKmh > 45) c -= 0.30

  // Gaps penalty
  c -= gaps * 0.10

  // Coverage factor: if only half the detected stations matched, halve confidence
  c *= coverage

  return Math.max(0, Math.min(1, c))
}

// Map confidence score to scoring multiplier
export function confidenceMultiplier(confidence) {
  if (confidence >= 0.85) return 1.2
  if (confidence >= 0.60) return 1.0
  if (confidence >= 0.30) return 0.5
  return 0
}

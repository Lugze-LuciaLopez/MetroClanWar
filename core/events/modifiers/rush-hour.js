// Rush Hour modifier: half points during peak commute hours.
// Applies if the session START falls within a rush-hour window.
// Barcelona rush hours: 7–9h and 17–20h (local time UTC+2 simplified).

const BCN_OFFSET_SEC = 2 * 3600  // UTC+2 approximation
const WINDOWS = [
  { start: 7, end: 9 },
  { start: 17, end: 20 }
]

export default {
  type: 'RUSH_HOUR',
  scope: 'time',
  phase: 'multiply',

  isActive(startTimestamp) {
    const localHour = new Date((startTimestamp + BCN_OFFSET_SEC) * 1000).getUTCHours()
    return WINDOWS.some(w => localHour >= w.start && localHour < w.end)
  },

  apply(points) {
    return Math.floor(points * 0.5)
  }
}

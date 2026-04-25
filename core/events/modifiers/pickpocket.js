// Pickpocket modifier: subtracts a fixed penalty during active windows.
// Windows are set externally (e.g. by a validator publishing a RANDOM_EVENT_TRIGGERED).
// MVP1: configured via setWindows() for simulation; MVP2 will feed from P2P events.

let windows = []  // [{ startTimestamp, endTimestamp, penalty }]

export function setWindows(w) { windows = w }
export function clearWindows() { windows = [] }

export default {
  type: 'PICKPOCKET',
  scope: 'time',
  phase: 'subtract',

  isActive(startTimestamp) {
    return windows.some(w =>
      startTimestamp >= w.startTimestamp && startTimestamp < w.endTimestamp
    )
  },

  apply(points, session) {
    const ts = session.startTimestamp
    const active = windows.filter(w =>
      ts >= w.startTimestamp && ts < w.endTimestamp
    )
    const penalty = active.reduce((sum, w) => sum + (w.penalty ?? 10), 0)
    return points - penalty
  }
}

// Station Bonus: extra points if a session visits a designated bonus station.
// Bonus is applied AFTER all time modifiers (additive, not multiplicative).
// Multiple bonus stations in one session each add their own bonus.

let bonusStations = []  // [{ stationId, points }]

export function setStationBonuses(stations) { bonusStations = stations }
export function clearStationBonuses() { bonusStations = [] }

export default {
  type: 'STATION_BONUS',
  scope: 'station',
  phase: 'add',

  isActive(_startTimestamp, stations = []) {
    return stations.some(id => bonusStations.some(b => b.stationId === id))
  },

  // Returns additional points (does not modify base)
  apply(_points, session) {
    const visited = session.stations ?? []
    return visited.reduce((sum, stationId) => {
      const bonus = bonusStations.find(b => b.stationId === stationId)
      return sum + (bonus?.points ?? 0)
    }, 0)
  }
}

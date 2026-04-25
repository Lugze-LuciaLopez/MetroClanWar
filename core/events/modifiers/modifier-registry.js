// Central registry of all modifier instances.
// To add a new modifier: create its file and import it here.
// The score-calculator only talks to this module — no other changes needed.

import rushHour from './rush-hour.js'
import pickpocket from './pickpocket.js'
import bonificationDay from './bonification-day.js'
import stationBonus from './station-bonus.js'

// Ordered list: multiply-phase modifiers run before subtract, add runs last.
const ALL_MODIFIERS = [bonificationDay, rushHour, pickpocket, stationBonus]

// Returns every modifier that is currently active for (startTimestamp, stations).
export function getActiveModifiers(startTimestamp, stations = []) {
  return ALL_MODIFIERS.filter(m => m.isActive(startTimestamp, stations))
}

// Expose individual modifiers for external configuration (e.g. from simulator)
export { rushHour, pickpocket, bonificationDay, stationBonus }

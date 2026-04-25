// Test clock with week offset, used by player + validator peers.
// Allows simulating future weeks without changing system time.

let weekOffsetSec = 0

export function setWeekOffset(weeks) {
  weekOffsetSec = Math.floor(Number(weeks) * 7 * 86400)
}

export function getWeekOffset() {
  return weekOffsetSec
}

export function nowSecs() {
  return Math.floor(Date.now() / 1000) + weekOffsetSec
}

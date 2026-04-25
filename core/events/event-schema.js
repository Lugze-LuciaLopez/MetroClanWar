// Minimal structural validation for each event type.
// Does NOT replace signature verification — it only checks field presence.

import { EventType } from './event-types.js'

const BASE_FIELDS = ['schemaVersion', 'type', 'playerId', 'timestamp', 'weekId', 'sequence']

// Required payload fields per event type
const PAYLOAD_REQUIRED = {
  [EventType.PLAYER_CREATED]: [],
  [EventType.PERSONALITY_TEST_COMPLETED]: ['answers', 'clanCandidate'],
  [EventType.CLAN_ASSIGNED]: ['clanId'],
  [EventType.STATION_DETECTED]: ['stationId', 'lineCandidates', 'accuracy', 'source'],
  [EventType.METRO_SESSION_STARTED]: ['sessionId', 'stationId'],
  [EventType.METRO_SESSION_CONFIRMED]: [
    'sessionId', 'lineId', 'stations',
    'startTimestamp', 'endTimestamp', 'durationSeconds', 'confidence'
  ],
  [EventType.SCORE_GRANTED]: ['sessionId', 'lineId', 'clanId', 'points', 'reason'],
  [EventType.WEEKLY_RESULT]: ['weekId', 'clanRanking', 'validatorSignatures'],
  [EventType.INVASION_DECLARED]: ['weekId', 'attackerClanId', 'targetLineId'],
  [EventType.INVASION_RESULT]: ['weekId', 'attackerClanId', 'defenderClanId', 'winner'],
  [EventType.CLAN_MEMBERSHIP_CHANGED]: ['playerId', 'fromClanId', 'toClanId', 'reason'],
  [EventType.RANDOM_EVENT_TRIGGERED]: ['eventKind', 'affectedScope']
}

export function validateEvent(event) {
  for (const field of BASE_FIELDS) {
    if (event[field] === undefined || event[field] === null) {
      return { valid: false, error: `missing base field: ${field}` }
    }
  }

  const requiredPayload = PAYLOAD_REQUIRED[event.type]
  if (!requiredPayload) {
    return { valid: false, error: `unknown event type: ${event.type}` }
  }

  const payload = event.payload ?? {}
  for (const field of requiredPayload) {
    if (payload[field] === undefined || payload[field] === null) {
      return { valid: false, error: `missing payload field: ${field}` }
    }
  }

  if (typeof event.timestamp !== 'number' || event.timestamp <= 0) {
    return { valid: false, error: 'invalid timestamp' }
  }

  if (typeof event.sequence !== 'number' || event.sequence < 0) {
    return { valid: false, error: 'invalid sequence' }
  }

  return { valid: true }
}

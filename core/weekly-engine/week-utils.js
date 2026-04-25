// ISO 8601 week utilities (weeks start on Monday, UTC).

// Returns "YYYY-Www" for a Unix timestamp (seconds).
export function weekId(timestamp) {
  const d = new Date(timestamp * 1000)
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = utc.getUTCDay() || 7  // Sun→7, Mon→1
  utc.setUTCDate(utc.getUTCDate() + 4 - day)  // shift to Thursday of ISO week
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((utc - yearStart) / 86400000 + 1) / 7)
  return `${utc.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

// Unix timestamp (seconds) of Monday 00:00:00 UTC of the week containing ts.
export function weekStart(timestamp) {
  const d = new Date(timestamp * 1000)
  const dayOfWeek = d.getUTCDay() || 7  // Mon=1 … Sun=7
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - (dayOfWeek - 1))
  monday.setUTCHours(0, 0, 0, 0)
  return Math.floor(monday.getTime() / 1000)
}

// Sunday 23:59:59 UTC of the week containing ts.
export function weekEnd(timestamp) {
  return weekStart(timestamp) + 7 * 24 * 3600 - 1
}

// True if an event that occurred in week W is still eligible when submitted.
// Grace period: events submitted within 24h after weekEnd still count.
export function isInGracePeriod(eventTimestamp, submittedAt) {
  const end = weekEnd(eventTimestamp)
  return submittedAt <= end + 24 * 3600
}

// Current week's Tuesday 00:00:00 UTC (when results are published).
export function resultsPublishedAt(timestamp) {
  return weekStart(timestamp) + 8 * 24 * 3600  // Mon + 8 days = next Tue
}

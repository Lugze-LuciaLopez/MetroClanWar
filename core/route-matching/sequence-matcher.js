// Matches a detected sequence of stationIds against every metro line.
// Uses a greedy subsequence search with gap tolerance (max 2 skipped stations).
//
// Input:  detectedStations — ordered array of stationIds from GPS observations
//         linesData        — lines.json object { lineId: { stations: [...] } }
// Output: best match object or null if no line fits

const MAX_GAPS = 2

export function matchSequence(detectedStations, linesData) {
  if (!detectedStations || detectedStations.length < 2) return null

  const results = []
  for (const [lineId, lineData] of Object.entries(linesData)) {
    const match = findBestMatchForLine(detectedStations, lineData.stations, lineId)
    if (match) results.push(match)
  }

  if (results.length === 0) return null

  // Prefer highest score; break ties by fewer gaps, then more matched stations
  results.sort((a, b) =>
    b.score - a.score ||
    a.gaps - b.gaps ||
    b.matchedCount - a.matchedCount
  )
  return results[0]
}

// Returns the best subsequence match for a single line, or null.
function findBestMatchForLine(detected, lineStations, lineId) {
  let lineIdx = 0
  let matchedCount = 0
  let gaps = 0
  let firstLineIdx = -1
  let lastLineIdx = -1

  for (const stationId of detected) {
    // Search forward in the line from current position
    const found = lineStations.indexOf(stationId, lineIdx)
    if (found === -1) continue  // station not on this line at all

    if (firstLineIdx === -1) {
      firstLineIdx = found
    } else {
      // Count skipped stations since last match
      const skipped = found - lineIdx
      if (skipped > MAX_GAPS) {
        // Too large a jump: restart from this point as a new potential match
        if (matchedCount >= 2) break  // keep what we have
        firstLineIdx = found
        matchedCount = 0
        gaps = 0
      } else {
        gaps += skipped
      }
    }

    matchedCount++
    lineIdx = found + 1
    lastLineIdx = found
  }

  if (matchedCount < 2) return null
  if (gaps > MAX_GAPS) return null

  const coverage = matchedCount / detected.length
  const score = coverage - gaps * 0.10

  return {
    lineId,
    matchedStations: lineStations.slice(firstLineIdx, lastLineIdx + 1),
    matchedCount,
    gaps,
    score,
    coverage
  }
}

// WKT parser for POINT and MULTILINESTRING geometries (WGS84).
// POINT: "POINT (lon lat)" → { lon, lat }
// MULTILINESTRING: "MULTILINESTRING ((x1 y1, x2 y2, ...), ...)"
//   → array of linestrings, each an array of { x: lon, y: lat }

export function parsePoint(wkt) {
  const m = wkt.match(/POINT\s*\(\s*([^\s]+)\s+([^\s)]+)\s*\)/)
  if (!m) throw new Error(`Invalid POINT WKT: ${wkt}`)
  return { lon: parseFloat(m[1]), lat: parseFloat(m[2]) }
}

export function parseMultiLineString(wkt) {
  const inner = wkt.match(/MULTILINESTRING\s*\(\s*(.+)\s*\)\s*$/s)
  if (!inner) throw new Error(`Invalid MULTILINESTRING: ${wkt.slice(0, 80)}...`)

  const lineStrings = []
  // Each sub-linestring is wrapped in its own parens: (x1 y1, x2 y2, ...)
  for (const m of inner[1].matchAll(/\(([^)]+)\)/g)) {
    const points = m[1].trim().split(',').map(pair => {
      const parts = pair.trim().split(/\s+/)
      return { x: parseFloat(parts[0]), y: parseFloat(parts[1]) }
    })
    lineStrings.push(points)
  }
  return lineStrings
}

// Slugify a station name to a stable stationId
export function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/·/g, '')       // remove Catalan middle dot (l·l → ll)
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

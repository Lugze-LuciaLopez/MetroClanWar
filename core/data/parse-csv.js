// Pure JS CSV parser with full RFC 4180 quoted-field support.
// Handles MULTILINESTRING fields that contain commas inside double quotes.

export function parseCSV(text) {
  const lines = splitCSVLines(text)
  if (lines.length < 2) return []
  const headers = parseCSVRow(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCSVRow(line)
    const obj = {}
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] ?? ''
    }
    rows.push(obj)
  }
  return rows
}

// Split text into CSV rows respecting quoted newlines
function splitCSVLines(text) {
  const lines = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
        current += ch
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      if (current) lines.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) lines.push(current)
  return lines
}

// Parse a single CSV row into an array of field strings (unquoted)
function parseCSVRow(line) {
  const fields = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

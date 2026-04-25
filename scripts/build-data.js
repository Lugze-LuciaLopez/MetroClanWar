#!/usr/bin/env node
// Generates data/stations.json, data/lines.json, data/metro-graph.json,
// data/geofences.json from the raw TMB CSVs.

import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parseCSV } from '../core/data/parse-csv.js'
import { parsePoint, parseMultiLineString, slugify } from '../core/data/parse-wkt.js'
import { orderStationsForLine } from '../core/data/order-stations.js'
import { buildGraph } from '../core/data/build-graph.js'
import { buildGeofences } from '../core/data/geofence-utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'data')

// Lines to include in the game (exclude FM funicular and TM telefèric)
const GAME_LINES = new Set(['L1', 'L2', 'L3', 'L4', 'L5', 'L9N', 'L9S', 'L10N', 'L10S', 'L11'])

// Parse the PICTO field which concatenates line IDs without separators:
// "L1L9SL10S" → ["L1", "L9S", "L10S"]
function parsePicto(picto) {
  return [...picto.matchAll(/L(?:10[NS]|9[NS]|11|[1-9])|FM|TM/g)].map(m => m[0])
}

// Ensure unique stationId: if slug already used, append numeric suffix
function makeUniqueId(base, used) {
  if (!used.has(base)) { used.add(base); return base }
  let i = 2
  while (used.has(`${base}_${i}`)) i++
  const id = `${base}_${i}`
  used.add(id)
  return id
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true })

  // ── Load CSVs ──────────────────────────────────────────────────────────────
  const estacionsRaw = await readFile(join(ROOT, 'estacions.csv'), 'utf8')
  const liniesRaw = await readFile(join(ROOT, 'linies_metro.csv'), 'utf8')

  const estacionsCSV = parseCSV(estacionsRaw)
  const liniesCSV = parseCSV(liniesRaw)

  // ── Parse lines (MULTILINESTRING + metadata) ───────────────────────────────
  const lineGeometries = {}  // lineId → array of linestrings
  const lineMeta = {}        // lineId → { name, color, origin, destination }

  for (const row of liniesCSV) {
    const lineId = row['NOM_LINIA']?.trim()
    if (!lineId || !GAME_LINES.has(lineId)) continue
    try {
      lineGeometries[lineId] = parseMultiLineString(row['GEOMETRY'])
      lineMeta[lineId] = {
        name: lineId,
        color: `#${row['COLOR_LINIA']?.trim() || '888888'}`,
        origin: row['ORIGEN_LINIA']?.trim() || '',
        destination: row['DESTI_LINIA']?.trim() || ''
      }
    } catch (e) {
      console.warn(`[build-data] could not parse MULTILINESTRING for ${lineId}: ${e.message}`)
    }
  }

  // ── Parse stations ─────────────────────────────────────────────────────────
  const usedIds = new Set()
  const allStations = []

  for (const row of estacionsCSV) {
    const pictoRaw = row['PICTO']?.trim() || ''
    const lineIds = parsePicto(pictoRaw).filter(l => GAME_LINES.has(l))
    if (lineIds.length === 0) continue  // skip FM, TM, unrecognised

    let coords
    try {
      const pt = parsePoint(row['GEOMETRY'])
      coords = { lat: pt.lat, lon: pt.lon }
    } catch {
      console.warn(`[build-data] bad POINT for station ${row['NOM_ESTACIO']}: ${row['GEOMETRY']}`)
      continue
    }

    const name = row['NOM_ESTACIO']?.trim() || `STATION_${row['ID_ESTACIO']}`
    const stationId = makeUniqueId(slugify(name), usedIds)

    allStations.push({
      stationId,
      name,
      lat: coords.lat,
      lon: coords.lon,
      lineIds,
      codiGrup: parseInt(row['CODI_GRUP_ESTACIO'], 10) || 0,
      originalId: parseInt(row['ID_ESTACIO'], 10) || 0
    })
  }

  console.log(`Parsed ${allStations.length} metro stations`)

  // ── Order stations per line via MULTILINESTRING projection ─────────────────
  const lineStations = {}  // lineId → ordered station IDs

  for (const lineId of GAME_LINES) {
    const geo = lineGeometries[lineId]
    const meta = lineMeta[lineId]
    if (!geo) {
      console.warn(`[build-data] no MULTILINESTRING for ${lineId}, skipping`)
      continue
    }

    const stationsForLine = allStations.filter(s => s.lineIds.includes(lineId))
    if (stationsForLine.length === 0) {
      console.warn(`[build-data] no stations found for ${lineId}`)
      continue
    }

    const ordered = orderStationsForLine(stationsForLine, geo)
    lineStations[lineId] = {
      ...meta,
      stations: ordered.map(s => s.stationId)
    }
    console.log(`  ${lineId}: ${ordered.length} stations — ${ordered[0]?.name} → ${ordered[ordered.length - 1]?.name}`)
  }

  // ── Build graph ────────────────────────────────────────────────────────────
  const graph = buildGraph(allStations, lineStations)
  console.log(`Graph: ${Object.keys(graph.nodes).length} nodes, ${graph.edges.length} edges`)

  // ── Build geofences ────────────────────────────────────────────────────────
  const geofences = buildGeofences(allStations)
  console.log(`Geofences: ${geofences.length} built`)

  // ── Write outputs ──────────────────────────────────────────────────────────
  const write = (file, data) =>
    writeFile(join(DATA_DIR, file), JSON.stringify(data, null, 2), 'utf8')

  await write('stations.json', allStations)
  await write('lines.json', lineStations)
  await write('metro-graph.json', graph)
  await write('geofences.json', geofences)

  console.log('\nDone → data/stations.json, lines.json, metro-graph.json, geofences.json')
}

main().catch(err => { console.error(err); process.exit(1) })

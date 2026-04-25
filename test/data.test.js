import test from 'brittle'
import { readFile } from 'fs/promises'
import { parseCSV } from '../core/data/parse-csv.js'
import { parsePoint, parseMultiLineString, slugify } from '../core/data/parse-wkt.js'
import { haversineMeters, pointInGeofence } from '../core/data/geofence-utils.js'

// ── CSV parser ────────────────────────────────────────────────────────────────
test('parseCSV basic', t => {
  const csv = 'name,value\nfoo,1\nbar,2'
  const rows = parseCSV(csv)
  t.is(rows.length, 2)
  t.is(rows[0].name, 'foo')
  t.is(rows[1].value, '2')
})

test('parseCSV quoted field with comma', t => {
  const csv = 'name,geo\ntest,"MULTILINESTRING ((1 2, 3 4))"'
  const rows = parseCSV(csv)
  t.is(rows[0].geo, 'MULTILINESTRING ((1 2, 3 4))')
})

// ── WKT parsers ───────────────────────────────────────────────────────────────
test('parsePoint', t => {
  const pt = parsePoint('POINT (2.107242 41.344677)')
  t.alike(pt, { lon: 2.107242, lat: 41.344677 })
})

test('parseMultiLineString single segment', t => {
  const ls = parseMultiLineString('MULTILINESTRING ((1 2, 3 4, 5 6))')
  t.is(ls.length, 1)
  t.is(ls[0].length, 3)
  t.alike(ls[0][0], { x: 1, y: 2 })
})

test('parseMultiLineString two segments', t => {
  const ls = parseMultiLineString('MULTILINESTRING ((1 2, 3 4), (5 6, 7 8))')
  t.is(ls.length, 2)
  t.alike(ls[1][1], { x: 7, y: 8 })
})

test('slugify basic', t => {
  t.is(slugify('Hospital de Bellvitge'), 'HOSPITAL_DE_BELLVITGE')
  t.is(slugify('Av. Carrilet'), 'AV_CARRILET')
  t.is(slugify('Paral·lel'), 'PARALLEL')
  t.is(slugify('ZAL | Riu Vell'), 'ZAL_RIU_VELL')
})

// ── Haversine ─────────────────────────────────────────────────────────────────
test('haversineMeters Catalunya-Urquinaona (~400m)', t => {
  // Catalunya L1: 41.387713, 2.169716
  // Urquinaona L1: 41.388846, 2.173667
  const d = haversineMeters(41.387713, 2.169716, 41.388846, 2.173667)
  t.ok(d > 300 && d < 500, `Expected ~400m, got ${d.toFixed(0)}m`)
})

test('pointInGeofence inside', t => {
  const fence = { lat: 41.387713, lon: 2.169716, radiusMeters: 80 }
  t.ok(pointInGeofence(41.387713, 2.169716, fence))
  t.ok(pointInGeofence(41.38776, 2.16978, fence))
})

test('pointInGeofence outside', t => {
  const fence = { lat: 41.387713, lon: 2.169716, radiusMeters: 80 }
  t.absent(pointInGeofence(41.39, 2.18, fence))
})

// ── Generated data integrity ──────────────────────────────────────────────────
test('stations.json has expected lines', async t => {
  const stations = JSON.parse(await readFile('data/stations.json', 'utf8'))
  t.ok(stations.length >= 130, `Expected ≥130 stations, got ${stations.length}`)
  const l3 = stations.filter(s => s.lineIds.includes('L3'))
  t.ok(l3.length >= 20, `L3 should have ≥20 stations, got ${l3.length}`)
})

test('lines.json L1 order is correct', async t => {
  const lines = JSON.parse(await readFile('data/lines.json', 'utf8'))
  t.ok(lines.L1, 'L1 exists')
  t.is(lines.L1.stations[0], 'HOSPITAL_DE_BELLVITGE', 'L1 starts at Hospital de Bellvitge')
  t.is(lines.L1.stations[lines.L1.stations.length - 1], 'FONDO', 'L1 ends at Fondo')
})

test('metro-graph.json has line and transfer edges', async t => {
  const graph = JSON.parse(await readFile('data/metro-graph.json', 'utf8'))
  const lineEdges = graph.edges.filter(e => e.type === 'line')
  const transferEdges = graph.edges.filter(e => e.type === 'transfer')
  t.ok(lineEdges.length > 140, `Expected >140 line edges, got ${lineEdges.length}`)
  t.ok(transferEdges.length > 5, `Expected >5 transfer edges, got ${transferEdges.length}`)
})

test('geofences.json radii are in valid range', async t => {
  const geofences = JSON.parse(await readFile('data/geofences.json', 'utf8'))
  for (const f of geofences) {
    t.ok(f.radiusMeters >= 50 && f.radiusMeters <= 80,
      `${f.stationId} radius ${f.radiusMeters} out of [50,80]`)
  }
})

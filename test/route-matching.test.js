import test from 'brittle'
import { matchSequence } from '../core/route-matching/sequence-matcher.js'
import { calculateConfidence, confidenceMultiplier } from '../core/route-matching/confidence.js'
import { checkSegmentSpeed, validateTimestamp } from '../core/route-matching/anti-cheat.js'

// Minimal fake lines data for testing
const FAKE_LINES = {
  L3: {
    stations: [
      'ZONA_UNIVERSITARIA', 'PALAU_REIAL', 'MARIA_CRISTINA', 'LES_CORTS',
      'PLACA_DEL_CENTRE', 'SANTS_ESTACIO', 'TARRAGONA', 'ROCAFORT',
      'URGELL', 'SANT_ANTONI', 'UNIVERSITAT', 'CATALUNYA',
      'PASSEIG_DE_GRACIA', 'DIAGONAL', 'FONTANA', 'GRACIA',
      'LESSEPS', 'VALLCARCA', 'PENITENTS', 'VALL_D_HEBRON',
      'MONTBAU', 'MUNDET', 'VILAPICINA', 'TORRE_LLOBETA',
      'VIRREI_AMAT', 'ALFONS_X', 'JOANIC', 'VERDAGUER',
      'TRAVESSERA', 'CANYELLES', 'ROQUETES', 'TRINITAT_NOVA'
    ]
  },
  L5: {
    stations: [
      'CORNELLA_CENTRE', 'ALMEDA', 'COLLBLANC', 'BADAL', 'PLACA_DE_SANTS',
      'SANTS_ESTACIO', 'ENTENCA', 'HOSPITAL_CLINIC', 'DIAGONAL',
      'VERDAGUER', 'SAGRADA_FAMILIA', 'CAMP_DE_L_ARPA', 'CLOT',
      'NAVAS', 'LA_SAGRERA', 'CONGRES', 'MARAGALL', 'VILAPICINA',
      'HORTA', 'EL_CARMEL', 'EL_COLL_LA_TEIXONERA', 'MONTBAU',
      'VALL_D_HEBRON', 'VALL_D_HEBRON_2', 'PENITENTS', 'LA_VALL',
      'CORNELLA_EL_PRAT'
    ]
  }
}

// ── matchSequence ─────────────────────────────────────────────────────────────
test('matchSequence perfect L3 sub-route', t => {
  const detected = ['FONTANA', 'GRACIA', 'LESSEPS']
  const result = matchSequence(detected, FAKE_LINES)
  t.ok(result, 'should find a match')
  t.is(result.lineId, 'L3')
  t.is(result.gaps, 0)
})

test('matchSequence tolerates one missing station', t => {
  const detected = ['FONTANA', 'LESSEPS']  // GRACIA is missing
  const result = matchSequence(detected, FAKE_LINES)
  t.ok(result)
  t.is(result.lineId, 'L3')
  t.ok(result.gaps >= 1)
})

test('matchSequence returns null for impossible sequence', t => {
  const detected = ['FONTANA', 'COLLBLANC', 'VERDAGUER']  // random stations, no line
  // These happen to be on different lines with big gaps
  const result = matchSequence(detected, FAKE_LINES)
  // Either no match or a low-confidence one with many gaps
  if (result) {
    t.ok(result.gaps >= 2 || result.coverage < 0.5)
  } else {
    t.pass('correctly returned null')
  }
})

test('matchSequence needs at least 2 detected stations', t => {
  t.is(matchSequence(['FONTANA'], FAKE_LINES), null)
  t.is(matchSequence([], FAKE_LINES), null)
})

test('matchSequence prefers L5 for L5 stations', t => {
  const detected = ['DIAGONAL', 'VERDAGUER', 'SAGRADA_FAMILIA']
  const result = matchSequence(detected, FAKE_LINES)
  t.ok(result)
  t.is(result.lineId, 'L5')
})

// ── calculateConfidence ───────────────────────────────────────────────────────
test('calculateConfidence nominal case', t => {
  const c = calculateConfidence({ gpsAccuracyMeters: 40, maxSpeedKmh: 28, gaps: 0, coverage: 1 })
  t.ok(c >= 0.85 && c <= 1, `Expected ≥0.85, got ${c}`)
})

test('calculateConfidence bad GPS accuracy', t => {
  const c = calculateConfidence({ gpsAccuracyMeters: 150, maxSpeedKmh: 28, gaps: 0, coverage: 1 })
  t.ok(c < 0.75, `Expected <0.75, got ${c}`)
})

test('calculateConfidence returns 0 for mock location', t => {
  const c = calculateConfidence({ hasMockLocation: true })
  t.is(c, 0)
})

test('calculateConfidence returns 0 for speed > 60', t => {
  const c = calculateConfidence({ maxSpeedKmh: 80 })
  t.is(c, 0)
})

test('confidenceMultiplier brackets', t => {
  t.is(confidenceMultiplier(0.90), 1.2)
  t.is(confidenceMultiplier(0.75), 1.0)
  t.is(confidenceMultiplier(0.45), 0.5)
  t.is(confidenceMultiplier(0.10), 0)
})

// ── Anti-cheat ────────────────────────────────────────────────────────────────
test('checkSegmentSpeed normal metro speed', t => {
  // Catalunya → Urquinaona ~400m in 90s → ~16 km/h
  const result = checkSegmentSpeed(41.387713, 2.169716, 1000, 41.388846, 2.173667, 1090)
  t.ok(result.ok)
  t.absent(result.suspicious)
})

test('checkSegmentSpeed rejects > 60 km/h', t => {
  // Same 400m but in 10 seconds → 144 km/h
  const result = checkSegmentSpeed(41.387713, 2.169716, 1000, 41.388846, 2.173667, 1010)
  t.absent(result.ok)
})

test('validateTimestamp rejects future', t => {
  const now = Math.floor(Date.now() / 1000)
  const result = validateTimestamp(now + 10 * 60, now)
  t.absent(result.valid)
})

test('validateTimestamp accepts current time', t => {
  const now = Math.floor(Date.now() / 1000)
  const result = validateTimestamp(now, now)
  t.ok(result.valid)
})

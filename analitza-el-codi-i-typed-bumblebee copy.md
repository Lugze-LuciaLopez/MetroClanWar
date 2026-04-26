# Pla actiu — Sistema d'events aleatoris (carterista, punt calent, música, avaria)

## Context

El joc ha de tenir més dinamisme afegint events temàtics ambientats a Barcelona que afectin estacions o línies durant finestres de temps concretes. Es referencia a `project_plan.md` secció 7 (`RANDOM_EVENT_TRIGGERED`) i secció 9 (modificadors al scoring).

**No cal cripto nova** — es reutilitza tota la infraestructura existent (`signEvent`/`verifyEvent` Ed25519 a [core/events/event-signer.js](core/events/event-signer.js) i [core/events/event-verifier.js](core/events/event-verifier.js)). El validator emet els events signats; els players els reben, els verifiquen amb el quòrum existent i n'apliquen els efectes.

**Decisions confirmades:**
- Arquitectura: **validator emet events signats**, però amb **schedule determinístic per seed** des del primer dia (vegeu secció "Determinisme per seed" més avall)
- Events MVP: **CARTERISTA, PUNT_CALENT, MUSICA, AVARIA**
- Cadència real: 3-4 events/setmana, schedule generat al `--compute-results`
  - **Day events** (Música): publicats a les 00:00 del dia que toquen
  - **Hour events** (Carterista, Punt calent, Avaria): publicats al moment exacte d'inici
- Mode simulació (`--simulate` al validator): l'usuari dispara events manualment via stdin (no determinístic, només per testing)

---

## Arquitectura

### Esquema del payload de `RANDOM_EVENT_TRIGGERED`
```js
{
  type: 'RANDOM_EVENT_TRIGGERED',
  playerId: <validatorId>,
  weekId: '2026-W18',
  payload: {
    eventName: 'CARTERISTA' | 'PUNT_CALENT' | 'MUSICA' | 'AVARIA',
    affectedStationIds: ['CATALUNYA', 'PASSEIG_DE_GRACIA'],   // [] si afecta línia sencera
    affectedLineIds: [],                                       // [] si afecta només estacions
    startTimestamp: 1714000000,
    endTimestamp:   1714003600,
    effect: {
      type: 'POINT_MULTIPLIER' | 'POINT_PENALTY' | 'SESSION_REJECT',
      value: 2.0    // multiplicador, % de penalització, o irrellevant per SESSION_REJECT
    },
    message: "Carterista a Catalunya — vigila amb les bosses"
  }
}
```

### Catàleg de tipus

| Event | Categoria | Estacions/línies | Finestra | Efecte | Notes |
|---|---|---|---|---|---|
| 🥷 **CARTERISTA** | hour | 1-2 estacions cèntriques (Catalunya, Pg. Gràcia, Liceu, Drassanes, Sagrada Família) | 1-2h, preferentment 8-9h o 18-19h | `POINT_PENALTY` -20% | Probabilitat alta a les hores punta |
| 🔥 **PUNT_CALENT** | hour | 1 estació random | 1h | `POINT_MULTIPLIER` x3 | Random pur dins el grafo |
| 🎺 **MUSICA** | day | 2-3 estacions | 16-20h del dia | `POINT_MULTIPLIER` x1.3 | "Day event" — anunciat a les 00:00 |
| 🚧 **AVARIA** | hour | 1 línia sencera | 1-2h | `SESSION_REJECT` | Sessions a la línia no compten |

### Determinisme per seed (clau de l'arquitectura)

El schedule de la setmana **no és aleatori en el sentit "decidit lliurement pel validator"**, sinó **pseudo-aleatori reproduïble**: qualsevol validator (o player auditor) pot recalcular-lo des del seed i obtenir exactament el mateix resultat.

**Seed**: `sha256(weekId + prevWeeklyResultEventId)`

- `weekId`: ja existent (p. ex. `2026-W18`)
- `prevWeeklyResultEventId`: l'`eventId` del WEEKLY_RESULT de la setmana anterior. Aquest `eventId` és el hash canònic del seu contingut → ningú pot predir-lo abans que es publiqui el WEEKLY_RESULT precedent. Això **garanteix sorpresa** per als jugadors mentre manté determinisme per als validators.

**Per què val la pena (gratis, només uns 10-15 LOC més):**
1. **Auditabilitat**: qualsevol player pot recomputar el schedule i verificar que el validator està complint. Si un validator publica un event fora del schedule, els players el descarten (excepte en mode `--simulate`).
2. **Migració gratis a N validators**: quan tinguem múltiples validators always-on, tots publicaran events idèntics → mateix `eventId` (hash del contingut canònic) → dedupé natural pel `seenEventIds` que ja existeix.
3. **Replicabilitat**: si un validator cau a meitat de setmana, qualsevol altre arrenca i té el mateix schedule. No hi ha pèrdua d'informació.
4. **Coherència amb la resta del sistema**: invasion-engine, ranking, transferència de membres ja són deterministics. No introduïm un únic punt de no-determinisme injustificat.

**Implementació del PRNG seedat:**
```js
// core/random-events/seeded-rng.js
import { createHash } from 'crypto'

export function createSeededRng(seedString) {
  let counter = 0
  return function next() {
    const buf = createHash('sha256').update(seedString + counter++).digest()
    return buf.readUInt32BE(0) / 0xffffffff   // [0, 1)
  }
}
```

**Restriccions a `schedule-generator.js`:**
- ❌ no `Math.random()` enlloc
- ❌ no `Date.now()` (fer servir `weekStart(weekStartTs)` derivat del `weekId`)
- ✅ totes les decisions (quants events, quins tipus, quines estacions/línies, quins dies/hores) surten del PRNG seedat
- ✅ `pickRandom(rng, list, n)` selecciona n elements deterministament

### Flux en mode real (validator persistent normal)

1. **Setmana N: `--compute-results`** publica `WEEKLY_RESULT` i, internament, **genera el schedule de la setmana N+1 amb seed = `sha256(weekId(N+1) + WEEKLY_RESULT_N.eventId)`**:
   - 1-2 events de tipus `MUSICA` (en dies diferents, 16-20h)
   - 2-3 events de tipus hour (`CARTERISTA`/`PUNT_CALENT`/`AVARIA`) en moments aleatoris (deterministics)
   - Total: 3-5 events repartits per la setmana
2. El schedule s'emmagatzema localment al validator (`~/.metro-clan-war/validator-store/random-events-schedule.json`) com a cache; si es perd, es pot regenerar des del seed.
3. El validator persistent té un **scheduler** (`setTimeout`) que:
   - A les 00:00 de cada dia, busca events MUSICA programats per aquell dia → els signa amb la seva clau i els publica
   - Al `startTimestamp` exacte de cada event hour, el signa i el publica
4. Els players reben `RANDOM_EVENT_TRIGGERED`, **opcionalment poden re-computar el schedule local** per verificar que l'event està al schedule esperat (no fa falta per MVP, però és la propietat que guanyem). Els emmagatzemen a una cache d'events actius (filtrats per `endTimestamp > nowSecs()`) i els apliquen quan calculen punts.

**Nota sobre múltiples validators (futur):** quan tinguem N validators, tots calcularan el mateix schedule. Cada un farà el seu `setTimeout` independentment. Tots publicaran events amb `eventId` idèntic (perquè `eventId = hash(canonicalize(contingut))` i el contingut és deterministic). El `seenEventIds` del player descartarà els duplicats automàticament. **No cal cap canvi de codi** per arribar-hi — la migració és gratis.

### Flux en mode simulació (`--simulate` al validator)

```bash
node peer-node/start.js --role=validator --simulate
```
El validator no inicia el scheduler; en lloc d'això llegeix comandes via stdin:
```
> trigger CARTERISTA CATALUNYA 60
> trigger PUNT_CALENT FONTANA 60
> trigger AVARIA L3 90
> trigger MUSICA SAGRADA_FAMILIA,DIAGONAL 240
```
Format: `trigger <eventName> <stationId|lineId|csv> <duracioMinuts>`. El validator construeix el `RANDOM_EVENT_TRIGGERED` amb `startTimestamp = nowSecs()`, `endTimestamp = startTimestamp + duracio*60`, el signa i el difon.

### Aplicació al scoring

Quan el player crea un `SCORE_GRANTED`:
1. Calcula `rawPoints` com fins ara via `calculateSessionScore` ([core/scoring/score-calculator.js](core/scoring/score-calculator.js))
2. Per cada event actiu (overlap temporal amb la sessió):
   - Si `event.affectedLineIds` inclou la línia de la sessió **OR** `event.affectedStationIds` intersecta amb `session.stations`:
     - `SESSION_REJECT` → no es genera `SCORE_GRANTED`
     - `POINT_MULTIPLIER` → `points *= effect.value`
     - `POINT_PENALTY` → `points *= (1 - effect.value)` (amb `value` entre 0 i 1)
3. Aplica caps com ara via `applyScoreCaps`
4. Emet `SCORE_GRANTED` amb el resultat final

Si hi ha múltiples events actius que afecten la mateixa sessió, s'apliquen seqüencialment (ordre per `eventId` per determinisme).

---

## Fitxers a crear/modificar

| Fitxer | Acció | Què hi va |
|---|---|---|
| `core/random-events/event-catalog.js` | **nou** | Definicions de tipus (`CARTERISTA`, `PUNT_CALENT`, `MUSICA`, `AVARIA`) amb paràmetres per defecte i estacions candidates |
| `core/random-events/seeded-rng.js` | **nou** | `createSeededRng(seedString)` — PRNG deterministic basat en sha256 |
| `core/random-events/schedule-generator.js` | **nou** | `generateWeekSchedule({weekId, prevResultEventId, linesData, stationsData})` — 100% determinista, surt del seed |
| `core/random-events/effects.js` | **nou** | `applyRandomEventsToScore(points, session, activeEvents)` — aplica modificadors |
| `core/random-events/event-builder.js` | **nou** | `buildRandomEvent({eventName, stations, lines, duration, validatorId, validatorKeypair, startTs})` — fabrica i signa l'event |
| `peer-node/validator-peer.js` | modificar | (1) afegir scheduler `setTimeout` que publica events al moment correcte; (2) afegir `--simulate` que llegeix stdin per disparar manual; (3) generar schedule deterministic a `computeAndPublish` |
| `peer-node/player-peer.js` | modificar | (1) handler per `RANDOM_EVENT_TRIGGERED` que cachea actius; (2) imprimir banner quan en rep un nou; (3) passar events actius a la simulació de sessions |
| `simulator/fake-route.js` | modificar | Acceptar `activeEvents` i passar-los a `applyRandomEventsToScore` abans d'`applyScoreCaps` |
| `core/events/event-types.js` | (cap canvi) | `RANDOM_EVENT_TRIGGERED` ja hi és |

---

## Detalls d'implementació clau

### `schedule-generator.js`
Genera un schedule **100% determinístic** basat en `seed = sha256(weekId + prevResultEventId)`:
- 1-2 events MUSICA: dies aleatoris de la setmana, finestra 16-20h
- 2-3 events hour: tipus aleatori (CARTERISTA/PUNT_CALENT/AVARIA), moment aleatori dins la setmana
- Estacions/línies seleccionades dels candidats del catàleg
- Retorna un array d'events sense signar (signats al moment de publicar)
- Tot ve del PRNG seedat — qualsevol auditor (player) pot recomputar i verificar

### Scheduler al validator persistent
```js
function startEventScheduler(schedule, keypair, swarm) {
  const now = nowSecs()
  for (const ev of schedule) {
    const delayMs = (ev.startTimestamp - now) * 1000
    if (delayMs <= 0) continue  // ja passat
    setTimeout(() => publishRandomEvent(ev, keypair, swarm), delayMs)
  }
}
```

### `--simulate` al validator
Lector stdin que parseja `trigger <eventName> <target> <durationMinutes>`. Construeix l'event amb `startTimestamp = nowSecs()`, signa amb la clau del validator i fa broadcast.

### Cache d'events actius al player
- `activeRandomEvents = new Map()` (eventId → event)
- En rebre `RANDOM_EVENT_TRIGGERED`: afegir a la cache + imprimir banner amb `event.payload.message`
- Funció `getActiveEvents()` que purga els expirats (`endTimestamp < nowSecs()`) abans de retornar
- Es passa la llista activa al simulador a `runSimulation`

---

## Verificació

```bash
npm test                            # tests existents continuen passant

# Mode simulació manual (recomanat per testing inicial)
Terminal 1: node peer-node/start.js --role=validator --simulate
Terminal 2: node peer-node/start.js --role=player --simulate
# A Terminal 1, escriure: trigger CARTERISTA CATALUNYA 60
# Player ha de rebre el banner; si simula a Catalunya, restar 20% del session score

# Mode real (futur, requereix esperar a que es disparin)
Terminal 1: node peer-node/start.js --role=validator
Terminal 2: node peer-node/start.js --role=player --simulate
Terminal 3: node peer-node/start.js --role=validator --compute-results
# El validator persistent genera el schedule de la setmana següent
# Al moment exacte programat, dispara els events
```

Tests nous a `test/random-events.test.js`:
- **Determinisme del schedule**: mateix `(weekId, prevResultEventId)` → mateix output exacte (mateix nombre, tipus, estacions, timestamps); diferent input → diferent output
- **PRNG seedat**: `createSeededRng('foo')` produeix la mateixa seqüència en dues crides
- `applyRandomEventsToScore`: multiplier, penalty, reject (cas simple + múltiples events)
- Filtre temporal: events expirats no apliquen
- Filtre geogràfic: events que no toquen la línia/estació de la sessió no apliquen
- **Reproducibilitat global**: a partir d'un `prevWeeklyResult.eventId`, dues invocacions independents de `generateWeekSchedule` retornen events amb `eventId` idèntics (després de signar amb la mateixa clau)


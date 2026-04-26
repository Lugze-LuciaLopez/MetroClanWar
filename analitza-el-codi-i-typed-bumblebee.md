# Anàlisi i pla — Validació MVP3 + connexió frontend + hook per MVP4

## Context

L'usuari vol tres coses:
1. **Verificar** que el contingut del MVP3 (ranking global, rotació de guerra, bonus sorpresa, transferència de membres, auto-advance, etc.) funciona correctament end-to-end abans de seguir.
2. **Connectar** el backend P2P actual (`peer-node/`, `core/`, `simulator/`) amb el frontend que ja existeix (`frontend/index.html` + `frontend/app.js`).
3. **Deixar lloc** per la feina del MVP4 d'una companya: GPS real + detecció d'estacions per geolocalització, que substituirà el simulator.

Veredicte general: **és viable sense reescritures grans**. L'arquitectura backend és sòlida (events signats, escalabilitat P2P, motor de joc deterministic). El frontend és petit (~190 línies de JS, HTML pla, Tailwind via CDN, sense framework). Els canvis són concentrats: alinear identitats, canviar el runtime de Pear i fer una capa-pont fina. La major part de la feina és **integració**, no reenginyeria.

---

## Estat actual

### Backend (`core/`, `peer-node/`, `simulator/`) — operatiu
- **Events signats Ed25519**: PLAYER_CREATED, STATION_DETECTED, METRO_SESSION_CONFIRMED, SCORE_GRANTED, WEEKLY_RESULT, INVASION_RESULT, CLAN_MEMBERSHIP_CHANGED ([core/events/event-types.js](core/events/event-types.js))
- **Pipeline complet de detecció→puntuació**: [core/route-matching/sequence-matcher.js](core/route-matching/sequence-matcher.js), [core/route-matching/confidence.js](core/route-matching/confidence.js), [core/scoring/score-calculator.js](core/scoring/score-calculator.js)
- **Validator** publica WEEKLY_RESULT amb `weeklyRanking` + `globalRanking` + `warResult` + `nextWarPair` + `hadInvasion` ([peer-node/validator-peer.js:136](peer-node/validator-peer.js#L136))
- **Player** auto-avança setmana al rebre WEEKLY_RESULT del seu present ([peer-node/player-peer.js:129](peer-node/player-peer.js#L129))
- **Identitat persistent** a `~/.metro-clan-war/identity.json`
- **Hyperswarm** topic fix `metro-clan-war-v1`
- **71/71 tests** passen (brittle)

### Frontend (`frontend/`) — desconnectat
- **HTML+CSS+JS pla**, Tailwind via CDN, sense framework, sense build step
- **Quiz** de 5 preguntes, calcula clan localment, guarda a `localStorage.userClan`
- **Tracking**: `runAutoDetectionLoop()` ([frontend/app.js:142](frontend/app.js#L142)) és un `setInterval` fals que dóna 1 punt/segon i estacions hardcoded ("Catalunya, Passeig de Gràcia, Diagonal, Fontana")
- **Persistència**: només `localStorage`
- **Cap connexió** amb Hyperswarm/peer-node/events signats
- **Pear runtime**: `index.js` carrega un missatge de prova; `package.json` té `"pear": { "type": "terminal" }` → cal canviar a `desktop` per renderitzar HTML

### Discrepàncies a resoldre
| | Frontend | Backend |
|---|---|---|
| Clans | `L1, L2, L3, L4, L5, L7, L9sud` | `L1, L2, L3, L4, L5, L9N, L9S, L10N, L10S, L11` |
| Identitat | només string del clan a `localStorage` | keypair Ed25519 + clanId a `~/.metro-clan-war/identity.json` |
| Punts | 1 pt/segon (`sessionPoints`) | `calculateSessionScore` amb confiança+caps |
| Estacions | array hardcoded | derivades de `data/lines.json` (dades TMB reals) |

L7 no existeix al backend perquè és FGC, no TMB. L9sud cal mapejar a L9S. Falta L9N/L10N/L10S/L11 al frontend.

---

## Pla d'execució (ordenat)

### Fase 1 — Verificació MVP3 (manual + script)

Fer un test end-to-end manual amb dos players reals i comprovar tot el cicle de guerra:

```
Terminal 1: validator persistent
Terminal 2: player A (clan L3) — simulate
Terminal 3: player B (clan L5) — simulate
Terminal 4: --compute-results [--week-offset=N] (efímer, un per setmana)
```

Casos a validar (cada un amb captura/screenshot del log):
- [ ] **W1 normal**: ambdós juguen, compute-results genera `nextWarPair: L3→L5`, `globalRanking` correcte
- [ ] **W2 guerra**: A juga a línia L5 (atacant), B juga a L5 (defensor), compute-results genera INVASION_RESULT, transferencia de 1 membre (l'únic L5), `WEEKLY_RESULT.warResult` mostra guanyador correcte, **player B veu missatge `*** El teu clan ha canviat a L3 i s'ha guardat ***`** i la setmana següent mostra `Clan: L3`
- [ ] **W3 tregua**: ambdós (ara L3) veuen `*** SETMANA DE TREGUA ***`, weeklyRanking exclou L3 (no apareix), globalRanking inclou L3
- [ ] **Bonus sorpresa**: forçar que el defensor guanyi (jugar més punts a la línia defensora) → INVASION_RESULT.upsetBonus té `{amount: floor(globalAtacant*0.01), fromClanId: atacant, toClanId: defensor}`, globalRanking redistribueix
- [ ] **Auto-advance**: després de cada compute-results, el player passa de W_n a W_(n+1) sense intervenció manual i re-prompta línia
- [ ] **Persistència**: matar tots els processos, esborrar `~/.metro-clan-war` i (si s'ha usat `--store=./tmp/...`) `tmp/`. Reiniciar valida que no queden dades fantasma

Si tot passa, MVP3 queda validat.

### Fase 2 — Alineació de dades (clans)

**Decisió recomanada**: alinear el quiz amb els clans del backend (autoritatiu — venen de `data/lines.json` derivat de CSV TMB real).

A [frontend/app.js:3](frontend/app.js#L3) i les 5 preguntes ([frontend/app.js:12-18](frontend/app.js#L12-L18)):
- Treure `L7` (no és metro TMB)
- Renombrar `L9sud` → `L9S`
- Afegir `L9N, L10N, L10S, L11` com a opcions a algunes preguntes
- Actualitzar el mapping de colors a [frontend/app.js:35](frontend/app.js#L35) i [frontend/app.js:46](frontend/app.js#L46) per incloure els nous clans

Alternativa més barata si la companya prefereix mantenir el quiz: afegir un mapa `quizClan → backendClan` en una sola funció, i la resta del codi sempre usa `backendClan`.

### Fase 3 — Pear desktop runtime

A `package.json`, canviar:
```json
"pear": { "name": "metro-clan-war", "type": "terminal" }
```
a
```json
"pear": { "name": "metro-clan-war", "type": "desktop", "gui": { "main": "frontend/index.html" } }
```

L'`index.js` actual queda com a entrada de fallback per CLI; els peers (`peer-node/start.js`) segueixen funcionant per testing fora de la GUI.

Verificar amb `npm run dev` (que executa `pear run -d .`) que l'HTML renderitza dins de la finestra Pear.

### Fase 4 — Mòdul-pont entre UI i player

Crear `frontend/bridge.js` (nou fitxer) que importi `peer-node/player-peer.js` i exposi una API neta a `app.js`:

```js
// frontend/bridge.js (esquemàtic)
import { startPlayer } from '../peer-node/player-peer.js'

let playerHandle = null
const listeners = { weeklyResult: [], membershipChanged: [], scoreUpdate: [] }

export async function initPlayer(clanId) {
  playerHandle = await startPlayer({ simulate: false, verbose: false })
  // hook events from player → fire listeners
}

export function startSession() { /* arrencar buffer de detecció d'estacions */ }
export function submitStationDetection({ stationId, timestamp, accuracy, speed }) { /* per MVP4 */ }
export function endSession() { /* matchSequence + confidence + score-calculator + emetre events signats */ }
export function on(event, cb) { listeners[event].push(cb) }
export function getState() { /* { clanId, totalPoints, latestWeeklyResult, ... } */ }
```

`startPlayer` ja exposa `swarm`, `keypair`, `playerId`, `results`, `sendEvent` ([peer-node/player-peer.js:163](peer-node/player-peer.js#L163)). Cal afegir-hi callbacks per WEEKLY_RESULT i CLAN_MEMBERSHIP_CHANGED, o exposar `latestWeeklyResult` i un emitter.

`endSession()` reusa el pipeline existent — la lògica que ja fa [simulator/fake-route.js:32-70](simulator/fake-route.js#L32-L70):
- `matchSequence(detectedStations, linesData)`
- `calculateConfidence({ gpsAccuracy, maxSpeed, gaps, coverage })`
- `calculateSessionScore({ duration, confidence, stations, startTimestamp })`
- `applyScoreCaps(rawPoints, caps)`
- `player.makeEvent(METRO_SESSION_CONFIRMED, ...)` + `player.makeEvent(SCORE_GRANTED, ...)`
- `broadcastEvent(swarm, event)`

Convindria **extreure aquesta lògica de `fake-route.js` a un fitxer compartit** (p. ex. `core/session/build-session-events.js`) perquè la utilitzin tant el simulator com el bridge real.

### Fase 5 — Connectar la UI

A [frontend/app.js](frontend/app.js):

1. **`finishQuiz()`** (línia 75): substituir `localStorage.setItem('userClan', clan)` per `await bridge.initPlayer(clan)` — això crearà el keypair real al disc i s'unirà al swarm.

2. **`startJourney()`** (línia 105): substituir `runAutoDetectionLoop()` per `bridge.startSession()` + un loop que segueixi mostrant l'UI però delegui les deteccions reals al bridge. Mentre no hi hagi MVP4, mantenir el mock cridant `bridge.submitStationDetection(...)` amb dades fake per testejar la integració.

3. **`stopJourney()`** (línia 123): cridar `bridge.endSession()` (que emet METRO_SESSION_CONFIRMED + SCORE_GRANTED al swarm) i actualitzar el dashboard amb el resultat real (no `state.sessionPoints` local).

4. **Dashboard** (mostrar WEEKLY_RESULT, ranking, propera guerra, banner de fi de guerra):
   - `bridge.on('weeklyResult', (ev) => renderWeeklyResult(ev))` — afegir nous elements al dashboard per mostrar weeklyRanking, globalRanking, nextWarPair
   - `bridge.on('membershipChanged', (ev) => { state.clan = ev.payload.toClanId; updateAppColor(); showMessage(...) })` — important per veure transferencies de membres en directe

5. **`showMessage()`** ([frontend/app.js:29](frontend/app.js#L29)) ja serveix per banners de fi de guerra: invocar-lo des del listener de WEEKLY_RESULT quan `warResult.attackerClanId === state.clan || warResult.defenderClanId === state.clan`.

### Fase 6 — Hook per MVP4 (col·laboradora)

La companya treballarà amb `navigator.geolocation.watchPosition`. La interfície que necessita del backend és simple i ja la cobreix `bridge.submitStationDetection()`:

```js
navigator.geolocation.watchPosition(pos => {
  const stationId = matchToGeofence(pos.coords)  // usa core/data/geofences.json
  if (stationId) {
    bridge.submitStationDetection({
      stationId,
      timestamp: Math.floor(pos.timestamp / 1000),
      accuracy: pos.coords.accuracy,
      speed: pos.coords.speed
    })
  }
})
```

Funció `matchToGeofence` (nova): donat un `(lat, lon)`, retorna l'`stationId` si està dins d'algun geofence de `data/geofences.json`. Si la companya ja la té implementada, només cal connectar-la al bridge. La funció `haversineMeters` ja existeix a [core/route-matching/anti-cheat.js](core/route-matching/anti-cheat.js).

### Fase 7 — Higiene i seguretat

- **`.gitignore`**: ja afegit. `node_modules/` segueix trackejat històricament — opcionalment `git rm -r --cached node_modules` en un commit de neteja.
- **Verificació de signatures al frontend**: tot esdeveniment rebut s'ha de validar amb `verifyEvent` ([core/events/event-verifier.js](core/events/event-verifier.js)) abans de mostrar-lo a l'usuari.
- **Anti-cheat**: `validateTimestamp` ([core/route-matching/anti-cheat.js:27](core/route-matching/anti-cheat.js#L27)) està exportat però no es crida enlloc. Cal cridar-lo al `verifyEvent` del validator i del player abans d'acceptar SCORE_GRANTED/METRO_SESSION_CONFIRMED.

---

## Fitxers crítics a modificar

| Fitxer | Acció | Raó |
|---|---|---|
| `package.json` | `pear.type` → `"desktop"` + `gui.main` | habilitar GUI Pear |
| `frontend/app.js` | reescriure tracking + quiz storage; afegir listeners de bridge | substituir mock per logic real |
| `frontend/index.html` | afegir contenidors per ranking setmanal/global/propera guerra | mostrar resultats validator |
| `frontend/bridge.js` | **nou** — pont UI ↔ player | API neta entre capes |
| `core/session/build-session-events.js` | **nou** — extret de `simulator/fake-route.js` | reutilitzable per simulator i UI real |
| `simulator/fake-route.js` | refactor per usar la lògica extreta | mantenir simulator funcional |
| `peer-node/player-peer.js` | exposar event emitter (WEEKLY_RESULT, CLAN_MEMBERSHIP_CHANGED) i `submitDetection` | que bridge pugui escoltar i empenyer |
| `data/geofences.json` (existent) | usat per `matchToGeofence` | input per detecció GPS |

---

## Verificació end-to-end final

```bash
# 1. Tests automàtics
npm test                                # 71/71 passen

# 2. Pear desktop arranca
npm run dev                             # finestra Pear renderitza el quiz

# 3. Flux complet en 2 dispositius (o 2 instàncies):
#    - Quiz → assigna clan → keypair generat → unió al swarm
#    - Tracking simulat amb mock detections → endSession → events signats al swarm
#    - Validator persistent (Terminal: node peer-node/start.js --role=validator) emmagatzema
#    - Validator efímer (--compute-results) publica WEEKLY_RESULT
#    - Frontend mostra rànquings, propera guerra, transferències

# 4. Tests d'integració nous (opcional)
#    - test/end-to-end.test.js: arrenca un swarm en memòria, simula 2 players,
#      compute-results, verifica que el WEEKLY_RESULT generat coincideix amb l'esperat
```

---

## Resposta directa a la pregunta

**És viable amb feina dirigida, no cal reescriure**. L'arquitectura de fons (events signats, P2P, motor de joc determinista) ja està bé i la part més complexa està feta. La feina restant és:

1. **Petita** (1-2 hores): alinear clans, canviar Pear a desktop, escriure el bridge bàsic
2. **Mitjana** (mig dia): reescriure les funcions de tracking i quiz a `app.js` per delegar al bridge, afegir UI per rànquings/propera guerra
3. **Coordinació amb la companya** (depèn d'ella): connectar `navigator.geolocation` → `matchToGeofence` → `bridge.submitStationDetection`

Cap canvi al **motor de joc** (invasion-engine, ranking, weekly-engine) — només connectar-lo al frontend.

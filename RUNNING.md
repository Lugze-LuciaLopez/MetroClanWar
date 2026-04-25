# Com executar MetroClanWar

## Prerequisit: generar les dades

Cal fer-ho una sola vegada (o quan es canviïn els CSV):

```bash
node scripts/build-data.js
```

Genera `data/stations.json`, `data/lines.json`, `data/metro-graph.json`, `data/geofences.json` a partir dels CSV del TMB.

---

## Tests unitaris

```bash
npm test
```

Executa tots els fitxers `test/*.test.js` amb Brittle. No necessita cap node actiu.

---

## Nodes en xarxa (Hyperswarm P2P)

Tots els nodes es troben automàticament via el topic `metro-clan-war-v1`. No cal configurar IPs ni ports.

### Replica — node d'emmagatzematge

```bash
node peer-node/start.js --role=replica
node peer-node/start.js --role=replica --store=PATH
```

- Recull i guarda tots els events signats que arriben.
- Quan es connecta un nou peer, li envia tots els events que té (sync).
- Rebroadcast cada event nou a la resta de peers.
- La identitat no és necessària (no firma res).
- `--store=PATH` — ruta personalitzada per l'arxiu d'events (per defecte `~/.metro-clan-war/replica-store`).

### Validator — node de validació i scoring

```bash
node peer-node/start.js --role=validator
node peer-node/start.js --role=validator --store=PATH
node peer-node/start.js --role=validator --compute-results
```

- Verifica la signatura criptogràfica de cada event rebut.
- Guarda només els events vàlids.
- Fa sync com la replica quan arriba un nou peer.
- `--store=PATH` — ruta personalitzada per l'arxiu d'events.
- `--compute-results` — mode efímer: connecta al swarm, espera 2 segons per sincronitzar, computa el `WEEKLY_RESULT` de la setmana actual, el signa amb la seva keypair, el retransmet a tots els peers i acaba (`process.exit`). **No és un node persistent.**

La keypair del validator es guarda a `~/.metro-clan-war/validator-identity.json` i es reutilitza en arrencades posteriors.

### Player — node jugador

```bash
node peer-node/start.js --role=player
node peer-node/start.js --role=player --simulate
```

- Es connecta al swarm com a client (no serveix com a servidor).
- En connectar, s'anuncia amb `PEER_INFO` (playerId + publicKey).
- Escolta `WEEKLY_RESULT` i els mostra per pantalla.
- `--simulate` — mode interactiu: demana quina línia, quantes estacions per sessió i quantes sessions, i envia els events simulats (METRO_SESSION_CONFIRMED + SCORE_GRANTED) als peers.

La keypair del player es guarda a `~/.metro-clan-war/identity.json`.

---

## Simulació setmanal offline (sense xarxa)

```bash
node simulator/weekly-sim.js
```

Simula una setmana completa amb 5 clans × 3 jugadors, 2 sessions per dia durant 5 dies. Imprimeix el ranking individual i de clans directament a stdout. **No necessita cap node actiu ni Hyperswarm.**

---

## Flux típic amb 4 terminals

```
Terminal 1:  node peer-node/start.js --role=replica
Terminal 2:  node peer-node/start.js --role=validator
Terminal 3:  node peer-node/start.js --role=player --simulate
             → escull línia, estacions i sessions
Terminal 4:  node peer-node/start.js --role=validator --compute-results
             → computa el resultat i el Terminal 3 el mostra
```

---

## Dades persistents

Tots els nodes guarden la seva informació a `~/.metro-clan-war/`:

| Fitxer | Contingut |
|--------|-----------|
| `identity.json` | Keypair del player |
| `validator-identity.json` | Keypair del validator |
| `replica-store/events.jsonl` | Events rebuts per la replica |
| `validator-store/events.jsonl` | Events validats pel validator |

Per reiniciar des de zero: `rm -rf ~/.metro-clan-war/`

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

cd Desktop/MetroClanWar

node peer-node/start.js --role=replica
node peer-node/start.js --role=validator

node peer-node/start.js --role=player --simulate
node peer-node/start.js --role=player --simulate --identity=~/.metro-clan-war/player2.json

node peer-node/start.js --role=validator --compute-results
node peer-node/start.js --role=validator --compute-results --week-offset=1

---

## Demo del hackathon (UI gràfica + P2P real)

Substitueix el `--simulate` interactiu per la UI gràfica. La frontend
(carpeta `frontend/`) es connecta per WebSocket al `player-peer` corresponent
i li demana que executi rutes estàtiques pre-definides; el `player-peer`
valida, signa i broadcasteja al swarm exactament igual que abans.

> **Producció / xarxes diferents**: els player-peers s'anuncien al DHT i
> mantenen presència estable, així que un player pot connectar-se a la
> xarxa des de qualsevol màquina sense necessitat de córrer un peer-server
> local. Per estabilitat encara recomanem tenir almenys un validator i una
> replica always-on (al núvol o a una màquina fixa) que actuïn de
> backbone — no calen "side servers" als dispositius dels jugadors.

### Flags nous

| Flag                | Aplicació                            | Per defecte |
|---------------------|--------------------------------------|-------------|
| `--demo`            | activa el bridge WebSocket           | (off)       |
| `--demo-port=N`     | port del bridge                      | 8787 (player) / 8786 (validator) |
| `--clan=CLAN`       | preselecciona clan al `--role=player` (evita el prompt) | — |

### Escenari A — un jugador

```bash
# Terminal 1
node peer-node/start.js --role=replica

# Terminal 2
node peer-node/start.js --role=validator --demo

# Terminal 3
node peer-node/start.js --role=player --demo \
  --demo-port=8787 \
  --identity=~/.metro-clan-war/playerA.json --clan=L4
```

Obre al navegador:
- `frontend/index.html?port=8787` — finestra del jugador A.
- `frontend/validator.html` — finestra de validació (port 8786).

A la UI A clica "L4 Barceloneta → Urquinaona" → progressió en ~6 s, "Acceptada", +N punts. La UI validator mostra `EVENT_RECEIVED` i `EVENT_ACCEPTED`. El botó "Compute Weekly" del validator publica el `WEEKLY_RESULT`.

### Escenari B — dos jugadors

A més dels anteriors:

```bash
# Terminal 4
node peer-node/start.js --role=player --demo \
  --demo-port=8788 \
  --identity=~/.metro-clan-war/playerB.json --clan=L2
```

Obre `frontend/index.html?port=8788` per a B.

A (L4) fa "L4 BCN→URQ", B (L2) fa "L2 PAR→PG". Els dos veuen el ranking creixent en viu (alimentat pels SCORE_GRANTED rebuts pel swarm). "Compute Weekly" publica el ranking oficial i, segons el setting, fixa el `nextWarPair`.

### Escenari C — invasió

Fes que els dos juguin un cop l'escenari B, premeu `Compute Weekly`. Això genera un `WEEKLY_RESULT` que defineix el `nextWarPair`. Ara reinicieu tots els peers afegint `--week-offset=1` per moure'ns a la setmana següent (la de la invasió):

```bash
node peer-node/start.js --role=replica
node peer-node/start.js --role=validator --demo --week-offset=1
node peer-node/start.js --role=player --demo --demo-port=8787 \
  --identity=~/.metro-clan-war/playerA.json --week-offset=1
node peer-node/start.js --role=player --demo --demo-port=8788 \
  --identity=~/.metro-clan-war/playerB.json --week-offset=1
```

A i B fan trajectes a la línia atacada. Premeu `Compute Weekly` → la UI mostra `INVASION_RESULT` i, si toca, transferència de membres. La UI dels jugadors mostra el banner ★ INVASIÓ.

### Què fa el rebuig de la trampa

El botó "Trampa" envia una ruta amb estacions de línies diferents (BARCELONETA → HOSPITAL_DE_BELLVITGE en 10 s). El `player-peer` la rebutja **abans de signar**: la UI marca "Rebutjada (player): Estacions de línies diferents", i **no s'envia res al swarm**. El validator-peer no veu res — exactament el comportament que l'usuari va demanar (validació estàtica al player abans d'enviar).
Actua com un arquitecte sènior de sistemes distribuïts, desenvolupador expert en JavaScript, Pear, Holepunch, Hypercore/Hyperswarm, sistemes P2P, aplicacions mòbils, criptografia aplicada, geolocalització i disseny de videojocs multiplayer.

Vull desenvolupar un videojoc mòbil P2P ambientat al metro de Barcelona. Necessito que m’ajudis a dissenyar-lo i implementar-lo pas a pas amb criteri tècnic rigorós. No vull respostes genèriques. Vull que siguis crític, que detectis riscos, que proposis millores i que prioritzis una arquitectura realista, testeable i escalable.

Idioma de resposta: català.
Estil: professional, clar, directe, tècnic i estructurat.
No facis preguntes trivials. Si falta informació crítica, pregunta. Si no, assumeix una decisió raonable i explica-la.

==================================================
1. IDEA GENERAL DEL JOC
==================================================

Estem creant una app/joc mòbil ambientat al metro de Barcelona.

Els jugadors fan primer un test de personalitat. Segons les respostes, se’ls assigna una línia/clan del metro, com si fossin cases de Harry Potter.

Exemples:
- L7 = pija
- L4 = guiri
- L1, L2, L3, L5, etc. poden tenir identitats/personatges propis.

Cada jugador pertany a un clan/línia.

La mecànica principal és setmanal:

- Durant la setmana, cada jugador guanya punts utilitzant el metro.
- Guanya més punts si passa temps a la seva línia assignada.
- També poden aparèixer events aleatoris o contextuals, com un “carterista”, que pot treure punts o generar efectes locals.
- Diumenge a les 23:59:59 es tanca la setmana.
- Dilluns és finestra de gràcia i recompte.
- Dimarts es publica el resultat setmanal.
- El clan guanyador pot decidir envair una altra línia.
- Durant la setmana d’invasió, el clan invasor ha d’aconseguir més punts dins la línia atacada que el clan defensor.
- Si l’invasor guanya, el 25% dels jugadors menys actius del clan defensor passen al clan invasor.
- Si l’invasor perd, el 25% dels jugadors menys actius del clan invasor passen al clan defensor.

Important:
El canvi del 25% no ha de ser aleatori. Ha de ser determinista i basat en activitat setmanal:
- menys punts,
- menys sessions vàlides,
- menys dies actius,
- i, en cas d’empat, hash determinista.

==================================================
2. OBJECTIU TÈCNIC PRINCIPAL
==================================================

La app ha de ser P2P-oriented, local-first i descentralitzada tant com sigui possible.

No volem un backend central clàssic que decideixi tot.

Volem fer servir:
- JavaScript
- VSCode
- Pear
- Holepunch
- Hypercore / Hyperswarm
- Possiblement Autobase
- Peers always-on
- Events signats criptogràficament
- Validació distribuïda
- Ranking setmanal determinista

La idea NO és una webapp clàssica dependent d’un domini i un servidor central.

El producte final hauria de ser una mobile app, però la lògica central ha d’estar separada en un core JavaScript testeable des de l’ordinador.

Arquitectura conceptual:

- Client mobile:
  - UI del joc
  - test de personalitat
  - detecció local d’ús del metro
  - generació d’events
  - signatures
  - storage local
  - replicació P2P

- Replica peers always-on:
  - guarden logs/events
  - ajuden a disponibilitat
  - redistribueixen dades
  - no decideixen resultats

- Validator peers always-on:
  - reben events
  - verifiquen signatures
  - validen trajectes
  - apliquen anti-cheat
  - calculen puntuacions
  - calculen rankings setmanals
  - signen resultats oficials

- Clients:
  - verifiquen signatures dels validators
  - accepten resultats només si hi ha quorum
  - mostren rankings i estat del joc

No hi ha d’haver un únic peer oficial.
Els resultats setmanals haurien de requerir quorum, per exemple 2 de 3 o 3 de 5 validators.

==================================================
3. STACK I ESTRATÈGIA D’IMPLEMENTACIÓ
==================================================

Volem desenvolupar-ho amb JavaScript i Pear/Holepunch.

No tenim clar encara el millor format final:
- Bare/Pear mobile app
- app mòbil amb core JavaScript
- possible wrapper mòbil
- prototip inicial testeable en ordinador

Vull que proposis l’opció més adequada, però tenint en compte:

- El joc final ha de tenir sentit com a app mòbil.
- No volem començar per una desktop app com a producte final.
- Però sí volem poder testejar des de l’ordinador.
- Volem separar core logic de UI.
- Volem poder simular usuaris, trajectes i setmanes sense haver d’anar físicament al metro cada cop.

Estructura desitjada aproximada:

metro-clans/
├── core/
│   ├── events/
│   ├── scoring/
│   ├── metro-graph/
│   ├── route-matching/
│   ├── anti-cheat/
│   ├── crypto/
│   └── weekly-engine/
│
├── mobile-app/
│   ├── ui/
│   ├── location-adapter/
│   └── local-storage/
│
├── peer-node/
│   ├── replica-peer/
│   └── validator-peer/
│
├── simulator/
│   ├── fake-users/
│   ├── fake-routes/
│   ├── replay-location-traces/
│   └── weekly-simulation/
│
└── data/
    ├── estacions.csv
    ├── stations.json
    ├── lines.json
    ├── metro-graph.json
    └── geofences.json

Necessito que m’ajudis a desenvolupar primer el core i els peers, després la part mobile.

==================================================
4. DADES DEL METRO
==================================================

Disposem d’un CSV extret de les developer tools de TMB amb estacions/parades del metro.

Columnes del CSV:

FID
ID_ESTACIO
CODI_GRUP_ESTACIO
NOM_ESTACIO
PICTO
DATA
GEOMETRY

Exemple conceptual:

FID,ID_ESTACIO,CODI_GRUP_ESTACIO,NOM_ESTACIO,PICTO,DATA,GEOMETRY
ESTACIONS.111,111,6660111,Hospital de Bellvitge,L1,2026-04-25,POINT (2.1072421350644093 41.344677452264776)

Detalls importants:

- GEOMETRY ve en format WKT:
  POINT(longitud latitud)

- PICTO pot ser una línia simple:
  L1

- Però també pot contenir múltiples línies per estacions de transbordament:
  L1L5
  L2L3L4
  L1L5L9NL10N
  L9SL10S

Això vol dir que cal normalitzar el CSV.

Necessito que proposis un procés per convertir aquest CSV en:

1. stations.json
   - stationId
   - canonicalStationId
   - name
   - latitude
   - longitude
   - lineIds
   - original fields

2. lines.json
   - lineId
   - orderedStations

3. metro-graph.json
   - nodes = estacions
   - edges = connexions entre estacions consecutives
   - transfer edges = connexions entre línies en una mateixa estació
   - expectedMinSeconds
   - expectedMaxSeconds
   - distanceMeters
   - lineId

4. geofences.json
   - stationId
   - latitude
   - longitude
   - radiusMeters
   - lineIds

Problema important:
El CSV pot no contenir explícitament l’ordre net de les estacions dins cada línia. Si no hi és, s’haurà de:
- deduir parcialment si l’ordre del CSV és fiable,
- o afegir una font complementària,
- o crear manualment un fitxer lines.json inicial.

Vull que siguis crític amb això i que no assumeixis que el grafo és correcte si el CSV no dona prou informació.

==================================================
5. LOCALITZACIÓ I DETECCIÓ D’ÚS DEL METRO
==================================================

La localització real surt dels sensors del dispositiu:
- GPS,
- xarxa,
- Wi-Fi,
- sensors,
- sistema de localització del mòbil.

Però volem que la validació del joc sigui P2P-compatible:
- No volem dependre d’una API externa central per decidir si un trajecte és vàlid.
- No volem que Google Maps, TMB o un backend propi decideixin els punts.
- La app ha de calcular localment evidències de trajecte.
- Els validators P2P han de verificar coherència a partir dels events signats i del grafo local del metro.

Estratègia de detecció:

No intentar seguir la trajectòria contínua dins túnels.
El GPS al metro no és fiable en túnels, però pot aparèixer senyal a estacions.

Algoritme esperat:

1. Detecció d’estacions:
   - Crear geofences per cada estació.
   - Radi aproximat inicial: 50-100 m.
   - Adaptar radi segons densitat d’estacions i precisió.

2. Mostreig de localització:
   - No GPS continu sempre.
   - Capturar posicions quan hi hagi senyal.
   - Filtrar per accuracy.
   - Descartar lectures massa dolentes.

3. Construcció de seqüència:
   - Generar llista ordenada d’estacions detectades.
   - Exemple:
     [FONTANA, DIAGONAL, PASSEIG_DE_GRACIA]

4. Matching amb la xarxa:
   - Modelar metro com a grafo.
   - Nodos = estacions.
   - Aristes = connexions entre estacions consecutives.
   - Cada línia = seqüència ordenada d’estacions.
   - Buscar subseqüències compatibles.

5. Matching fuzzy:
   - Permetre estacions perdudes.
   - Exemple:
     [A, C, D] pot correspondre a [A, B, C, D]
   - Penalitzar salts massa grans.

6. Identificació de línia:
   - Comparar seqüència detectada amb cada línia.
   - Prioritzar rutes sense transbord.
   - Minimitzar salts inconsistents.
   - Usar confidence score.

7. Inici i final de trajecte:
   - Inici: entrada en geofence d’estació + indicis de moviment compatible.
   - Final: recuperació de senyal estable fora d’estació, parada prolongada o sortida de zona metro.
   - Si hi ha transbord, dividir en segments.

8. Càlcul de temps:
   - Temps en línia = endTimestamp - startTimestamp.
   - Si hi ha transbord, dividir per segments de línia.
   - No donar punts infinits per quedar-se quiet en una estació.

Resultat esperat:

- línia més probable,
- seqüència estimada d’estacions,
- temps estimat en línia,
- confidence score,
- validació o rebuig del trajecte.

==================================================
6. VELOCITAT I ANTI-CHEAT GEOGRÀFIC
==================================================

La velocitat mitjana del metro de Barcelona és aproximadament 26 km/h.
La velocitat punta pot arribar aproximadament a 40 km/h.

Això s’ha d’utilitzar com a validació anti-cheat.

Regles aproximades:

- Si la velocitat estimada és plausible:
  acceptar o augmentar confidence.

- Si la velocitat estimada és superior a uns 45 km/h:
  marcar segment com sospitós.

- Si la velocitat estimada és molt superior, per exemple >60 km/h:
  rebutjar segment.

- No fer servir 40 km/h com a tall dur sempre, perquè el GPS pot tenir errors.
  Cal treballar amb confidence score.

Altres regles anti-cheat:

1. Accuracy mínima:
   - Si accuracy és massa dolenta, baixar confidence o descartar.

2. Seqüència compatible:
   - Les estacions han de formar una ruta possible al grafo.

3. Cooldown:
   - Evitar spam d’events.

4. Límit de punts:
   - Límit per dia/setmana per evitar farming infinit.

5. Mock location:
   - Detectar si el sistema informa de localització simulada quan sigui possible.

6. Timestamps:
   - No acceptar timestamps massa futurs.
   - No acceptar events massa antics fora de finestra.

7. Offline:
   - Permetre joc offline temporal, però limitar quants events offline poden comptar.

8. Duplicats:
   - Cada event ha de tenir eventId únic.
   - Deduplicar per hash.

Principi important:
Una signatura criptogràfica només demostra autoria i integritat.
No demostra que el contingut sigui cert.
Per tant:
- signature = autenticitat
- validation = credibilitat

==================================================
7. MODEL D’EVENTS
==================================================

El sistema ha de ser event-sourced.

Tot canvi important ha de ser un event immutable, signat i verificable.

No reduir-ho tot a CHECKIN.
Vull diversos tipus d’events.

Events mínims:

1. PLAYER_CREATED
2. PERSONALITY_TEST_COMPLETED
3. CLAN_ASSIGNED
4. RAW_LOCATION_SAMPLE, només local o privat si cal
5. STATION_DETECTED
6. METRO_SESSION_STARTED
7. METRO_SESSION_CONFIRMED
8. SCORE_GRANTED
9. WEEKLY_RESULT
10. INVASION_DECLARED
11. INVASION_RESULT
12. CLAN_MEMBERSHIP_CHANGED
13. RANDOM_EVENT_TRIGGERED, per exemple carterista

Exemple STATION_DETECTED:

{
  "schemaVersion": 1,
  "eventId": "hash...",
  "type": "STATION_DETECTED",
  "playerId": "publicKey...",
  "stationId": "DIAGONAL",
  "lineCandidates": ["L3", "L5"],
  "timestamp": 1714000000,
  "accuracy": 35,
  "source": "device_location",
  "signature": "..."
}

Exemple METRO_SESSION_CONFIRMED:

{
  "schemaVersion": 1,
  "eventId": "hash...",
  "type": "METRO_SESSION_CONFIRMED",
  "playerId": "publicKey...",
  "sessionId": "hash...",
  "lineId": "L3",
  "stations": ["FONTANA", "DIAGONAL", "PASSEIG_DE_GRACIA"],
  "startTimestamp": 1714000000,
  "endTimestamp": 1714000900,
  "durationSeconds": 900,
  "confidence": 0.82,
  "signature": "..."
}

Exemple SCORE_GRANTED:

{
  "schemaVersion": 1,
  "eventId": "hash...",
  "type": "SCORE_GRANTED",
  "playerId": "publicKey...",
  "clanId": "L3",
  "lineId": "L3",
  "weekId": "2026-W17",
  "points": 15,
  "reason": "VALIDATED_METRO_SESSION",
  "sourceSessionId": "hash...",
  "validatorSignatures": ["...", "..."]
}

Cada event hauria de tenir com a mínim:

{
  "schemaVersion": 1,
  "eventId": "...",
  "type": "...",
  "playerId": "...",
  "timestamp": 1714000000,
  "weekId": "2026-W17",
  "sequence": 42,
  "prevHash": "...",
  "payload": {},
  "signature": "..."
}

Cal definir serialització canònica per calcular hash i signatura.

==================================================
8. CRIPTOGRAFIA I IDENTITAT
==================================================

Cada jugador ha de tenir una identitat criptogràfica.

Proposta:
- playerId = public key o hash de public key.
- private key guardada localment.
- events signats amb Ed25519 o alternativa adequada dins l’ecosistema Pear/Holepunch.
- validator peers també tenen claus públiques conegudes.
- resultats setmanals signats pels validators.

Vull que proposis una implementació realista en JavaScript.

Cal tenir en compte:

- generació de claus,
- storage segur local,
- signEvent(event),
- verifyEvent(event),
- canonicalizeEvent(event),
- hashEvent(event),
- prevHash per cadena d’events del jugador,
- rotació o recuperació de claus si és necessari,
- problema de multi-dispositiu.

==================================================
9. SCORING
==================================================

El ranking s’ha de calcular de manera determinista.

Base:

score(clan, line, week) = suma de punts vàlids

Però els punts han de sortir de sessions validades, no només de check-ins simples.

Proposta:

points = durationMinutes * confidenceMultiplier * contextMultiplier

On:
- durationMinutes = temps estimat en línia
- confidenceMultiplier = depèn de confidence
- contextMultiplier = depèn de si és línia pròpia, línia atacada, defensa, event especial, etc.

Exemple de confidence:

0.00 - 0.30: no computa
0.30 - 0.60: computa parcialment
0.60 - 0.85: computa normal
0.85 - 1.00: alta confiança

Regles:

- Temps quiet a una estació no pot donar punts infinits.
- Passar per la línia pròpia dona punts normals.
- Durant invasió:
  - clan invasor suma punts a la línia atacada.
  - clan defensor suma punts defensant la seva línia.
- Events com carterista poden restar punts o modificar score.
- Tot ha de ser reproduïble pels validators.

==================================================
10. FLUX SETMANAL
==================================================

Setmana N:

Dilluns 00:00:00 - Diumenge 23:59:59:
- Els jugadors generen sessions.
- Els events es guarden localment.
- Els events es repliquen P2P.
- Els validators reben events.

Diumenge 23:59:59:
- Cutoff lògic de la setmana.

Dilluns:
- Finestra de gràcia.
- S’accepten events tardans si el timestamp cau dins la setmana.
- Es verifica i calcula ranking.

Dimarts 00:00:
- Els validators publiquen WEEKLY_RESULT signat.
- Els clients verifiquen quorum.
- Es desbloqueja fase de decisió d’invasió.

Invasió recomanada:

Setmana N:
- Es juga ranking normal.

Dimarts de setmana N+1:
- Es publica guanyador de setmana N.
- Guanyador declara línia a envair.

Setmana N+1:
- Es juga la invasió.

Final de setmana N+1:
- Es calcula si invasor o defensor ha guanyat.
- Es genera INVASION_RESULT.
- Es genera CLAN_MEMBERSHIP_CHANGED per al 25% menys actiu corresponent.

==================================================
11. P2P I PEERS ALWAYS-ON
==================================================

Volem fer servir Pear/Holepunch.

Rols:

1. Client peer:
   - genera events
   - signa events
   - guarda local
   - replica P2P
   - mostra UI

2. Replica peer:
   - sempre actiu
   - rep events
   - guarda logs
   - redistribueix events
   - no calcula ranking oficial

3. Validator peer:
   - sempre actiu
   - rep events
   - verifica signatures
   - valida trajectes
   - aplica anti-cheat
   - calcula score
   - publica resultats signats

4. Bootstrap/seed peer:
   - ajuda disponibilitat de xarxa
   - no hauria de ser autoritat única

Necessito que proposis:
- estructura de topics,
- com descobrir peers,
- com replicar events,
- com deduplicar,
- com tractar peers offline,
- com fer quorum de validators,
- com publicar resultats oficials,
- com fer que els clients verifiquin resultats.

Vull evitar una arquitectura on un únic peer pugui manipular el joc.

==================================================
12. PRIVACITAT
==================================================

Com que treballem amb ubicació, cal minimitzar dades.

Principis:

- No publicar GPS cru a tota la xarxa per defecte.
- No publicar trajectes hiperprecisos si no cal.
- Guardar raw location només localment sempre que sigui possible.
- Publicar a P2P només events resumits:
  - stationId,
  - lineId,
  - timestamps arrodonits,
  - confidence,
  - sessionId,
  - signatures.

Dades locals:
- RawLocationSample
- deteccions detallades
- debug info

Dades P2P:
- StationDetected resumit
- MetroSessionConfirmed
- ScoreGranted
- WeeklyResult
- InvasionResult

Necessito que proposis un model que sigui útil pel joc però respecti privacitat.

==================================================
13. MVP RECOMANAT
==================================================

No vull començar directament pel sistema complet.

Vull un ordre d’implementació realista.

MVP 1:
- Core JavaScript
- Parser del CSV d’estacions
- Generació de stations.json/geofences.json
- Model d’events
- Signatures
- Storage local simple
- Simulador de sessions de metro
- Scoring local
- Ranking setmanal local

MVP 2:
- Replica peer simple
- Validator peer simple
- Enviament/replicació d’events P2P
- Verificació de signatures
- WEEKLY_RESULT signat

MVP 3:
- Diversos validators
- Quorum de signatures
- Invasions
- Canvi del 25% menys actiu

MVP 4:
- Mobile app
- Location adapter
- Geofencing
- Station detection
- Metro session matching

MVP 5:
- Anti-cheat més avançat
- Events aleatoris
- UI completa
- Optimització de bateria
- Privacitat millorada

==================================================
14. QUÈ ET DEMANO
==================================================

Quan et demani ajuda, vull que actuïs com a arquitecte i implementador.

Prioritza sempre:

1. Arquitectura clara.
2. Decisions justificades.
3. Implementació pas a pas.
4. Codi JavaScript realista.
5. Separació core/UI/network.
6. Testabilitat des de VSCode.
7. P2P real amb Pear/Holepunch quan pertoqui.
8. Seguretat i anti-cheat.
9. Privacitat.
10. Simplicitat per MVP.

No inventis APIs que no existeixen.
Si una part depèn de Pear/Bare/Holepunch i no és segura, digues-ho.
Si una part és massa complexa per MVP, proposa una versió simplificada.
Si hi ha una decisió tècnica millor, critica la meva proposta i justifica-ho.

Primer objectiu que vull implementar:

Crear el core inicial:

- parsejar estacions.csv,
- extreure coordenades,
- normalitzar PICTO a lineIds,
- generar stations.json,
- generar geofences.json,
- definir model GameEvent,
- crear EventSigner/EventVerifier,
- simular StationDetected,
- crear MetroSessionConfirmed,
- calcular score local.

Comença proposant l’estructura inicial de carpetes i el primer conjunt de fitxers JavaScript que hauríem de crear.
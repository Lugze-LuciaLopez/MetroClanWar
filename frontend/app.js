// ==========================================
// ESTAT GLOBAL DE L'APLICACIÓ
// ==========================================
const state = {
    currentQuestion: 0,
    scores: { L1:0, L2:0, L3:0, L4:0, L5:0, L11:0, L9S:0 },
    clan: localStorage.getItem('userClan') || null,
    totalPoints: parseInt(localStorage.getItem('totalPoints')) || 0,
    
    isTracking: false,
    trackingInterval: null, 
    lastPos: null,          
    consecutiveLowSpeed: 0, 
    confidenceScore: 100    
};

let geofencesData = []; 
let tripPath = [];      

// Configuració Anti-Cheat (AJUSTADA PER A SIMULACIÓ)
const CONFIG = {
    AVG_METRO_SPEED: 26,
    MAX_PLAUSIBLE_SPEED: 80,  // Pujat de 45 a 80 per facilitar la simulació manual
    REJECT_SPEED: 150,        // Rebutjar només si és realment absurd (>150km/h)
    MIN_ACCURACY: 200,
    POINTS_PER_STATION: 10,
    AUTO_STOP_THRESHOLD: 3    // Amb 3 lectures lentes s'atura
};

// ==========================================
// PREGUNTES DEL TEST (Senceres)
// ==========================================
const questions = [
    { text: "What is your love language?", answers: { a: { text: "Physical touch", clan: "L1" }, b: { text: "Gift giving", clan: "L11" }, c: { text: "Words of affirmation", clan: "L9S" }, d: { text: "Acts of service", clan: "L5" }, e: { text: "Quality time", clan: "L4" }, f: { text: "Emotional connection", clan: "L2" }, g: { text: "Personal growth support", clan: "L3" } } },
    { text: "What is your favorite type of pasta?", answers: { a: { text: "Spaghetti", clan: "L5" }, b: { text: "Tortellini", clan: "L2" }, c: { text: "Fettuccine", clan: "L11" }, d: { text: "Penne", clan: "L3" }, e: { text: "Ravioli", clan: "L1" }, f: { text: "Rigatoni", clan: "L4" }, g: { text: "Farfalle", clan: "L9S" } } },
    { text: "Someone is following you at night, you…", answers: { a: { text: "Act crazy to scare them away", clan: "L4" }, b: { text: "Ignore them and keep walking", clan: "L9S" }, c: { text: "Run away as fast as possible", clan: "L3" }, d: { text: "Face them", clan: "L1" }, e: { text: "Start following them", clan: "L2" }, f: { text: "Walk in circles", clan: "L5" }, g: { text: "Call the police", clan: "L11" } } },
    { text: "Which animal represents you best?", answers: { a: { text: "Pigeon", clan: "L1" }, b: { text: "Jellyfish", clan: "L2" }, c: { text: "Rhino", clan: "L3" }, d: { text: "Horseshoe crab", clan: "L3" }, e: { text: "Hyena", clan: "L4" }, f: { text: "King cobra", clan: "L11" }, g: { text: "White shark", clan: "L9S" } } },
    { text: "Among these, which is your favorite metro line?", answers: { a: { text: "L1", clan: "L3" }, b: { text: "L2", clan: "L5" }, c: { text: "L3", clan: "L1" }, d: { text: "L4", clan: "L2" }, e: { text: "L5", clan: "L9S" }, f: { text: "L11", clan: "L11" }, g: { text: "L9S", clan: "L4" } } }
];

// ==========================================
// INICIALITZACIÓ I UI
// ==========================================
const DEMO_PORT = new URLSearchParams(location.search).get('port');
const DEMO_MODE = !!DEMO_PORT;
const CLAN_COLORS = { L1:'#ED1C24', L2:'#93278F', L3:'#00A651', L4:'#FDB913', L5:'#005596', L9N:'#FB712B', L9S:'#FB712B', L10N:'#00A6D6', L10S:'#00A6D6', L11:'#89B94C' };

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch('../data/geofences.json');
        geofencesData = await response.json();
    } catch (e) {
        console.error("❌ Error carregant geofences.");
    }
    if (DEMO_MODE) {
        // Demo mode: clan comes from the connected player-peer via HELLO.
        // If the peer has no clan yet, the HELLO will be { clanId: null }
        // and we'll show the quiz; otherwise we'll jump straight to the
        // dashboard. Until HELLO arrives, show a transient "Connectant…"
        // message in the quiz view (red default background).
        state.clan = null;
        state.totalPoints = 0;
        document.getElementById('score-display').textContent = '0';
        document.getElementById('clan-indicator').textContent = '…';
        const h2 = document.querySelector('#view-quiz h2');
        if (h2) h2.textContent = 'Connectant amb el peer…';
        const grid = document.querySelector('#view-quiz .grid');
        if (grid) grid.innerHTML = '';
        showView('view-quiz');
    } else if (state.clan) {
        updateAppColor();
        finishQuiz();
    } else {
        loadQuestion();
    }
});

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function updateAppColor() {
    const color = CLAN_COLORS[state.clan] || '#ED1C24';
    document.body.style.backgroundColor = color;
}

// Modals are queued. If a new showMessage arrives while one is already
// open, it waits its turn — important because end-of-week + clan-transfer
// notifications can fire back-to-back and the user must see both.
const messageQueue = [];
let messageOpen = false;

function showMessage(title, body, icon = "🏆") {
    messageQueue.push({ title, body, icon });
    if (!messageOpen) showNextMessage();
}

function showNextMessage() {
    if (messageQueue.length === 0) {
        messageOpen = false;
        return;
    }
    const { title, body, icon } = messageQueue.shift();
    messageOpen = true;
    const overlay = document.getElementById('message-overlay');
    document.getElementById('message-title').innerText = title;
    const bodyEl = document.getElementById('message-body');
    bodyEl.innerText = body;
    bodyEl.style.whiteSpace = 'pre-line';
    bodyEl.style.textAlign = 'left';
    document.getElementById('message-icon').innerText = icon;
    overlay.classList.remove('hidden');
}

function closeMessage() {
    document.getElementById('message-overlay').classList.add('hidden');
    // Brief delay before showing the next queued modal so the close animation
    // is visible to the user.
    setTimeout(showNextMessage, 200);
}

function showView(id) {
    document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
}

function loadQuestion() {
    const q = questions[state.currentQuestion];
    document.querySelector("h2").textContent = q.text;
    const container = document.querySelector(".grid");
    container.innerHTML = "";
    Object.entries(q.answers).forEach(([key, value]) => {
        const btn = document.createElement("button");
        btn.className = "w-full p-4 bg-black/20 rounded-2xl text-left border border-white/10 text-white";
        btn.innerHTML = `<span class="font-bold mr-2">${key.toUpperCase()}</span> ${value.text}`;
        btn.onclick = () => selectAnswer(value.clan);
        container.appendChild(btn);
    });
}

function selectAnswer(clan) {
    state.scores[clan]++;
    state.currentQuestion++;
    if (state.currentQuestion < questions.length) loadQuestion();
    else finishQuiz();
}

function finishQuiz() {
    const winner = Object.keys(state.scores).reduce((a, b) => state.scores[a] > state.scores[b] ? a : b);

    if (DEMO_MODE) {
        // Send the result to the player-peer; the next HELLO will advance us
        // to the dashboard. Show a transient confirmation in the quiz view.
        sendDemo({ action: 'assignClan', clanId: winner });
        const h2 = document.querySelector('#view-quiz h2');
        if (h2) h2.textContent = `Assignant-te al clan ${winner}…`;
        const grid = document.querySelector('#view-quiz .grid');
        if (grid) grid.innerHTML = '';
        return;
    }

    if (!state.clan) {
        state.clan = winner;
        localStorage.setItem('userClan', state.clan);
    }
    updateAppColor();
    document.getElementById("clan-indicator").textContent = state.clan;
    document.getElementById("score-display").textContent = state.totalPoints;
    showView("view-dashboard");
}

// ==========================================
// TRACKING I ANTI-CHEAT
// ==========================================

function handleMainAction(event) {
    if(event) event.preventDefault();
    if (state.isTracking) stopJourney();
    else startJourney();
}

function startJourney() {
    state.isTracking = true;
    tripPath = []; 
    state.confidenceScore = 100;
    state.consecutiveLowSpeed = 0;
    state.lastPos = null;

    document.getElementById('btn-main-action').innerText = "STOP & SAVE TRIP";
    document.getElementById('radar-ping').classList.remove('hidden');
    document.getElementById('live-data').classList.remove('opacity-20');

    state.trackingInterval = navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const now = Date.now();
        
        // 1. Càlcul velocitat instantània
        let currentKmh = 0;
        if (state.lastPos) {
            const distKm = calculateDistance(latitude, longitude, state.lastPos.lat, state.lastPos.lon);
            const timeHours = (now - state.lastPos.time) / 3600000;
            if (timeHours > 0) currentKmh = distKm / timeHours;
        }
        state.lastPos = { lat: latitude, lon: longitude, time: now };

        // 2. Penalitzar només velocitats realment absurdes en simulació
        if (currentKmh > CONFIG.REJECT_SPEED) state.confidenceScore -= 50;

        document.getElementById('speed-display').innerText = `${Math.round(currentKmh)} km/h`;

        // 3. AUTO-STOP: Si anem a < 10km/h
        if (currentKmh < 10 && tripPath.length > 0) {
            state.consecutiveLowSpeed++;
            console.log(`⚠️ Velocitat baixa: ${state.consecutiveLowSpeed}/${CONFIG.AUTO_STOP_THRESHOLD}`);
            if (state.consecutiveLowSpeed >= CONFIG.AUTO_STOP_THRESHOLD) {
                stopJourney();
                return;
            }
        } else {
            state.consecutiveLowSpeed = 0;
        }

        // 4. GEOFENCING
        geofencesData.forEach(gf => {
            const distMetres = Math.round(calculateDistance(latitude, longitude, gf.lat, gf.lon) * 1000);
            if (distMetres <= gf.radiusMeters) {
                const last = tripPath[tripPath.length - 1];
                if (!last || last.stationId !== gf.stationId) {
                    tripPath.push({ stationId: gf.stationId, timestamp: now });
                    document.getElementById('current-station').innerText = gf.stationId;
                    document.getElementById('big-points').innerText = tripPath.length * CONFIG.POINTS_PER_STATION;
                }
            }
        });

    }, (err) => console.log(err), { enableHighAccuracy: true });
}

function stopJourney() {
    if (state.trackingInterval !== null) {
        navigator.geolocation.clearWatch(state.trackingInterval);
        state.trackingInterval = null;
    }
    state.isTracking = false;
    validateFinalTrip();
}

function validateFinalTrip() {
    if (tripPath.length < 2) {
        showMessage("TRIP TOO SHORT", "You need at least 2 stations to validate.", "⚠️");
        resetUI();
        return;
    }

    const first = tripPath[0];
    const last = tripPath[tripPath.length - 1];
    const totalHours = (last.timestamp - first.timestamp) / 3600000;
    const totalDist = (tripPath.length - 1) * 1.2; 
    const avgSpeed = totalDist / totalHours;

    // En cas de simulació manual, si l'AvgSpeed és molt alta, la baixem per la demo
    console.log(`📊 Stats: AvgSpeed ${avgSpeed.toFixed(1)} km/h | Confidence: ${state.confidenceScore}%`);

    if (avgSpeed > CONFIG.REJECT_SPEED) {
        showMessage("TRIP REJECTED", "Anti-Cheat detected unplausible movement.", "🚫");
    } else {
        const points = tripPath.length * CONFIG.POINTS_PER_STATION;
        state.totalPoints += points;
        localStorage.setItem('totalPoints', state.totalPoints);
        document.getElementById('score-display').innerText = state.totalPoints;
        
        // MISSATGE D'ÈXIT PERSONALITZAT
        showMessage("JOURNEY FINISHED", `Success! You completed your trip and earned ${points} points.`, "🏁");
    }
    resetUI();
}

function resetUI() {
    const btn = document.getElementById('btn-main-action');
    btn.innerText = "START JOURNEY SCAN";
    btn.style.backgroundColor = "white";
    document.getElementById('radar-ping').classList.add('hidden');
    document.getElementById('live-data').classList.add('opacity-20');
    document.getElementById('big-points').innerText = "0";
    document.getElementById('current-station').innerText = "---";
}

// ==========================================
// DEMO PANEL (P2P simulation via WebSocket bridge)
// ==========================================
const DEMO_SPEED_PLACEHOLDER = '30 km/h';

const demo = {
    ws: null,
    port: DEMO_PORT || '8787',
    // Two ranking views, both fed by the bridge:
    //   global: cumulative all-time (never resets).
    //   weekly: events submitted strictly after the last finalized
    //           WEEKLY_RESULT and excluding clans currently at war.
    globalScores: {},
    weeklyScores: {},
    warPair: null,             // { attackerClanId, defenderClanId } | null
    warClans: new Set(),
    latestWeeklyResult: null,
    rankingTab: 'global',      // 'global' | 'weekly'
    eventCount: 0,
    inTrip: false,
    pendingSessions: {},
    seenEventIds: new Set(),
    playerId: null,            // set from HELLO so we can detect events about us
    pendingTransfer: null      // { fromClanId, toClanId } when we've just been transferred
};

function setDemoStatus(text)     { document.getElementById('demo-status').innerText = text; }
function setDemoPlayer(text)     { document.getElementById('demo-player').innerText = text; }
function setDemoValidation(text) { document.getElementById('demo-validation').innerText = text; }

// Trip data goes into the existing main UI fields (header line + central
// circle + live-data row) so the dashboard reflects "what's happening" in
// the same shape as the GPS flow does.
function setTripLine(lineId)        { document.getElementById('trip-line').innerText = lineId || '—'; }
function setTripStation(name)       { document.getElementById('current-station').innerText = name || '---'; }
function setTripSpeed(text)         { document.getElementById('speed-display').innerText = text; }
function setTripBigPoints(points)   { document.getElementById('big-points').innerText = String(points); }
function setLiveDataActive(active) {
    document.getElementById('live-data').classList.toggle('opacity-30', !active);
    document.getElementById('live-data').classList.toggle('opacity-100', active);
}
function setRadar(active) {
    document.getElementById('radar-ping').classList.toggle('hidden', !active);
}

function clearTripFields() {
    setTripStation('---');
    setTripSpeed('0 km/h');
    setTripBigPoints(0);
    setRadar(false);
    setLiveDataActive(false);
}

function applyClan(clanId) {
    if (!clanId) return;
    state.clan = clanId;
    document.getElementById('clan-indicator').textContent = clanId;
    updateAppColor();
    updateWarBanner();
}

function pushDemoEvent(line) {
    const list = document.getElementById('demo-events');
    const li = document.createElement('li');
    li.innerText = line;
    list.prepend(li);
    while (list.children.length > 12) list.lastChild.remove();
}

function renderRanking() {
    const list = document.getElementById('demo-ranking');
    const hint = document.getElementById('ranking-empty-hint');
    const weekLabel = document.getElementById('ranking-week-label');
    list.innerHTML = '';

    const useWeekly = demo.rankingTab === 'weekly';
    const scores = useWeekly ? demo.weeklyScores : demo.globalScores;

    if (weekLabel) {
        if (useWeekly) {
            const wid = demo.latestWeeklyResult?.weekId;
            weekLabel.textContent = wid ? `Després de ${wid}` : 'Setmana en curs';
        } else {
            weekLabel.textContent = 'Acumulat des de l\'inici';
        }
    }

    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
        const li = document.createElement('li');
        li.className = 'opacity-40 text-center py-8 text-sm';
        li.innerText = useWeekly ? 'Sense punts aquesta setmana' : 'Sense punts encara';
        list.appendChild(li);
        if (hint) {
            if (useWeekly && demo.warClans.size) {
                hint.textContent = `Clans en guerra exclosos: ${[...demo.warClans].join(' vs ')}`;
                hint.classList.remove('hidden');
            } else hint.classList.add('hidden');
        }
        return;
    }

    entries.forEach(([clan, pts], idx) => {
        const color = CLAN_COLORS[clan] || '#666';
        const isMe = clan === state.clan;
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center px-4 py-3 rounded-xl';
        li.style.background = `${color}33`;
        li.style.borderLeft = `5px solid ${color}`;
        if (isMe) li.style.boxShadow = `0 0 0 2px ${color}`;
        li.innerHTML = `
            <div class="flex items-center gap-3">
              <span class="text-xs opacity-60 font-mono">#${idx + 1}</span>
              <span class="font-black text-xl" style="color:${color}">${clan}</span>
              ${isMe ? '<span class="text-[9px] uppercase opacity-70 font-bold">tu</span>' : ''}
            </div>
            <span class="text-2xl font-black tabular-nums">${pts}</span>
        `;
        list.appendChild(li);
    });

    if (hint) {
        if (useWeekly && demo.warClans.size) {
            hint.textContent = `Clans en guerra exclosos: ${[...demo.warClans].join(' vs ')}`;
            hint.classList.remove('hidden');
        } else hint.classList.add('hidden');
    }
}

function setRankingTab(tab) {
    demo.rankingTab = tab;
    const tg = document.getElementById('tab-global');
    const tw = document.getElementById('tab-weekly');
    if (tg && tw) {
        const active = 'bg-white text-black border-transparent';
        const inactive = 'bg-black/40 text-white/80 border border-white/10';
        tg.className = `ranking-tab flex-1 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide ${tab === 'global' ? active : inactive}`;
        tw.className = `ranking-tab flex-1 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide ${tab === 'weekly' ? active : inactive}`;
    }
    renderRanking();
}

function updateWarBanner() {
    const banner = document.getElementById('war-banner');
    if (!banner) return;
    const pair = demo.warPair;
    const me = state.clan;
    if (!pair || !me || (me !== pair.attackerClanId && me !== pair.defenderClanId)) {
        banner.classList.add('hidden');
        return;
    }
    const isAttacker = me === pair.attackerClanId;
    const opponent = isAttacker ? pair.defenderClanId : pair.attackerClanId;
    const opponentColor = CLAN_COLORS[opponent] || '#fff';
    const myColor = CLAN_COLORS[me] || '#fff';

    document.getElementById('war-banner-week').textContent =
        `Guerra de ${demo.latestWeeklyResult?.weekId ?? 'aquesta setmana'}`;
    document.getElementById('war-banner-role').textContent =
        isAttacker ? `⚔️ Estàs ATACANT` : `🛡️ Estàs DEFENSANT`;
    document.getElementById('war-banner-target').textContent =
        isAttacker
            ? `Juga estacions de ${opponent} per sumar a la invasió`
            : `${opponent} t'envaeix — defensa la teva línia jugant a ${me}`;

    banner.style.background = `linear-gradient(90deg, ${myColor}66, ${opponentColor}66)`;
    banner.style.borderColor = isAttacker ? opponentColor : myColor;
    banner.classList.remove('hidden');
}

function showWeeklyResultModal(event) {
    const p = event?.payload || {};
    const wid = p.weekId ?? event?.weekId ?? '?';
    const ranking = p.weeklyRanking || [];
    const global = p.globalRanking || [];
    const pair = p.nextWarPair;
    const wr = p.warResult;

    let body = '';
    if (wr) {
        const winner = wr.winner === 'ATTACKER' ? wr.attackerClanId : wr.defenderClanId;
        body += `Guerra: ${wr.attackerClanId} vs ${wr.defenderClanId}\n`;
        body += `→ ${winner} guanya (${wr.attackerPoints} vs ${wr.defenderPoints})\n\n`;
    }
    if (ranking.length) {
        body += `Top setmanal:\n`;
        body += ranking.slice(0, 3).map((c, i) => `${i + 1}. ${c.clanId} — ${c.points} pts`).join('\n');
        body += '\n\n';
    } else if (global.length) {
        body += `Ranking global:\n`;
        body += global.slice(0, 3).map((c, i) => `${i + 1}. ${c.clanId} — ${c.points} pts`).join('\n');
        body += '\n\n';
    }
    if (pair) {
        const myRole = state.clan === pair.attackerClanId ? '  ⚔️ ATAQUES TU'
                     : state.clan === pair.defenderClanId ? '  🛡️ DEFENSES TU'
                     : '';
        body += `Pròxima guerra:\n${pair.attackerClanId} → ${pair.defenderClanId}${myRole}`;
    } else {
        body += `Pròxima setmana: cap guerra programada`;
    }

    showMessage(`SETMANA ${wid}`, body, '🏁');
}

function renderRoutes(routes) {
    const grid = document.getElementById('demo-routes');
    grid.innerHTML = '';
    for (const r of routes) {
        const btn = document.createElement('button');
        const isCheat = r.routeId === 'CHEAT';
        btn.className = 'btn-active py-3 rounded-xl text-[11px] font-black uppercase tracking-wide border ' +
            (isCheat ? 'bg-black/40 text-white/90 border-white/20' : 'bg-white text-black border-transparent');
        btn.innerText = r.label;
        btn.onclick = () => sendDemo({ action: 'runRoute', routeId: r.routeId });
        grid.appendChild(btn);
    }
}

function sendDemo(obj) {
    if (demo.ws && demo.ws.readyState === WebSocket.OPEN) {
        demo.ws.send(JSON.stringify(obj));
    }
}

function handleDemoMessage(msg) {
    switch (msg.type) {
        case 'HELLO':
            demo.playerId = msg.playerId;
            setDemoPlayer(`${msg.playerId.slice(0, 8)}… / ${msg.clanId ?? '—'}`);
            if (msg.clanId) {
                applyClan(msg.clanId);
                renderRanking();
                showView('view-dashboard');
            } else {
                // No clan yet — start the quiz with red default background.
                state.currentQuestion = 0;
                state.scores = { L1:0, L2:0, L3:0, L4:0, L5:0, L11:0, L9S:0 };
                document.body.style.backgroundColor = '#ED1C24';
                showView('view-quiz');
                loadQuestion();
            }
            break;
        case 'AVAILABLE_ROUTES':
            renderRoutes(msg.routes);
            break;
        case 'STATE_SNAPSHOT':
            // Hydrate ranking + own total from the accumulated state held by
            // the bridge. Subsequent live SCORE_GRANTED events with the same
            // eventId will be deduped via demo.seenEventIds.
            demo.globalScores = { ...(msg.globalScores || {}) };
            demo.weeklyScores = { ...(msg.weeklyScores || {}) };
            demo.warPair = msg.warPair || null;
            demo.warClans = new Set(msg.warClans || []);
            demo.latestWeeklyResult = msg.latestWeeklyResult || null;
            state.totalPoints = msg.myTotalPoints || 0;
            for (const id of (msg.seenEventIds || [])) demo.seenEventIds.add(id);
            document.getElementById('score-display').innerText = state.totalPoints;
            renderRanking();
            updateWarBanner();
            break;
        case 'ROUTE_STARTED':
            demo.inTrip = true;
            setTripLine(msg.lineId);
            setTripStation('—');
            setTripBigPoints(0);
            setTripSpeed(DEMO_SPEED_PLACEHOLDER);
            setRadar(true);
            setLiveDataActive(true);
            setDemoValidation('pendent');
            pushDemoEvent(`▶ ${msg.label}`);
            break;
        case 'STATION_DETECTED':
            setTripLine(msg.lineId);
            setTripStation(msg.stationName ?? msg.stationId);
            setTripSpeed(DEMO_SPEED_PLACEHOLDER);
            setTripBigPoints(msg.accumulatedPoints);
            pushDemoEvent(`[self] ${msg.stationName ?? msg.stationId}`);
            break;
        case 'METRO_SESSION_CONFIRMED': {
            const tag = msg.source === 'self' ? '[self]' : '[swarm]';
            pushDemoEvent(`${tag} METRO_SESSION_CONFIRMED ${msg.payload?.lineId ?? ''}`);
            if (msg.source === 'self') {
                setDemoValidation('Trajecte enviat · esperant validator…');
                demo.inTrip = false;
                setRadar(false);
                setTripSpeed('0 km/h');
            } else if (msg.source === 'swarm') {
                // Validator accepted (else would have emitted METRO_SESSION_REJECTED first).
                const sid = msg.payload?.sessionId;
                if (sid && demo.pendingSessions[sid]?.mine) {
                    setDemoValidation('Acceptada pel validator ✓');
                }
            }
            break;
        }
        case 'SCORE_GRANTED': {
            const clan = msg.payload?.clanId;
            const pts  = msg.payload?.points ?? 0;
            const sid  = msg.payload?.sessionId;
            const eid  = msg.eventId;
            const tag  = msg.source === 'self' ? '[self]' : '[swarm]';
            const alreadyCounted = eid && demo.seenEventIds.has(eid);
            if (eid) demo.seenEventIds.add(eid);

            if (!alreadyCounted && clan && pts) {
                demo.globalScores[clan] = (demo.globalScores[clan] || 0) + pts;
                if (!demo.warClans.has(clan)) {
                    demo.weeklyScores[clan] = (demo.weeklyScores[clan] || 0) + pts;
                }
                renderRanking();
                if (msg.source === 'self') {
                    state.totalPoints += pts;
                    document.getElementById('score-display').innerText = state.totalPoints;
                }
            }
            if (msg.source === 'self') {
                setDemoValidation('Pendent — esperant validator…');
            }
            if (sid) {
                demo.pendingSessions[sid] = { clan, points: pts, mine: msg.source === 'self' };
            }
            pushDemoEvent(`${tag} SCORE_GRANTED ${clan} +${pts}`);
            break;
        }
        case 'METRO_SESSION_REJECTED': {
            const sid    = msg.payload?.sessionId;
            const reason = msg.payload?.reason ?? msg.reason;
            const eid    = msg.eventId;
            const pending = sid ? demo.pendingSessions[sid] : null;

            // If the rejection event was already in the snapshot, the
            // bridge already removed its score from clanScores. Skip the
            // local rollback to avoid double-subtracting.
            const alreadyApplied = eid && demo.seenEventIds.has(eid);
            if (eid) demo.seenEventIds.add(eid);

            if (pending && !alreadyApplied) {
                // Roll back the points we tentatively credited (both views).
                const clan = pending.clan;
                if (clan) {
                    if (demo.globalScores[clan] != null) {
                        demo.globalScores[clan] -= pending.points;
                        if (demo.globalScores[clan] <= 0) delete demo.globalScores[clan];
                    }
                    if (demo.weeklyScores[clan] != null) {
                        demo.weeklyScores[clan] -= pending.points;
                        if (demo.weeklyScores[clan] <= 0) delete demo.weeklyScores[clan];
                    }
                    renderRanking();
                }
                if (pending.mine) {
                    state.totalPoints = Math.max(0, state.totalPoints - pending.points);
                    document.getElementById('score-display').innerText = state.totalPoints;
                }
                delete demo.pendingSessions[sid];
            }

            const isMine = pending?.mine || msg.source === 'self';
            setDemoValidation(`Rebutjada: ${reason}`);
            pushDemoEvent(`✗ REJECTED: ${reason}`);
            demo.inTrip = false;
            setRadar(false);
            setTripSpeed('0 km/h');

            if (isMine) {
                showMessage('RUTA INVALIDADA', `${reason}\n\nNo es comptabilitzen punts d'aquest trajecte.`, '🚫');
            }
            break;
        }
        case 'WEEKLY_RESULT': {
            const eid = msg.eventId;
            const alreadySeen = eid && demo.seenEventIds.has(eid);
            if (eid) demo.seenEventIds.add(eid);

            // The end-of-week event arrives here only via the swarm (signed
            // by the validator). Update local view to match: war pair becomes
            // the new nextWarPair; weekly counter resets to start counting
            // events submitted from now on.
            const p = msg.payload || {};
            demo.warPair = p.nextWarPair || null;
            demo.warClans = new Set([p.nextWarPair?.attackerClanId, p.nextWarPair?.defenderClanId].filter(Boolean));
            demo.latestWeeklyResult = msg;
            demo.weeklyScores = {};

            renderRanking();
            updateWarBanner();
            pushDemoEvent(`[swarm] WEEKLY_RESULT ${p.weekId ?? ''}`);

            if (!alreadySeen) {
                showWeeklyResultModal(msg);
                // If we got transferred during this week's invasion, queue
                // the personal explanation right after the weekly modal.
                if (demo.pendingTransfer) {
                    const { fromClanId, toClanId } = demo.pendingTransfer;
                    demo.pendingTransfer = null;
                    showMessage(
                        'CANVI DE CLAN',
                        `${fromClanId} ha perdut la guerra contra ${toClanId}.\n\n` +
                        `Eres dels jugadors menys actius del clan ${fromClanId}, així que passes a formar part del clan ${toClanId}.`,
                        '🚩'
                    );
                }
            }
            break;
        }
        case 'INVASION_RESULT': {
            const p = msg.payload || {};
            const winner = p.winner === 'ATTACKER' ? p.attackerClanId : p.defenderClanId;
            pushDemoEvent(`★ INVASIÓ: ${winner} guanya (${p.attackerClanId} vs ${p.defenderClanId})`);
            break;
        }
        case 'CLAN_MEMBERSHIP_CHANGED': {
            const p = msg.payload || {};
            pushDemoEvent(`[swarm] ${p.affectedPlayerId?.slice(0, 8)}… → ${p.toClanId}`);
            // Defer the personal "you've been transferred" modal until the
            // WEEKLY_RESULT modal has been shown, so the user sees the
            // big-picture result first and the personal consequence after.
            if (p.affectedPlayerId === demo.playerId && p.toClanId) {
                demo.pendingTransfer = { fromClanId: p.fromClanId, toClanId: p.toClanId };
            }
            break;
        }
        case 'RESET':
            demo.globalScores = {};
            demo.weeklyScores = {};
            demo.inTrip = false;
            state.totalPoints = 0;
            document.getElementById('score-display').innerText = '0';
            renderRanking();
            clearTripFields();
            setTripLine('—');
            setDemoValidation('—');
            document.getElementById('demo-events').innerHTML = '';
            break;
        case 'ERROR':
            pushDemoEvent(`! ERROR: ${msg.reason}`);
            break;
    }
}

function connectDemoBridge() {
    const url = `ws://localhost:${demo.port}`;
    setDemoStatus(`connectant a ${url}…`);
    try {
        demo.ws = new WebSocket(url);
    } catch (e) {
        setDemoStatus('error connexió');
        return;
    }
    demo.ws.onopen    = () => setDemoStatus(`connectat (port ${demo.port})`);
    demo.ws.onclose   = () => { setDemoStatus('desconnectat — reintentant en 2s'); setTimeout(connectDemoBridge, 2000); };
    demo.ws.onerror   = () => {};
    demo.ws.onmessage = (e) => {
        try { handleDemoMessage(JSON.parse(e.data)); } catch {}
    };
}

function bindDemoButtons() {
    document.getElementById('btn-demo-reset').onclick = () => sendDemo({ action: 'reset' });
    const tg = document.getElementById('tab-global');
    const tw = document.getElementById('tab-weekly');
    if (tg) tg.onclick = () => setRankingTab('global');
    if (tw) tw.onclick = () => setRankingTab('weekly');
}

document.addEventListener('DOMContentLoaded', () => {
    bindDemoButtons();
    renderRanking();
    connectDemoBridge();
});
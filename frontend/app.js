// ==========================================
// ESTAT GLOBAL DE L'APLICACIÓ
// ==========================================
const state = {
    currentQuestion: 0,
    scores: { L1:0, L2:0, L3:0, L4:0, L5:0, L7:0, L9sud:0 },
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
    { text: "What is your love language?", answers: { a: { text: "Physical touch", clan: "L1" }, b: { text: "Gift giving", clan: "L7" }, c: { text: "Words of affirmation", clan: "L9sud" }, d: { text: "Acts of service", clan: "L5" }, e: { text: "Quality time", clan: "L4" }, f: { text: "Emotional connection", clan: "L2" }, g: { text: "Personal growth support", clan: "L3" } } },
    { text: "What is your favorite type of pasta?", answers: { a: { text: "Spaghetti", clan: "L5" }, b: { text: "Tortellini", clan: "L2" }, c: { text: "Fettuccine", clan: "L7" }, d: { text: "Penne", clan: "L3" }, e: { text: "Ravioli", clan: "L1" }, f: { text: "Rigatoni", clan: "L4" }, g: { text: "Farfalle", clan: "L9sud" } } },
    { text: "Someone is following you at night, you…", answers: { a: { text: "Act crazy to scare them away", clan: "L4" }, b: { text: "Ignore them and keep walking", clan: "L9sud" }, c: { text: "Run away as fast as possible", clan: "L3" }, d: { text: "Face them", clan: "L1" }, e: { text: "Start following them", clan: "L2" }, f: { text: "Walk in circles", clan: "L5" }, g: { text: "Call the police", clan: "L7" } } },
    { text: "Which animal represents you best?", answers: { a: { text: "Pigeon", clan: "L1" }, b: { text: "Jellyfish", clan: "L2" }, c: { text: "Rhino", clan: "L1" }, d: { text: "Horseshoe crab", clan: "L3" }, e: { text: "Hyena", clan: "L4" }, f: { text: "King cobra", clan: "L7" }, g: { text: "White shark", clan: "L9sud" } } },
    { text: "Among these, which is your favorite metro line?", answers: { a: { text: "L1", clan: "L3" }, b: { text: "L2", clan: "L5" }, c: { text: "L3", clan: "L1" }, d: { text: "L4", clan: "L2" }, e: { text: "L5", clan: "L9sud" }, f: { text: "L7", clan: "L7" }, g: { text: "L9 Sud", clan: "L4" } } }
];

// ==========================================
// INICIALITZACIÓ I UI
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch('../data/geofences.json');
        geofencesData = await response.json();
    } catch (e) {
        console.error("❌ Error carregant geofences.");
    }
    if (state.clan) {
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
    const clanColors = { L1:'#ED1C24', L2:'#93278F', L3:'#00A651', L4:'#FDB913', L5:'#005596', L7:'#B97D05', L9sud:'#F37021' };
    const color = clanColors[state.clan] || '#ED1C24';
    document.body.style.backgroundColor = color;
}

function showMessage(title, body, icon = "🏆") {
    const overlay = document.getElementById('message-overlay');
    document.getElementById('message-title').innerText = title;
    document.getElementById('message-body').innerText = body;
    document.getElementById('message-icon').innerText = icon;
    overlay.classList.remove('hidden');
}

function closeMessage() {
    document.getElementById('message-overlay').classList.add('hidden');
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
    if (!state.clan) {
        state.clan = Object.keys(state.scores).reduce((a, b) => state.scores[a] > state.scores[b] ? a : b);
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
// ESTAT DEL JOC
const state = {
    currentQuestion: 0,
    scores: { L1:0, L2:0, L3:0, L4:0, L5:0, L7:0, L9sud:0 },
    clan: localStorage.getItem('userClan') || null,
    totalPoints: parseInt(localStorage.getItem('totalPoints')) || 0,
    sessionPoints: 0,
    isTracking: false,
    trackingInterval: null // Aquí guardarem el ID de watchPosition
};

let geofencesData = []; 
let tripPath = [];      

// PREGUNTES DEL QUIZ
const questions = [
    { text: "What is your love language?", answers: { a: { text: "Physical touch", clan: "L1" }, b: { text: "Gift giving", clan: "L7" }, c: { text: "Words of affirmation", clan: "L9sud" }, d: { text: "Acts of service", clan: "L5" }, e: { text: "Quality time", clan: "L4" }, f: { text: "Emotional connection", clan: "L2" }, g: { text: "Personal growth support", clan: "L3" } } },
    { text: "What is your favorite type of pasta?", answers: { a: { text: "Spaghetti", clan: "L5" }, b: { text: "Tortellini", clan: "L2" }, c: { text: "Fettuccine", clan: "L7" }, d: { text: "Penne", clan: "L3" }, e: { text: "Ravioli", clan: "L1" }, f: { text: "Rigatoni", clan: "L4" }, g: { text: "Farfalle", clan: "L9sud" } } },
    { text: "Someone is following you at night, you…", answers: { a: { text: "Act crazy to scare them away", clan: "L4" }, b: { text: "Ignore them and keep walking", clan: "L9sud" }, c: { text: "Run away as fast as possible", clan: "L3" }, d: { text: "Face them", clan: "L1" }, e: { text: "Start following them", clan: "L2" }, f: { text: "Walk in circles", clan: "L5" }, g: { text: "Call the police", clan: "L7" } } },
    { text: "Which animal represents you best?", answers: { a: { text: "Pigeon", clan: "L1" }, b: { text: "Jellyfish", clan: "L2" }, c: { text: "Rhino", clan: "L1" }, d: { text: "Horseshoe crab", clan: "L3" }, e: { text: "Hyena", clan: "L4" }, f: { text: "King cobra", clan: "L7" }, g: { text: "White shark", clan: "L9sud" } } },
    { text: "Among these, which is your favorite metro line?", answers: { a: { text: "L1", clan: "L3" }, b: { text: "L2", clan: "L5" }, c: { text: "L3", clan: "L1" }, d: { text: "L4", clan: "L2" }, e: { text: "L5", clan: "L9sud" }, f: { text: "L7", clan: "L7" }, g: { text: "L9 Sud", clan: "L4" } } }
];

// INICIALITZACIÓ
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch('../data/geofences.json');
        geofencesData = await response.json();
        console.log("✅ Geofences carregats:", geofencesData.length);
    } catch (e) {
        console.error("❌ Error carregant geofences:", e);
    }

    if (state.clan) {
        updateAppColor();
        finishQuiz(); 
    } else {
        loadQuestion();
    }
});

// CÀLCUL DE DISTÀNCIA
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// GESTIÓ DE LA UI
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

// LÒGICA DEL QUIZ
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
    if (state.currentQuestion < questions.length) {
        loadQuestion();
    } else {
        finishQuiz();
    }
}

function finishQuiz() {
    if (!state.clan) {
        state.clan = Object.keys(state.scores).reduce((a, b) => state.scores[a] > state.scores[b] ? a : b);
        localStorage.setItem('userClan', state.clan);
        showMessage("CONGRATULATIONS!", `You belong to Line ${state.clan}. Welcome to the faction!`, "🚇");
    }
    updateAppColor();
    document.getElementById("clan-indicator").textContent = state.clan;
    document.getElementById("score-display").textContent = state.totalPoints;
    document.getElementById("clan-indicator").className = `w-16 h-16 rounded-full border-4 border-white bg-black/20 flex items-center justify-center text-2xl font-black shadow-lg`;
    showView("view-dashboard");
}

// --- EL "CORE" DEL GEOTRACKING ---
function handleMainAction(event) {
    if(event) event.preventDefault();
    if (state.isTracking) {
        stopJourney();
    } else {
        startJourney();
    }
}

function startJourney() {
    if (geofencesData.length === 0) {
        alert("Error: Geofences no carregats.");
        return;
    }

    state.isTracking = true;
    tripPath = []; 

    const btn = document.getElementById('btn-main-action');
    btn.innerText = "STOP & SAVE TRIP";
    btn.style.backgroundColor = "black";
    
    document.getElementById('radar-ping').classList.remove('hidden');
    document.getElementById('live-data').classList.remove('opacity-20');
    document.getElementById('tracking-status').innerText = "TRACKING ACTIVE";

    state.trackingInterval = navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        console.log(`📍 Posició actual: ${latitude}, ${longitude}`);

        geofencesData.forEach(gf => {
            // Adaptem les claus a la teva estructura exacta:
            const name = gf.stationId; // Fem servir l'ID com a nom (ex: "CATALUNYA")
            const radius = gf.radiusMeters; // Aquí estava l'error, ara és radiusMeters
            
            const dist = calculateDistance(latitude, longitude, gf.lat, gf.lon);
            const distMetres = Math.round(dist * 1000);

            // Log de depuració per veure a quina distància estàs de cada parada al log
            if (dist < 1.5) { 
                console.log(`📏 Distància a ${name}: ${distMetres}m (Límit: ${radius}m)`);
            }
            
            // Validació de l'entrada al geofence
            if (distMetres <= radius) {
                const lastStation = tripPath[tripPath.length - 1];
                
                if (!lastStation || lastStation.stationId !== gf.stationId) {
                    tripPath.push({
                        stationId: gf.stationId,
                        name: name,
                        timestamp: Date.now()
                    });
                    
                    // Actualització visual
                    document.getElementById('current-station').innerText = name;
                    document.getElementById('big-points').innerText = tripPath.length * 10;
                    console.log(`✅ ESTACIÓ DETECTADA: ${name}`);
                }
            }
        });

        // Actualitzem la velocitat (26 km/h per defecte si el simulador no n'envia)
        const currentSpeed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 26;
        document.getElementById('speed-display').innerText = currentSpeed + " km/h";

    }, (err) => {
        if (err.code === 2) console.log("⌛ Esperant senyal del simulador...");
    }, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000 
    });
}

function stopJourney() {
    // Matem el watchPosition quan premem STOP
    if (state.trackingInterval !== null) {
        navigator.geolocation.clearWatch(state.trackingInterval);
        state.trackingInterval = null;
    }
    
    state.isTracking = false;

    if (tripPath.length < 2) {
        showMessage("TRIP TOO SHORT", "You need at least 2 stations.", "⚠️");
    } else {
        const first = tripPath[0];
        const last = tripPath[tripPath.length - 1];
        const durationHours = (last.timestamp - first.timestamp) / 3600000;
        const distance = (tripPath.length - 1) * 1.1; 
        const avgSpeed = distance / durationHours;

        if (avgSpeed > 45) {
            showMessage("INVALID SPEED", `Avg speed (${Math.round(avgSpeed)}km/h) too high!`, "🚫");
        } else {
            const earnedPoints = tripPath.length * 10;
            state.totalPoints += earnedPoints;
            localStorage.setItem('totalPoints', state.totalPoints);
            document.getElementById('score-display').innerText = state.totalPoints;
            showMessage("TRIP FINISHED", `Earned ${earnedPoints} points!`, "🏁");
        }
    }
    resetUI();
}

function resetUI() {
    const btn = document.getElementById('btn-main-action');
    btn.innerText = "START JOURNEY SCAN";
    btn.style.backgroundColor = "white";
    btn.style.color = "black";
    document.getElementById('radar-ping').classList.add('hidden');
    document.getElementById('live-data').classList.add('opacity-20');
    document.getElementById('tracking-status').innerText = "SCANNER READY";
    document.getElementById('big-points').innerText = "0";
    document.getElementById('speed-display').innerText = "0 km/h";
    document.getElementById('current-station').innerText = "---";
}
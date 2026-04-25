const state = {
    currentQuestion: 0,
    scores: { L1:0, L2:0, L3:0, L4:0, L5:0, L7:0, L9sud:0 },
    clan: localStorage.getItem('userClan') || null,
    totalPoints: parseInt(localStorage.getItem('totalPoints')) || 0,
    sessionPoints: 0,
    isTracking: false,
    consecutiveLowSpeed: 0,
    trackingInterval: null
};

const questions = [
    { text: "What is your love language?", answers: { a: { text: "Physical touch", clan: "L1" }, b: { text: "Gift giving", clan: "L7" }, c: { text: "Words of affirmation", clan: "L9sud" }, d: { text: "Acts of service", clan: "L5" }, e: { text: "Quality time", clan: "L4" }, f: { text: "Emotional connection", clan: "L2" }, g: { text: "Personal growth support", clan: "L3" } } },
    { text: "What is your favorite type of pasta?", answers: { a: { text: "Spaghetti", clan: "L5" }, b: { text: "Tortellini", clan: "L2" }, c: { text: "Fettuccine", clan: "L7" }, d: { text: "Penne", clan: "L3" }, e: { text: "Ravioli", clan: "L1" }, f: { text: "Rigatoni", clan: "L4" }, g: { text: "Farfalle", clan: "L9sud" } } },
    { text: "Someone is following you at night, you…", answers: { a: { text: "Act crazy to scare them away", clan: "L4" }, b: { text: "Ignore them and keep walking", clan: "L9sud" }, c: { text: "Run away as fast as possible", clan: "L3" }, d: { text: "Face them", clan: "L1" }, e: { text: "Start following them", clan: "L2" }, f: { text: "Walk in circles", clan: "L5" }, g: { text: "Call the police", clan: "L7" } } },
    { text: "Which animal represents you best?", answers: { a: { text: "Pigeon", clan: "L1" }, b: { text: "Jellyfish", clan: "L2" }, c: { text: "Rhino", clan: "L1" }, d: { text: "Horseshoe crab", clan: "L3" }, e: { text: "Hyena", clan: "L4" }, f: { text: "King cobra", clan: "L7" }, g: { text: "White shark", clan: "L9sud" } } },
    { text: "Among these, which is your favorite metro line?", answers: { a: { text: "L1", clan: "L3" }, b: { text: "L2", clan: "L5" }, c: { text: "L3", clan: "L1" }, d: { text: "L4", clan: "L2" }, e: { text: "L5", clan: "L9sud" }, f: { text: "L7", clan: "L7" }, g: { text: "L9 Sud", clan: "L4" } } }
];

document.addEventListener("DOMContentLoaded", () => {
    if (state.clan) {
        updateAppColor();
        finishQuiz(); 
    } else {
        loadQuestion();
    }
});

function showMessage(title, body, icon = "🏆") {
    const overlay = document.getElementById('message-overlay');
    document.getElementById('message-title').innerText = title;
    document.getElementById('message-body').innerText = body;
    document.getElementById('message-icon').innerText = icon;
    if (state.clan) {
        const clanColors = { L1:'#ED1C24', L2:'#93278F', L3:'#00A651', L4:'#FDB913', L5:'#005596', L7:'#B97D05', L9sud:'#F37021' };
        document.getElementById('message-btn').style.backgroundColor = clanColors[state.clan];
    }
    overlay.classList.remove('hidden');
}

function closeMessage() {
    document.getElementById('message-overlay').classList.add('hidden');
}

function updateAppColor() {
    const clanColors = { L1:'#ED1C24', L2:'#93278F', L3:'#00A651', L4:'#FDB913', L5:'#005596', L7:'#B97D05', L9sud:'#F37021' };
    const color = clanColors[state.clan] || '#ED1C24';
    document.body.style.backgroundColor = color;
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

function showView(id) {
    document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
}

// --- LOGICA DE TRACKING REVISADA ---
function handleMainAction(event) {
    // Evitem comportaments estranys del navegador
    if(event) event.preventDefault();
    
    if (state.isTracking) {
        stopJourney();
    } else {
        startJourney();
    }
}

function startJourney() {
    state.isTracking = true;
    state.sessionPoints = 0;
    state.consecutiveLowSpeed = 0;

    const btn = document.getElementById('btn-main-action');
    btn.innerText = "STOP & SAVE TRIP";
    btn.style.backgroundColor = "black";
    btn.style.color = "white";
    
    document.getElementById('radar-ping').classList.remove('hidden');
    document.getElementById('live-data').classList.remove('opacity-20');
    document.getElementById('tracking-status').innerText = "TRACKING ACTIVE";

    // Iniciem el bucle
    runAutoDetectionLoop();
}

function stopJourney() {
    // KILL SWITCH: Aturem l'interval el PRIMER de tot
    if (state.trackingInterval) {
        clearInterval(state.trackingInterval);
        state.trackingInterval = null;
    }
    
    state.isTracking = false;
    
    // Guardem dades
    state.totalPoints += state.sessionPoints;
    localStorage.setItem('totalPoints', state.totalPoints);
    document.getElementById('score-display').innerText = state.totalPoints;

    showMessage("TRIP FINISHED", `Success! You earned ${state.sessionPoints} points.`, "🏁");
    
    resetUI();
}

function runAutoDetectionLoop() {
    const stations = ["Catalunya", "Passeig de Gràcia", "Diagonal", "Fontana"];
    let stationIdx = 0;

    state.trackingInterval = setInterval(() => {
        // Si per algun motiu s'ha parat externament, matem l'interval
        if (!state.isTracking) {
            clearInterval(state.trackingInterval);
            return;
        }

        let speed = 15 + Math.floor(Math.random() * 25);
        
        // Simulació de parada automàtica
        if (state.sessionPoints > 35 && Math.random() > 0.92) speed = 2;

        state.sessionPoints += 1;
        document.getElementById('big-points').innerText = state.sessionPoints;
        document.getElementById('speed-display').innerText = speed + " km/h";
        document.getElementById('current-station').innerText = speed > 5 ? stations[stationIdx % 4] : "Station / Stopped";
        
        if(speed > 5 && state.sessionPoints % 10 === 0) stationIdx++;

        if (speed < 5) {
            state.consecutiveLowSpeed++;
        } else {
            state.consecutiveLowSpeed = 0;
        }

        // Auto-stop si detecta parada llarga
        if (state.consecutiveLowSpeed >= 5) {
            stopJourney();
        }
    }, 1000); 
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
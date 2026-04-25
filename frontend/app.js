// ESTAT DEL JOC
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
        finishQuiz(); // Si ja tenim clan, anem al dashboard
    } else {
        loadQuestion();
    }
});

// LÒGICA DEL QUIZ (Mantinguda)
function loadQuestion() {
    const q = questions[state.currentQuestion];
    document.querySelector("h2").textContent = q.text;
    const container = document.querySelector(".grid");
    container.innerHTML = "";

    Object.entries(q.answers).forEach(([key, value]) => {
        const btn = document.createElement("button");
        btn.className = "w-full p-4 bg-slate-700 hover:bg-slate-600 rounded-2xl text-left btn-active transition-all";
        btn.innerHTML = `<span class="font-bold mr-2 text-l5">${key.toUpperCase()}</span> ${value.text}`;
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
    // Si no tenim clan guardat, el calculem
    if (!state.clan) {
        state.clan = Object.keys(state.scores).reduce((a, b) => state.scores[a] > state.scores[b] ? a : b);
        localStorage.setItem('userClan', state.clan);
    }

    document.getElementById("clan-indicator").textContent = state.clan;
    document.getElementById("score-display").textContent = state.totalPoints;
    
    // Aplicar estil de clan
    const colors = { L1: 'border-l1 text-l1', L2: 'border-l2 text-l2', L3: 'border-l3 text-l3', L4: 'border-l4 text-l4', L5: 'border-l5 text-l5', L7: 'border-l7 text-l7', L9sud: 'border-l9sud text-l9sud' };
    document.getElementById("clan-indicator").className = `w-16 h-16 rounded-full border-4 flex items-center justify-center text-2xl font-black ${colors[state.clan]}`;

    showView("view-dashboard");
}

function showView(id) {
    document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
}

// TRACKING PASSIU (Nova lògica per a la App)
function startJourney() {
    if (state.isTracking) return;
    state.isTracking = true;
    state.sessionPoints = 0;

    const btn = document.getElementById('btn-main-action');
    btn.disabled = true;
    btn.innerText = "SCANNING...";
    btn.className = "w-full py-5 rounded-2xl bg-slate-700 text-white font-bold opacity-50 cursor-not-allowed";
    
    document.getElementById('radar-ping').classList.remove('hidden');
    document.getElementById('live-data').classList.remove('opacity-20');
    document.getElementById('tracking-status').innerText = "TRACKING ACTIVE";

    runAutoDetectionLoop();
}

function runAutoDetectionLoop() {
    const stations = ["Diagonal", "Fontana", "Lesseps", "Vallcarca"];
    let stationIdx = 0;

    state.trackingInterval = setInterval(() => {
        // Simulem velocitat (En realitat vindria de Geolocation)
        let speed = 20 + Math.floor(Math.random() * 20);

        // Simulem parada final si portem més de 30 punts
        if (state.sessionPoints > 30 && Math.random() > 0.8) speed = 2;

        state.sessionPoints += 1;
        document.getElementById('big-points').innerText = state.sessionPoints;
        document.getElementById('speed-display').innerText = speed + " km/h";
        document.getElementById('current-station').innerText = speed > 5 ? stations[stationIdx % 4] : "Station / Stopped";
        if(speed > 5 && state.sessionPoints % 8 === 0) stationIdx++;

        // ALGORITME: Si la velocitat < 5 durant 4 cicles, finalitzem
        if (speed < 5) {
            state.consecutiveLowSpeed++;
        } else {
            state.consecutiveLowSpeed = 0;
        }

        if (state.consecutiveLowSpeed >= 4) {
            autoFinishJourney();
        }
    }, 1500);
}

function autoFinishJourney() {
    clearInterval(state.trackingInterval);
    state.isTracking = false;
    state.totalPoints += state.sessionPoints;
    localStorage.setItem('totalPoints', state.totalPoints);
    
    document.getElementById('score-display').innerText = state.totalPoints;
    alert(`Journey Finished! You earned ${state.sessionPoints} points.`);
    
    // Reset UI
    location.reload(); // Forma ràpida de fer el reset del botó per a la demo
}
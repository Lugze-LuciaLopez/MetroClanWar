// CONFIGURACIÓN INICIAL
const API_URL = 'http://localhost:3000'; // Cambiar por tu IP en la hackathon

const state = {
    currentView: 'view-quiz',
    clan: localStorage.getItem('userClan') || null,
    points: 0,
    currentStation: 'Buscando...',
    answers: []
};

document.addEventListener('DOMContentLoaded', () => {
    // Si ya tiene clan, saltamos directamente al dashboard
    if (state.clan) {
        showView('view-dashboard');
        applyTheme(state.clan);
    }
    
    initGeoTracking();
});

// 1. GESTIÓN DE VISTAS
function showView(viewId) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(viewId);
    target.classList.remove('hidden');
    target.classList.add('fade-in');
    state.currentView = viewId;
}

// 2. LÓGICA DEL TEST (Simulada para 5 preguntas)
function selectAnswer(option) {
    // ESTA ES LA LÍNEA QUE TE FALTA PARA VERLO EN CONSOLA
    console.log("BOTÓN PULSADO. Opción elegida:", option);
    
    state.answers.push(option);
    
    // Solo para que veas algo en la consola mientras pruebas
    console.log("Respuestas acumuladas:", state.answers);

    if (state.answers.length === 5) {
        processQuiz();
    }
}

async function processQuiz() {
    try {
        // Opción A: Procesar localmente (Más P2P)
        // Opción B: Enviar al peer local para que decida (Vuestro caso)
        const response = await fetch(`${API_URL}/api/assign-clan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: state.answers })
        });
        const data = await response.json();
        
        state.clan = data.clan;
        localStorage.setItem('userClan', data.clan);
        
        applyTheme(data.clan);
        showView('view-dashboard');
    } catch (err) {
        console.error("Error al asignar clan:", err);
    }
}

// 3. CAMBIO DINÁMICO DE COLORES (Tailwind)
function applyTheme(clan) {
    const root = document.getElementById('view-dashboard');
    const colorMap = {
        L1: 'border-l1', L2: 'border-l2', L3: 'border-l3', 
        L4: 'border-l4', L5: 'border-l5', L7: 'border-l7', L9S: 'border-l9sud'
    };
    
    // Aplicamos el color de borde o fondo según el clan
    const accentColor = colorMap[clan] || 'border-blue-500';
    document.getElementById('clan-indicator').className = `w-16 h-16 rounded-full border-4 flex items-center justify-center text-2xl font-bold ${accentColor}`;
}

// 4. GEOLOCALIZACIÓN Y PUNTOS
function initGeoTracking() {
    if (!navigator.geolocation) return;

    navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        
        // Enviar coordenadas al peer para ver si estamos en una estación
        // y calcular puntos basados en tiempo
        updatePoints(latitude, longitude);
    }, (err) => console.warn(err), {
        enableHighAccuracy: true
    });
}

async function updatePoints(lat, lon) {
    if (!state.clan) return;

    // Aquí llamaríais a vuestro peer-node que tiene el CSV de estaciones
    // Para la demo, simplemente simulamos que sumamos puntos
    state.points += 1; 
    document.getElementById('score-display').innerText = state.points.toLocaleString();
}

// 5. EVENTOS (Rush Hour / Pickpockets)
// Esto se actualizaría vía P2P cuando un Always-on Peer envíe el mensaje
function onPeerEvent(eventData) {
    const banner = document.getElementById('event-banner');
    banner.innerText = eventData.message;
    banner.classList.remove('hidden');
    
    if (eventData.type === 'PICKPOCKET') {
        banner.className = "bg-red-600 p-2 text-center text-xs font-bold";
    }
}
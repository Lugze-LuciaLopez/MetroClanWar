// Este código se ejecuta cuando el HTML termina de cargar
document.addEventListener('DOMContentLoaded', () => {
    console.log("¡Frontend conectado con éxito!");
    
    // Ejemplo de cómo podrías guardar el clan cuando el usuario haga el test
    const saveUserClan = (clanId) => {
        localStorage.setItem('myMetroClan', clanId);
        alert("Te has unido al clan: " + clanId);
    };

    // Aquí irán vuestras funciones de geolocalización y suma de puntos
});
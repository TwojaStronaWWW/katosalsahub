/**
 * Home Page Logic (Event Driven)
 */

function initHome() {
    console.log('Initializing Home Page...');
    
    // Update Year in Footer
    const rok = document.getElementById("rok");
    if(rok) rok.textContent = new Date().getFullYear();
}

document.addEventListener('page:loaded', (e) => {
    const path = e.detail.path;
    if (path === '' || path === 'index.html') {
        initHome();
    }
});

/**
 * Timba Nation Radio Service
 * Runs once, maintains state, updates UI on events.
 */

let radioInitialized = false;

function initRadioOnce() {
    console.log('RadioJS: initRadioOnce called', { radioInitialized });
    if (radioInitialized) {
        // UI Update Loop for Navigation
        // Even if initialized, DOM buttons might be new.
        if(window.updateGlobalRadioUI) window.updateGlobalRadioUI();
        return; 
    }
    
    radioInitialized = true;
    initRadio();
}

// Listeners are handled at the end of file for singleton pattern

// Audio Object Scope
const streamUrl = 'https://stream.zeno.fm/g0zpm0pypuhvv';
let radioAudio = new Audio(streamUrl);
let isPlaying = false;
let isLoading = false;

// Initialize
function initRadio() {
    // Make update function global for re-use
    window.updateGlobalRadioUI = updateGlobalUI;
    updateGlobalUI();
}
    
    // Global Click Listener (Event Delegation) - Handles dynamic elements
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#header-radio-play, #radio-play');
        if (btn) {
            console.log('RadioJS: Play button clicked', btn.id);
            e.preventDefault();
            toggleRadio();
        }
    });

    // One-time Audio Setup
    radioAudio.addEventListener('playing', () => {
        isLoading = false;
        isPlaying = true;
        updateGlobalUI();
    });

    radioAudio.addEventListener('pause', () => {
        isPlaying = false;
        updateGlobalUI();
    });

    radioAudio.addEventListener('waiting', () => {
        isLoading = true;
        updateGlobalUI();
    });

    radioAudio.addEventListener('error', (e) => {
        console.error("Radio Error:", e);
        isLoading = false;
        isPlaying = false;
        updateGlobalUI();
        // Don't alert on simple stream errors to annoying user? Or use toast?
        // alert("Nie udało się połączyć z radiem.");
    });


    function updateGlobalUI() {
        const headerPlayBtn = document.getElementById('header-radio-play');
        const sectionPlayBtn = document.getElementById('radio-play');
        const vinyl = document.querySelector('.vinyl-disc');
        const soundWaves = document.querySelectorAll('.sound-wave span');
        updateUI(headerPlayBtn, sectionPlayBtn, vinyl, soundWaves);
    }

    // Toggle Play/Pause
    function toggleRadio() {
        if (isPlaying) {
            radioAudio.pause();
        } else {
            isLoading = true;
            updateGlobalUI();
            radioAudio.play().catch(error => {
                console.error("Playback failed:", error);
                isLoading = false;
                isPlaying = false;
                updateGlobalUI();
            });
        }
    }

    // Update UI based on state
    function updateUI(headerBtn, sectionBtn, vinyl, waves) {
        // defined states
        const state = isLoading ? 'loading' : (isPlaying ? 'playing' : 'stopped');
        const sectionRadio = document.querySelector('.section-radio');

        // 0. Global State (Single Source of Truth)
        document.body.classList.toggle('radio-playing', isPlaying);

        // 1. Update Section Button
        if (sectionBtn) {
            if (state === 'loading') {
                sectionBtn.textContent = "⏳ Łączenie...";
                sectionBtn.classList.add('loading');
            } else if (state === 'playing') {
                sectionBtn.textContent = "⏹ Wyłącz radio";
                sectionBtn.classList.add('playing');
                sectionBtn.classList.remove('loading');
            } else {
                sectionBtn.textContent = "▶ Włącz radio";
                sectionBtn.classList.remove('playing', 'loading');
            }
        }

        // 2. Update Header Button
        if (headerBtn) {
             // Reset classes
            headerBtn.classList.remove('playing', 'loading');
            headerBtn.innerHTML = ''; // Clear icon

            if (state === 'loading') {
                headerBtn.classList.add('loading');
                // Spinner (FontAwesome)
                headerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            } else if (state === 'playing') {
                headerBtn.classList.add('playing');
                // Stop (FontAwesome)
                headerBtn.innerHTML = '<i class="fas fa-stop"></i>';
            } else {
                // Play (FontAwesome)
                headerBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
            headerBtn.title = state === 'playing' ? "Zatrzymaj radio" : "Włącz radio";
        }

        // 3. Update Animations via CSS Context
        // NOW HANDLED BY global .radio-playing class on body
        // Legacy support if needed, but cleaner to remove if CSS is updated
        if (sectionRadio) {
            if (state === 'playing') {
                sectionRadio.classList.add('playing');
            } else {
                sectionRadio.classList.remove('playing');
            }
        }
    }

    // Expose for debugging if needed
    window.initRadio = initRadioOnce;

    // Run initially (Singleton Pattern)
    if(document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRadioOnce);
    } else {
        initRadioOnce();
    }
    
    // UI Update on Navigation (Radio persists, UI changes)
    document.addEventListener('page:loaded', () => {
        if (radioInitialized && window.updateGlobalRadioUI) {
            window.updateGlobalRadioUI();
        }
    });

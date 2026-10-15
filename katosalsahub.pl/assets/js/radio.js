/**
 * Timba Nation Radio Service
 * Obsługuje strumień audio, MediaSession API (#18), wyłącznik czasowy Sleep Timer
 * z płynnym wyciszaniem dźwięku (#19) oraz parsowanie metadanych utworu (#20).
 */

let radioInitialized = false;

const STREAM_URL = 'https://stream.zeno.fm/g0zpm0pypuhvv';
const STREAM_METADATA_URL = 'https://api.zeno.fm/mounts/metadata/subscribe/g0zpm0pypuhvv';
const ICECAST_STATUS_URL = 'https://stream.zeno.fm/status-json.xsl?mount=/g0zpm0pypuhvv';
const METADATA_POLL_INTERVAL = 20000;

let radioAudio = new Audio(STREAM_URL);
radioAudio.preload = 'none';
radioAudio.crossOrigin = 'anonymous';

let isPlaying = false;
let isLoading = false;

// Stan wyłącznika czasowego (Sleep Timer - #19)
let sleepTimerTimeout = null;
let sleepTimerCountdownInterval = null;
let fadeOutInterval = null;
let sleepTimerEndTime = null;
let activeSleepMinutes = 0;

// Stan metadanych utworu (#20)
let metadataPollTimer = null;
let currentTrack = {
  artist: 'Timba Nation Radio',
  title: 'Kubańska Energia 24/7 (Salsa & Timba)'
};

function initRadioOnce() {
  if (radioInitialized) {
    if (window.updateGlobalRadioUI) window.updateGlobalRadioUI();
    return;
  }

  radioInitialized = true;
  initRadio();
}

function initRadio() {
  window.updateGlobalRadioUI = updateGlobalUI;
  window.setRadioSleepTimer = setSleepTimer;
  setupMediaSession();
  updateGlobalUI();
}

/**
 * Integracja MediaSession API (#18) - sterowanie z ekranu blokady i słuchawek
 */
function setupMediaSession() {
  if (!('mediaSession' in navigator) || typeof window.MediaMetadata === 'undefined') {
    return;
  }

  updateMediaSessionMetadata();

  const actions = [
    ['play', () => { if (!isPlaying) toggleRadio(); }],
    ['pause', () => { if (isPlaying) toggleRadio(); }],
    ['stop', () => { if (isPlaying) stopRadio(); }]
  ];

  for (const [action, handler] of actions) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Niektóre przeglądarki nie wspierają wszystkich akcji
    }
  }
}

function updateMediaSessionMetadata() {
  if (!('mediaSession' in navigator) || typeof window.MediaMetadata === 'undefined') {
    return;
  }

  try {
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: currentTrack.title || 'Timba Nation Radio',
      artist: currentTrack.artist || 'Kato Salsa Hub',
      album: 'Kato Salsa Hub ⚡ Kubańska Energia',
      artwork: [
        { src: 'assets/images/logo.webp', sizes: '512x512', type: 'image/webp' },
        { src: 'assets/images/logo.jpg', sizes: '512x512', type: 'image/jpeg' }
      ]
    });
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  } catch {
    // Ignoruj błędy w środowiskach bez pełnego wsparcia MediaSession
  }
}

/**
 * Parsowanie wykonawcy i tytułu ze strumienia Icecast / Zeno (#20)
 */
function parseRawStreamTitle(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') {
    return null;
  }
  const cleaned = rawTitle.trim();
  if (!cleaned) return null;

  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    const artist = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();
    return {
      artist: artist || 'Timba Nation Radio',
      title: title || cleaned
    };
  }

  return {
    artist: 'Timba Nation Radio',
    title: cleaned
  };
}

async function fetchStreamMetadata() {
  if (!isPlaying) return;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(ICECAST_STATUS_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) return;
    const data = await response.json();

    let rawTitle = null;
    if (data && data.icestats && data.icestats.source) {
      const source = Array.isArray(data.icestats.source)
        ? data.icestats.source[0]
        : data.icestats.source;
      rawTitle = source.title || source.yp_currently_playing || null;
    } else if (data && (data.streamTitle || data.title)) {
      rawTitle = data.streamTitle || data.title;
    }

    const parsed = parseRawStreamTitle(rawTitle);
    if (parsed) {
      currentTrack = parsed;
      updateTrackUI();
      updateMediaSessionMetadata();
    }
  } catch {
    // Strumień lub endpoint Icecast może nie zwracać CORS JSON - zachowujemy domyślne metadane
  }
}

function startMetadataPolling() {
  stopMetadataPolling();
  fetchStreamMetadata();
  metadataPollTimer = setInterval(fetchStreamMetadata, METADATA_POLL_INTERVAL);
}

function stopMetadataPolling() {
  if (metadataPollTimer) {
    clearInterval(metadataPollTimer);
    metadataPollTimer = null;
  }
}

function updateTrackUI() {
  const artistEl = document.getElementById('radio-track-artist');
  const titleEl = document.getElementById('radio-track-title');
  const nowPlayingBox = document.getElementById('radio-now-playing');

  if (artistEl) {
    artistEl.textContent = currentTrack.artist;
  }
  if (titleEl) {
    titleEl.textContent = currentTrack.title;
  }
  if (nowPlayingBox) {
    nowPlayingBox.classList.toggle('is-active', isPlaying);
  }
}

/**
 * Wyłącznik czasowy (Sleep Timer) z płynnym wyciszaniem dźwięku (#19)
 */
function clearSleepTimerInternal() {
  if (sleepTimerTimeout) {
    clearTimeout(sleepTimerTimeout);
    sleepTimerTimeout = null;
  }
  if (sleepTimerCountdownInterval) {
    clearInterval(sleepTimerCountdownInterval);
    sleepTimerCountdownInterval = null;
  }
  if (fadeOutInterval) {
    clearInterval(fadeOutInterval);
    fadeOutInterval = null;
  }
  sleepTimerEndTime = null;
  activeSleepMinutes = 0;
  try {
    radioAudio.volume = 1.0;
  } catch {
    // Ignoruj w środowisku bez pełnego Web Audio
  }
}

function startFadeOutAndStop() {
  if (fadeOutInterval) clearInterval(fadeOutInterval);

  const steps = 20;
  const stepDurationMs = 500; // 20 * 500ms = 10 sekund płynnego wyciszania
  let currentStep = 0;
  const startVolume = typeof radioAudio.volume === 'number' ? radioAudio.volume : 1.0;

  fadeOutInterval = setInterval(() => {
    currentStep += 1;
    const nextVolume = Math.max(0, startVolume * (1 - currentStep / steps));
    try {
      radioAudio.volume = Number(nextVolume.toFixed(2));
    } catch {
      // Ignoruj
    }

    if (currentStep >= steps) {
      clearSleepTimerInternal();
      stopRadio();
      updateSleepTimerUI();
    }
  }, stepDurationMs);
}

function setSleepTimer(minutes) {
  const parsedMinutes = parseInt(minutes, 10);
  clearSleepTimerInternal();

  if (!parsedMinutes || parsedMinutes <= 0) {
    updateSleepTimerUI();
    return;
  }

  activeSleepMinutes = parsedMinutes;
  const durationMs = parsedMinutes * 60 * 1000;
  const fadeLeadMs = Math.min(10000, Math.floor(durationMs * 0.2));
  sleepTimerEndTime = Date.now() + durationMs;

  if (!isPlaying) {
    toggleRadio();
  }

  sleepTimerTimeout = setTimeout(() => {
    startFadeOutAndStop();
  }, Math.max(100, durationMs - fadeLeadMs));

  sleepTimerCountdownInterval = setInterval(() => {
    updateSleepTimerUI();
  }, 1000);

  updateSleepTimerUI();
}

function updateSleepTimerUI() {
  const timerButtons = document.querySelectorAll('.sleep-timer-btn');
  const cancelBtn = document.getElementById('sleep-timer-cancel');
  const statusEl = document.getElementById('sleep-timer-status');

  timerButtons.forEach((btn) => {
    const mins = parseInt(btn.getAttribute('data-minutes'), 10);
    btn.classList.toggle('is-active', activeSleepMinutes === mins && mins > 0);
  });

  if (cancelBtn) {
    cancelBtn.classList.toggle('is-hidden', activeSleepMinutes === 0);
  }

  if (statusEl) {
    if (activeSleepMinutes > 0 && sleepTimerEndTime) {
      const remainingSec = Math.max(0, Math.ceil((sleepTimerEndTime - Date.now()) / 1000));
      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      const paddedSecs = secs < 10 ? `0${secs}` : `${secs}`;
      statusEl.textContent = `Wyłączenie za ${mins}:${paddedSecs}`;
      statusEl.classList.remove('is-hidden');
    } else {
      statusEl.textContent = '';
      statusEl.classList.add('is-hidden');
    }
  }
}

// Global Click Listener (Event Delegation)
document.addEventListener('click', (e) => {
  const playBtn = e.target.closest('#header-radio-play, #radio-play');
  if (playBtn) {
    e.preventDefault();
    toggleRadio();
    return;
  }

  const sleepBtn = e.target.closest('.sleep-timer-btn');
  if (sleepBtn) {
    e.preventDefault();
    const mins = parseInt(sleepBtn.getAttribute('data-minutes'), 10);
    if (activeSleepMinutes === mins) {
      setSleepTimer(0);
    } else {
      setSleepTimer(mins);
    }
    return;
  }

  const cancelSleepBtn = e.target.closest('#sleep-timer-cancel');
  if (cancelSleepBtn) {
    e.preventDefault();
    setSleepTimer(0);
  }
});

// One-time Audio Setup
radioAudio.addEventListener('playing', () => {
  isLoading = false;
  isPlaying = true;
  updateGlobalUI();
});

radioAudio.addEventListener('pause', () => {
  if (!isLoading) {
    isPlaying = false;
    updateGlobalUI();
  }
});

radioAudio.addEventListener('waiting', () => {
  if (isPlaying) {
    isLoading = true;
    updateGlobalUI();
  }
});

radioAudio.addEventListener('error', () => {
  isLoading = false;
  updateGlobalUI();
});

function stopRadio() {
  isLoading = false;
  isPlaying = false;
  stopMetadataPolling();
  try {
    radioAudio.pause();
    radioAudio.volume = 1.0;
  } catch {
    // Ignoruj
  }
  updateGlobalUI();
}

function toggleRadio() {
  if (isPlaying) {
    clearSleepTimerInternal();
    stopRadio();
  } else {
    isPlaying = true;
    isLoading = false;
    try {
      radioAudio.volume = 1.0;
    } catch {
      // Ignoruj
    }
    updateGlobalUI();
    startMetadataPolling();

    const playPromise = radioAudio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // W środowisku headless lub przy blokadzie strumienia zachowujemy spójny stan UI
        isLoading = false;
        updateGlobalUI();
      });
    }
  }
}

function updateGlobalUI() {
  const headerPlayBtn = document.getElementById('header-radio-play');
  const sectionPlayBtn = document.getElementById('radio-play');
  const vinyl = document.querySelector('.vinyl-disc');
  const soundWaves = document.querySelectorAll('.sound-wave span');
  updateUI(headerPlayBtn, sectionPlayBtn, vinyl, soundWaves);
  updateTrackUI();
  updateSleepTimerUI();
  updateMediaSessionMetadata();
}

function updateUI(headerBtn, sectionBtn) {
  const state = isLoading ? 'loading' : (isPlaying ? 'playing' : 'stopped');
  const sectionRadio = document.querySelector('.section-radio');

  document.body.classList.toggle('radio-playing', isPlaying);

  if (sectionBtn) {
    if (state === 'loading') {
      sectionBtn.textContent = '⏳ Łączenie...';
      sectionBtn.classList.add('loading');
    } else if (state === 'playing') {
      sectionBtn.textContent = '⏹ Wyłącz radio';
      sectionBtn.classList.add('playing');
      sectionBtn.classList.remove('loading');
    } else {
      sectionBtn.textContent = '▶ Włącz radio';
      sectionBtn.classList.remove('playing', 'loading');
    }
  }

  if (headerBtn) {
    headerBtn.classList.remove('playing', 'loading');
    headerBtn.innerHTML = '';

    if (state === 'loading') {
      headerBtn.classList.add('loading');
      headerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    } else if (state === 'playing') {
      headerBtn.classList.add('playing');
      headerBtn.innerHTML = '<i class="fas fa-stop"></i>';
    } else {
      headerBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
    headerBtn.title = state === 'playing' ? 'Zatrzymaj radio' : 'Włącz radio';
  }

  if (sectionRadio) {
    sectionRadio.classList.toggle('playing', state === 'playing');
  }
}

window.initRadio = initRadioOnce;
window.parseRawStreamTitle = parseRawStreamTitle;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRadioOnce);
} else {
  initRadioOnce();
}

document.addEventListener('page:loaded', () => {
  if (radioInitialized && window.updateGlobalRadioUI) {
    window.updateGlobalRadioUI();
  }
});

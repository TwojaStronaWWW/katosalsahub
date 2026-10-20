/**
 * Timba Nation Radio Service (Modular & Encapsulated v4.5)
 * Architektura Zero-Bloat Vanilla JS w izolowanym domknięciu IIFE:
 * 1. Konfiguracja i scentralizowany stan odtwarzacza (RadioState)
 * 2. Silnik strumienia Audio & Intent Pre-Warming (warmUpStream, toggleRadio, stopRadio)
 * 3. Silnik metadanych Zeno SSE z automatycznym fallbackiem Icecast JSON (#20)
 * 4. Wyłącznik czasowy Sleep Timer z płynnym wyciszaniem dźwięku Fade-Out (#19)
 * 5. Warstwa prezentacji DOM (CLS = 0) oraz integracja MediaSession API (#18)
 */

(function () {
  'use strict';

  // ============================================================================
  // 1. KONFIGURACJA I SCENTRALIZOWANY STAN ODTWARZACZA
  // ============================================================================

  const RADIO_CONFIG = {
    streamUrl: 'https://stream.zeno.fm/g0zpm0pypuhvv',
    metadataSseUrl: 'https://api.zeno.fm/mounts/metadata/subscribe/g0zpm0pypuhvv',
    icecastStatusUrl: 'https://stream.zeno.fm/status-json.xsl?mount=/g0zpm0pypuhvv',
    metadataPollIntervalMs: 20000,
    streamWarmTtlMs: 25000,
    streamWarmIdleTimeoutMs: 15000,
    fadeSteps: 20,
    fadeStepDurationMs: 500
  };

  const RADIO_DEFAULT_TRACK_TITLES = new Set([
    'Kubańska Energia 24/7 (Salsa & Timba)',
    'Energía Cubana 24/7 (Salsa y Timba)',
    'Energía Cubana 24/7 (Salsa & Timba)',
    'Cuban Energy 24/7 (Salsa & Timba)'
  ]);

  const radioAudio = typeof Audio !== 'undefined' ? new Audio() : {
    preload: 'none',
    volume: 1.0,
    muted: false,
    defaultMuted: false,
    src: '',
    load() {},
    play() { return Promise.resolve(); },
    pause() {},
    removeAttribute() {},
    setAttribute() {},
    addEventListener() {}
  };
  radioAudio.preload = 'none';
  radioAudio.muted = false;
  radioAudio.defaultMuted = false;
  radioAudio.volume = 1.0;
  try {
    radioAudio.playsInline = true;
    if (typeof radioAudio.setAttribute === 'function') {
      radioAudio.setAttribute('playsinline', '');
      radioAudio.setAttribute('webkit-playsinline', '');
    }
  } catch {
    // Ignoruj w środowiskach bez pełnego DOM
  }

  function ensureAudioElementMounted() {
    try {
      if (
        typeof document !== 'undefined' &&
        document.body &&
        typeof document.body.appendChild === 'function' &&
        typeof Element !== 'undefined' &&
        radioAudio instanceof Element &&
        !radioAudio.parentElement
      ) {
        radioAudio.id = 'ksh-radio-audio';
        radioAudio.className = 'is-hidden';
        document.body.appendChild(radioAudio);
      }
    } catch {
      // Ignoruj w środowiskach testowych MockDOM
    }
  }

  const RadioState = {
    initialized: false,
    userRequestedPlay: false,
    isPlaying: false,
    isLoading: false,
    isStreamWarm: false,
    lastWarmUpTime: 0,
    warmUpExpireTimer: null,
    reconnectTimer: null,
    reconnectAttempts: 0,
    sleepTimerTimeout: null,
    sleepTimerCountdownInterval: null,
    fadeOutInterval: null,
    sleepTimerEndTime: null,
    activeSleepMinutes: 0,
    metadataPollTimer: null,
    metadataInitialTimeout: null,
    currentTrack: {
      artist: 'Timba Nation Radio',
      title: 'Kubańska Energia 24/7 (Salsa & Timba)'
    }
  };

  function rt(key, fallback) {
    if (typeof window !== 'undefined' && window.kshI18n && typeof window.kshI18n.t === 'function') {
      return window.kshI18n.t(key) || fallback;
    }
    return fallback;
  }

  // ============================================================================
  // 2. SILNIK STRUMIENIA AUDIO & INTENT PRE-WARMING
  // ============================================================================

  function clearWarmUpExpireTimer() {
    if (RadioState.warmUpExpireTimer) {
      clearTimeout(RadioState.warmUpExpireTimer);
      RadioState.warmUpExpireTimer = null;
    }
  }

  function clearReconnectTimer() {
    if (RadioState.reconnectTimer) {
      clearTimeout(RadioState.reconnectTimer);
      RadioState.reconnectTimer = null;
    }
  }

  function buildFreshStreamUrl() {
    const sep = RADIO_CONFIG.streamUrl.includes('?') ? '&' : '?';
    return `${RADIO_CONFIG.streamUrl}${sep}_t=${Date.now()}`;
  }

  /**
   * Bezpieczny pre-warming DNS/TLS dla Zeno.fm bez otwierania i zamrażania gniazda
   * strumienia MP3 przed kliknięciem użytkownika (ochrona przed wygaśnięciem tokenu 302 JWT).
   */
  function warmUpStream(force = false) {
    if (RadioState.isPlaying) return;

    const now = Date.now();
    if (!force && RadioState.isStreamWarm && now - RadioState.lastWarmUpTime < RADIO_CONFIG.streamWarmTtlMs) {
      return;
    }

    clearWarmUpExpireTimer();
    RadioState.isStreamWarm = true;
    RadioState.lastWarmUpTime = now;

    try {
      if (typeof document !== 'undefined' && document.head && typeof document.createElement === 'function') {
        if (!document.getElementById('ksh-zeno-preconnect')) {
          const link = document.createElement('link');
          link.id = 'ksh-zeno-preconnect';
          link.rel = 'preconnect';
          link.href = 'https://stream.zeno.fm';
          document.head.appendChild(link);
        }
      }
    } catch {
      // Ignoruj w środowiskach bez pełnego DOM
    }

    RadioState.warmUpExpireTimer = setTimeout(() => {
      RadioState.warmUpExpireTimer = null;
      if (!RadioState.isPlaying && !RadioState.isLoading) {
        RadioState.isStreamWarm = false;
      }
    }, RADIO_CONFIG.streamWarmIdleTimeoutMs);
  }

  function stopRadio() {
    clearWarmUpExpireTimer();
    clearReconnectTimer();
    RadioState.userRequestedPlay = false;
    RadioState.isLoading = false;
    RadioState.isPlaying = false;
    RadioState.isStreamWarm = false;
    RadioState.reconnectAttempts = 0;
    stopMetadataPolling();
    try {
      radioAudio.pause();
      if (typeof radioAudio.removeAttribute === 'function') {
        radioAudio.removeAttribute('src');
      } else {
        radioAudio.src = '';
      }
      if (typeof radioAudio.load === 'function') {
        radioAudio.load();
      }
      radioAudio.volume = 1.0;
    } catch {
      // Ignoruj
    }
    updateGlobalUI();
  }

  function scheduleStreamReconnect() {
    clearReconnectTimer();
    if (!RadioState.userRequestedPlay) {
      return;
    }
    if (RadioState.reconnectAttempts >= 2) {
      RadioState.userRequestedPlay = false;
      RadioState.isPlaying = false;
      RadioState.isLoading = false;
      stopMetadataPolling();
      updateGlobalUI();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      RadioState.isLoading = false;
      updateGlobalUI();
      return;
    }
    RadioState.reconnectAttempts += 1;
    RadioState.isLoading = true;
    updateGlobalUI();
    RadioState.reconnectTimer = setTimeout(() => {
      RadioState.reconnectTimer = null;
      if (!RadioState.userRequestedPlay) return;
      try {
        radioAudio.muted = false;
        radioAudio.volume = 1.0;
        radioAudio.src = buildFreshStreamUrl();
        const p = radioAudio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            if (RadioState.reconnectAttempts >= 2) {
              RadioState.userRequestedPlay = false;
              RadioState.isPlaying = false;
              RadioState.isLoading = false;
              stopMetadataPolling();
            }
            updateGlobalUI();
          });
        }
      } catch {
        RadioState.isLoading = false;
        updateGlobalUI();
      }
    }, 1500);
  }

  function toggleRadio() {
    if (RadioState.isPlaying) {
      clearSleepTimerInternal();
      stopRadio();
      return;
    }

    clearWarmUpExpireTimer();
    clearReconnectTimer();
    ensureAudioElementMounted();

    RadioState.userRequestedPlay = true;
    RadioState.isPlaying = true;
    RadioState.isLoading = true;
    RadioState.reconnectAttempts = 0;

    const now = Date.now();
    RadioState.isStreamWarm = true;
    RadioState.lastWarmUpTime = now;

    try {
      radioAudio.muted = false;
      radioAudio.defaultMuted = false;
      radioAudio.volume = 1.0;
      radioAudio.preload = 'auto';
      radioAudio.src = RADIO_CONFIG.streamUrl;
    } catch {
      // Ignoruj
    }

    try {
      const playPromise = radioAudio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            if (RadioState.userRequestedPlay) {
              RadioState.isLoading = false;
              RadioState.isPlaying = true;
              RadioState.reconnectAttempts = 0;
              updateGlobalUI();
            }
          })
          .catch((err) => {
            if (!RadioState.userRequestedPlay) return;
            if (err && err.name === 'NotAllowedError') {
              RadioState.userRequestedPlay = false;
              RadioState.isPlaying = false;
              RadioState.isLoading = false;
              stopMetadataPolling();
              updateGlobalUI();
              return;
            }
            scheduleStreamReconnect();
          });
      } else {
        RadioState.isLoading = false;
      }
    } catch {
      RadioState.isLoading = false;
    }

    updateGlobalUI();
    startMetadataPolling();
  }

  // ============================================================================
  // 3. SILNIK METADANYCH ICECAST / ZENO SSE + FALLBACK JSON (#20)
  // ============================================================================

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

  function extractRawTitleFromPayload(data) {
    if (!data) return null;
    if (data.icestats && data.icestats.source) {
      const source = Array.isArray(data.icestats.source)
        ? data.icestats.source[0]
        : data.icestats.source;
      return (source && (source.title || source.yp_currently_playing)) || null;
    }
    if (data.streamTitle || data.title) {
      return data.streamTitle || data.title;
    }
    return null;
  }

  async function fetchSingleMetadataEndpoint(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'text/event-stream, application/json' },
        signal: controller.signal
      });
      if (!response || !response.ok) return null;

      const contentType =
        response.headers && typeof response.headers.get === 'function'
          ? response.headers.get('content-type') || ''
          : '';

      if (
        contentType.includes('text/event-stream') &&
        response.body &&
        typeof response.body.getReader === 'function'
      ) {
        const reader = response.body.getReader();
        const { value } = await reader.read();
        controller.abort();
        if (!value) return null;
        const chunkText = new TextDecoder().decode(value);
        const dataLine = chunkText
          .split(/\r?\n/)
          .find((line) => line.startsWith('data:'));
        return dataLine ? JSON.parse(dataLine.slice(5).trim()) : null;
      }

      if (typeof response.json === 'function') {
        return await response.json();
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function fetchStreamMetadata() {
    if (!RadioState.isPlaying || typeof fetch !== 'function') return;

    try {
      let data = await fetchSingleMetadataEndpoint(RADIO_CONFIG.metadataSseUrl);
      if (!data) {
        data = await fetchSingleMetadataEndpoint(RADIO_CONFIG.icecastStatusUrl);
      }
      const parsed = parseRawStreamTitle(extractRawTitleFromPayload(data));
      if (parsed) {
        RadioState.currentTrack = parsed;
        updateTrackUI();
        updateMediaSessionMetadata();
      }
    } catch {
      // Strumień lub endpoint metadanych może być chwilowo niedostępny - zachowujemy domyślne metadane
    }
  }

  function startMetadataPolling() {
    stopMetadataPolling();
    RadioState.metadataInitialTimeout = setTimeout(() => {
      RadioState.metadataInitialTimeout = null;
      fetchStreamMetadata();
    }, 300);
    RadioState.metadataPollTimer = setInterval(fetchStreamMetadata, RADIO_CONFIG.metadataPollIntervalMs);
  }

  function stopMetadataPolling() {
    if (RadioState.metadataInitialTimeout) {
      clearTimeout(RadioState.metadataInitialTimeout);
      RadioState.metadataInitialTimeout = null;
    }
    if (RadioState.metadataPollTimer) {
      clearInterval(RadioState.metadataPollTimer);
      RadioState.metadataPollTimer = null;
    }
  }

  // ============================================================================
  // 4. WYŁĄCZNIK CZASOWY (SLEEP TIMER & SMOOTH FADE-OUT — #19)
  // ============================================================================

  function clearSleepTimerInternal() {
    if (RadioState.sleepTimerTimeout) {
      clearTimeout(RadioState.sleepTimerTimeout);
      RadioState.sleepTimerTimeout = null;
    }
    if (RadioState.sleepTimerCountdownInterval) {
      clearInterval(RadioState.sleepTimerCountdownInterval);
      RadioState.sleepTimerCountdownInterval = null;
    }
    if (RadioState.fadeOutInterval) {
      clearInterval(RadioState.fadeOutInterval);
      RadioState.fadeOutInterval = null;
    }
    RadioState.sleepTimerEndTime = null;
    RadioState.activeSleepMinutes = 0;
    try {
      radioAudio.volume = 1.0;
    } catch {
      // Ignoruj w środowisku bez pełnego Web Audio
    }
  }

  function startFadeOutAndStop() {
    if (RadioState.fadeOutInterval) clearInterval(RadioState.fadeOutInterval);

    const steps = RADIO_CONFIG.fadeSteps;
    let currentStep = 0;
    const startVolume = typeof radioAudio.volume === 'number' ? radioAudio.volume : 1.0;

    RadioState.fadeOutInterval = setInterval(() => {
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
    }, RADIO_CONFIG.fadeStepDurationMs);
  }

  function setSleepTimer(minutes) {
    const parsedMinutes = parseInt(minutes, 10);
    clearSleepTimerInternal();

    if (!parsedMinutes || parsedMinutes <= 0) {
      updateSleepTimerUI();
      return;
    }

    RadioState.activeSleepMinutes = parsedMinutes;
    const durationMs = parsedMinutes * 60 * 1000;
    const fadeLeadMs = Math.min(10000, Math.floor(durationMs * 0.2));
    RadioState.sleepTimerEndTime = Date.now() + durationMs;

    if (!RadioState.isPlaying) {
      toggleRadio();
    }

    RadioState.sleepTimerTimeout = setTimeout(() => {
      startFadeOutAndStop();
    }, Math.max(100, durationMs - fadeLeadMs));

    RadioState.sleepTimerCountdownInterval = setInterval(() => {
      updateSleepTimerUI();
    }, 1000);

    updateSleepTimerUI();
  }

  // ============================================================================
  // 5. WARSTWA PREZENTACJI DOM (CLS = 0) & MEDIASESSION API (#18)
  // ============================================================================

  function setupMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof window === 'undefined' || typeof window.MediaMetadata === 'undefined') {
      return;
    }

    updateMediaSessionMetadata();

    const actions = [
      ['play', () => { if (!RadioState.isPlaying) toggleRadio(); }],
      ['pause', () => { if (RadioState.isPlaying) toggleRadio(); }],
      ['stop', () => { if (RadioState.isPlaying) stopRadio(); }]
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
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof window === 'undefined' || typeof window.MediaMetadata === 'undefined') {
      return;
    }

    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: RadioState.currentTrack.title || 'Timba Nation Radio',
        artist: RadioState.currentTrack.artist || 'Kato Salsa Hub',
        album: 'Kato Salsa Hub ⚡ Kubańska Energia',
        artwork: [
          { src: 'assets/images/logo.webp', sizes: '512x512', type: 'image/webp' },
          { src: 'assets/images/logo.jpg', sizes: '512x512', type: 'image/jpeg' }
        ]
      });
      navigator.mediaSession.playbackState = RadioState.isPlaying ? 'playing' : 'paused';
    } catch {
      // Ignoruj błędy w środowiskach bez pełnego wsparcia MediaSession
    }
  }

  function updateTrackUI() {
    if (typeof document === 'undefined') return;
    const artistEl = document.getElementById('radio-track-artist');
    const titleEl = document.getElementById('radio-track-title');
    const nowPlayingBox = document.getElementById('radio-now-playing');

    if (artistEl) {
      artistEl.textContent = RadioState.currentTrack.artist;
    }
    if (titleEl) {
      if (RADIO_DEFAULT_TRACK_TITLES.has(RadioState.currentTrack.title)) {
        titleEl.textContent = rt('radio.defaultTrack', RadioState.currentTrack.title);
      } else {
        titleEl.textContent = RadioState.currentTrack.title;
      }
    }
    if (nowPlayingBox) {
      nowPlayingBox.classList.toggle('is-active', RadioState.isPlaying);
    }
  }

  function updateSleepTimerUI() {
    if (typeof document === 'undefined') return;
    const timerButtons = document.querySelectorAll('.sleep-timer-btn');
    const cancelBtn = document.getElementById('sleep-timer-cancel');
    const statusEl = document.getElementById('sleep-timer-status');

    timerButtons.forEach((btn) => {
      const mins = parseInt(btn.getAttribute('data-minutes'), 10);
      btn.classList.toggle('is-active', RadioState.activeSleepMinutes === mins && mins > 0);
    });

    if (cancelBtn) {
      cancelBtn.classList.toggle('is-hidden', RadioState.activeSleepMinutes === 0);
    }

    if (statusEl) {
      if (RadioState.activeSleepMinutes > 0 && RadioState.sleepTimerEndTime) {
        const remainingSec = Math.max(0, Math.ceil((RadioState.sleepTimerEndTime - Date.now()) / 1000));
        const mins = Math.floor(remainingSec / 60);
        const secs = remainingSec % 60;
        const paddedSecs = secs < 10 ? `0${secs}` : `${secs}`;
        statusEl.textContent = `⏱ ${mins}:${paddedSecs}`;
        statusEl.title = `${rt('radio.sleepTooltipPrefix', 'Wyłączenie radia za')} ${mins}:${paddedSecs}`;
        statusEl.classList.remove('is-hidden');
      } else {
        statusEl.textContent = '⏱ 00:00';
        statusEl.removeAttribute('title');
        statusEl.classList.add('is-hidden');
      }
    }
  }

  function updateUI(headerBtn, sectionBtn) {
    if (typeof document === 'undefined') return;
    const state = RadioState.isLoading ? 'loading' : (RadioState.isPlaying ? 'playing' : 'stopped');
    const sectionRadio = document.querySelector('.section-radio');

    if (document.body) {
      document.body.classList.toggle('radio-playing', RadioState.isPlaying);
    }

    if (sectionBtn) {
      if (state === 'loading') {
        sectionBtn.textContent = rt('radio.loadingBtn', '⏳ Łączenie...');
        sectionBtn.classList.add('loading');
      } else if (state === 'playing') {
        sectionBtn.textContent = rt('radio.stopBtn', '⏹ Wyłącz radio');
        sectionBtn.classList.add('playing');
        sectionBtn.classList.remove('loading');
      } else {
        sectionBtn.textContent = rt('radio.playBtn', '▶ Włącz radio');
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
      const label = state === 'playing'
        ? rt('nav.radioStopAria', 'Zatrzymaj radio')
        : rt('nav.radioAria', 'Włącz radio');
      headerBtn.title = label;
      headerBtn.setAttribute('aria-label', label);
    }

    if (sectionRadio) {
      sectionRadio.classList.toggle('playing', state === 'playing');
    }
  }

  function updateGlobalUI() {
    if (typeof document === 'undefined') return;
    const headerPlayBtn = document.getElementById('header-radio-play');
    const sectionPlayBtn = document.getElementById('radio-play');
    updateUI(headerPlayBtn, sectionPlayBtn);
    updateTrackUI();
    updateSleepTimerUI();
    updateMediaSessionMetadata();
  }

  // ============================================================================
  // 6. ZDARZENIA GLOBALNE I INICJALIZACJA
  // ============================================================================

  function handleRadioIntentWarmUp(e) {
    if (RadioState.isPlaying || !e || !e.target || typeof e.target.closest !== 'function') return;
    const radioTrigger = e.target.closest(
      '#header-radio-play, #radio-play, .sleep-timer-btn, .section-radio, a[href*="#radio"]'
    );
    if (radioTrigger) {
      warmUpStream();
    }
  }

  radioAudio.addEventListener('playing', () => {
    RadioState.isLoading = false;
    if (RadioState.userRequestedPlay) {
      RadioState.isPlaying = true;
      RadioState.reconnectAttempts = 0;
    }
    updateGlobalUI();
  });

  radioAudio.addEventListener('canplay', () => {
    if (RadioState.isLoading) {
      RadioState.isLoading = false;
      updateGlobalUI();
    }
  });

  radioAudio.addEventListener('timeupdate', () => {
    if (RadioState.isLoading && radioAudio.currentTime > 0) {
      RadioState.isLoading = false;
      updateGlobalUI();
    }
  });

  radioAudio.addEventListener('pause', () => {
    if (!RadioState.userRequestedPlay && !RadioState.isLoading) {
      RadioState.isPlaying = false;
      updateGlobalUI();
    }
  });

  radioAudio.addEventListener('error', () => {
    RadioState.isStreamWarm = false;
    if (RadioState.userRequestedPlay) {
      scheduleStreamReconnect();
    } else {
      RadioState.isLoading = false;
      updateGlobalUI();
    }
  });

  function initRadio() {
    ensureAudioElementMounted();
    if (typeof window !== 'undefined') {
      window.updateGlobalRadioUI = updateGlobalUI;
      window.setRadioSleepTimer = setSleepTimer;
      window.warmUpRadioStream = warmUpStream;
    }
    setupMediaSession();
    updateGlobalUI();
    warmUpStream();
  }

  function initRadioOnce() {
    if (RadioState.initialized) {
      updateGlobalUI();
      return;
    }
    RadioState.initialized = true;
    initRadio();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('mouseover', handleRadioIntentWarmUp, { passive: true });
    document.addEventListener('touchstart', handleRadioIntentWarmUp, { passive: true });
    document.addEventListener('focusin', handleRadioIntentWarmUp, { passive: true });

    document.addEventListener('click', (e) => {
      if (!e || !e.target || typeof e.target.closest !== 'function') return;

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
        setSleepTimer(RadioState.activeSleepMinutes === mins ? 0 : mins);
        return;
      }

      const cancelSleepBtn = e.target.closest('#sleep-timer-cancel');
      if (cancelSleepBtn) {
        e.preventDefault();
        setSleepTimer(0);
      }
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initRadioOnce);
    } else {
      initRadioOnce();
    }

    document.addEventListener('page:loaded', () => {
      if (RadioState.initialized) {
        updateGlobalUI();
      }
    });
  }

  if (typeof window !== 'undefined') {
    window.initRadio = initRadioOnce;
    window.warmUpRadioStream = warmUpStream;
    window.parseRawStreamTitle = parseRawStreamTitle;
    window.kshRadio = {
      init: initRadioOnce,
      toggle: toggleRadio,
      stop: stopRadio,
      warmUp: warmUpStream,
      setSleepTimer,
      updateUI: updateGlobalUI,
      parseRawStreamTitle,
      getState: () => ({ ...RadioState })
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      initRadio: initRadioOnce,
      toggleRadio,
      stopRadio,
      warmUpStream,
      setSleepTimer,
      parseRawStreamTitle,
      updateGlobalUI
    };
  }
})();

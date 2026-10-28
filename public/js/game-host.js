(() => {
  'use strict';
  const scriptUrl = new URL(document.currentScript.src);
  const testBuild = scriptUrl.searchParams.get('test') === '1';
  // The canonical game identity comes from the pathname, never from the query string.
  // Query parameters such as ?src=catalog are analytics attribution only.
  const routeMatch = location.pathname.match(/^\/games\/([^/]+)\/?$/);
  const routeSlugRaw = routeMatch ? decodeURIComponent(routeMatch[1]) : '';
  const routeSlug = testBuild && routeSlugRaw.endsWith('-test') ? routeSlugRaw.slice(0, -5) : routeSlugRaw;
  const slug = routeSlug || scriptUrl.searchParams.get('slug') || '';
  const source = scriptUrl.searchParams.get('source') || 'direct';
  // Keep attribution in `source` above, but remove src from the visible URL so game code
  // and browser-side tools see one stable canonical URL for this game.
  try {
    const cleanUrl = new URL(window.location.href);
    if (cleanUrl.searchParams.has('src')) {
      cleanUrl.searchParams.delete('src');
      history.replaceState(history.state, '', cleanUrl);
    }
  } catch {}
  const iframe = document.getElementById('gameFrame');
  let activeSession = null;
  let heartbeatTimer = null;
  let guestId = '';
  let favoriteState = null;
  let ratingState = null;
  let favoriteStateRevision = 0;
  let stopping = false;
  const requestIdPattern = /^sc-[a-z0-9-]{8,100}$/i;

  function sendGameSettings() {
    if (iframe?.contentWindow) iframe.contentWindow.postMessage({ channel: 'SC_PLATFORM_SETTINGS', language: window.SC?.language || 'en', theme: window.SC?.theme || 'light', favorite: favoriteState, rating: ratingState }, '*');
  }
  async function loadGameFavoriteState() {
    if (testBuild) return;
    const revision = favoriteStateRevision;
    try {
      await window.SC?.ready;
      const result = await api(`/api/games/${encodeURIComponent(slug)}/details?lang=${encodeURIComponent(window.SC?.language || 'ru')}`);
      if (revision !== favoriteStateRevision) return;
      favoriteState = Boolean(result.isFavorite);
      ratingState = Number.isInteger(Number(result.ownRating)) ? Number(result.ownRating) : 0;
      sendGameSettings();
    } catch {
      // Keep the game's default state when favorite status cannot be loaded.
    }
  }
  iframe?.addEventListener('load', sendGameSettings);
  window.addEventListener('sc:language', sendGameSettings);
  window.addEventListener('sc:theme', sendGameSettings);
  window.SC?.ready?.then(() => { sendGameSettings(); void loadGameFavoriteState(); });
  function htmlEscape(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
  async function api(url, method = 'GET', body) {
    const options = { method, headers: { accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) {
      options.headers['content-type'] = 'application/json';
      if (window.SC?.csrfToken) options.headers['x-csrf-token'] = window.SC.csrfToken;
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  }
  async function answer(id, result, error) {
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ channel: 'SC_PLATFORM_RESPONSE', id, ok: !error, result: error ? undefined : result, error: error ? String(error.message || error).slice(0, 240) : undefined }, '*');
  }
  async function handleSdkRequest(data) {
    if (testBuild) throw new Error('Platform features are disabled in test builds.');
    const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
    switch (data.action) {
      case 'getUser': {
        const boot = await window.SC.refreshBootstrap();
        return boot.user ? { authenticated: true, displayName: boot.user.name || 'Player', playerId: boot.user.playerId || null } : { authenticated: false, displayName: 'Guest', playerId: null };
      }
      case 'save': return api(`/api/games/${encodeURIComponent(slug)}/save`, 'POST', { data: payload.data });
      case 'loadSave': { const boot = await window.SC.refreshBootstrap(); if (!boot.user) return { save: null, requiresSignIn: true, updatedAt: null }; return api(`/api/games/${encodeURIComponent(slug)}/save`); }
      case 'rate': {
        const result = await api(`/api/games/${encodeURIComponent(slug)}/rating`, 'POST', { rating: Number(payload.rating) });
        ratingState = Number(payload.rating);
        sendGameSettings();
        return result;
      }
      case 'review': return api(`/api/games/${encodeURIComponent(slug)}/review`, 'POST', { body: String(payload.body || '').slice(0, 2000) });
      case 'favorite': {
        const result = await api(`/api/games/${encodeURIComponent(slug)}/favorite`, 'POST', {});
        if (typeof result.favorite === 'boolean') {
          favoriteStateRevision++;
          favoriteState = result.favorite;
          sendGameSettings();
        }
        return result;
      }
      case 'share': return api(`/api/games/${encodeURIComponent(slug)}/share`, 'POST', { guestId });
      case 'recordClick': return api('/api/sdk/event', 'POST', { slug, guestId, type: 'game_click', label: String(payload.label || '').slice(0, 80) });
      case 'track': {
        const allowed = new Set(['custom_click', 'level_start', 'level_complete']);
        const eventName = String(payload.eventName || '');
        if (!allowed.has(eventName)) throw new Error('Unsupported analytics event.');
        const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
        return api('/api/sdk/event', 'POST', { slug, guestId, type: eventName === 'custom_click' ? 'custom_click' : eventName, label: String(metadata.label || '').slice(0, 80) });
      }
      default: throw new Error('Unknown platform API method.');
    }
  }
  window.addEventListener('message', async (event) => {
    if (!iframe?.contentWindow || event.source !== iframe.contentWindow || !event.data || typeof event.data !== 'object') return;
    if (event.data.channel === 'SC_GAME_STORAGE') {
      if (slug !== '2048' || event.data.key !== 'best' || !['get', 'set'].includes(event.data.action)) return;
      const storageKey = 'supercube:game:2048:best';
      let value = null;
      try {
        if (event.data.action === 'get') value = localStorage.getItem(storageKey);
        else {
          const score = Number(event.data.value);
          if (Number.isSafeInteger(score) && score >= 0 && score <= 2 ** 31) {
            value = String(Math.max(score, Number(localStorage.getItem(storageKey) || 0)));
            localStorage.setItem(storageKey, value);
          }
        }
      } catch {}
      iframe.contentWindow.postMessage({ channel: 'SC_GAME_STORAGE_RESULT', key: 'best', value }, '*');
      return;
    }
    if (event.data.channel !== 'SC_PLATFORM') return;
    const { id, slug: requestedSlug, action } = event.data;
    if (!requestIdPattern.test(String(id || '')) || requestedSlug !== slug || typeof action !== 'string') return;
    try { await answer(id, await handleSdkRequest(event.data)); }
    catch (error) { await answer(id, null, error); }
  });
  async function startSession() {
    if (testBuild || stopping) return;
    try {
      const boot = await window.SC.ready;
      if (!boot) return;
      guestId = window.SC.getGuestId();
      const data = await api('/api/sdk/session/start', 'POST', { slug, guestId, source });
      activeSession = data.id;
      const pulse = () => {
        if (activeSession) api('/api/sdk/session/heartbeat', 'POST', { sessionId: activeSession, guestId, active: document.visibilityState === 'visible' && document.hasFocus() }).catch(() => {});
      };
      heartbeatTimer = setInterval(pulse, 15000);
      document.addEventListener('visibilitychange', pulse);
      window.addEventListener('focus', pulse);
      window.addEventListener('blur', pulse);
    } catch (error) { console.debug('Platform analytics are not available:', error.message); }
  }
  function endSession() {
    if (stopping) return;
    stopping = true;
    clearInterval(heartbeatTimer);
    if (activeSession) {
      const body = JSON.stringify({ sessionId: activeSession, guestId, active: document.visibilityState === 'visible' && document.hasFocus() });
      const headers = { type: 'application/json' };
      const blob = new Blob([body], headers);
      // sendBeacon cannot set the CSRF header, so use a same-origin keepalive fetch instead.
      fetch('/api/sdk/session/end', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': window.SC?.csrfToken || '' }, body, keepalive: true }).catch(() => {});
    }
  }
  window.addEventListener('pagehide', endSession);
  window.addEventListener('beforeunload', endSession);
  window.SC?.ready.then(() => {
    const theme = localStorage.getItem('supercube-theme'); if (theme) window.SC.applyTheme(theme, false);
    startSession();
    if (!testBuild) setupFeedback();
  });

  async function setupFeedback() {
    const currentUser = window.SC.bootstrap?.user;
    document.querySelectorAll('[data-rating]').forEach((button) => button.addEventListener('click', async () => {
      if (!currentUser) { location.href = '/login.html'; return; }
      try { await api(`/api/games/${encodeURIComponent(slug)}/rating`, 'POST', { rating: Number(button.dataset.rating) }); window.SC.toast('Rating saved.'); }
      catch (error) { window.SC.toast(error.message, true); }
    }));
    const favoriteButton = document.getElementById('favoriteButton');
    favoriteButton?.addEventListener('click', async () => {
      if (!window.SC.bootstrap?.user) { location.href = '/login.html'; return; }
      try { const data = await api(`/api/games/${encodeURIComponent(slug)}/favorite`, 'POST', {}); favoriteButton.textContent = data.favorite ? '♥ Favorited' : '♡ Favorite'; }
      catch (error) { window.SC.toast(error.message, true); }
    });
    document.getElementById('reviewForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!window.SC.bootstrap?.user) { location.href = '/login.html'; return; }
      const body = new FormData(form).get('body');
      try { await api(`/api/games/${encodeURIComponent(slug)}/review`, 'POST', { body }); form.reset(); window.SC.toast('Review saved.'); await loadReviews(); }
      catch (error) { window.SC.toast(error.message, true); }
    });
    await loadReviews();
  }
  async function loadReviews() {
    const list = document.getElementById('reviewsList');
    if (!list) return;
    try {
      const data = await api(`/api/games/${encodeURIComponent(slug)}/reviews`);
      list.innerHTML = (data.reviews || []).map((review) => { const avatar = review.avatar ? `<img class="review-avatar" src="${htmlEscape(review.avatar)}" alt="" loading="lazy">` : `<span class="review-avatar review-avatar-empty">●</span>`; return `<article class="review-item"><div class="review-heading">${avatar}<div><strong>${htmlEscape(review.name || review.playerId || 'Player')}</strong><div class="small muted">${htmlEscape(review.playerId || '')}</div></div></div><p>${htmlEscape(review.body)}</p></article>`; }).join('') || '<p class="muted small">No reviews yet.</p>';
    } catch (error) { console.debug(error); }
  }
})();

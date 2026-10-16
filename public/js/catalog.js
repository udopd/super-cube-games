(() => {
  'use strict';
  const grid = document.getElementById('gamesGrid');
  if (!grid) return;
  const filters = document.getElementById('filters');
  const tagFilter = document.getElementById('tagFilter');
  const emptyState = document.getElementById('emptyState');
  const catalogCounter = document.getElementById('catalogCounter');
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -25px 0px' }) : null;
  let currentTags = [];
  let currentGames = [];
  const filterStorageKey = 'sc-catalog-filters-v1';
  function persistFilters() { try { const data = new FormData(filters); localStorage.setItem(filterStorageKey, JSON.stringify(Object.fromEntries(data.entries()))); } catch {} }
  function restoreFilters() { try { const data = JSON.parse(localStorage.getItem(filterStorageKey) || '{}'); for (const [key, value] of Object.entries(data)) { const field = filters.elements.namedItem(key); if (field && typeof value === 'string') field.value = value; } } catch {} }

  function capsuleUrl(url) { return url || '/og-default.svg'; }
  function card(game, index) {
    const tags = (game.tags || []).map((tag) => `<span class="tag">${escapeHtml(String(tag).toLowerCase())}</span>`).join('');
    const favorite = Boolean(window.SC?.bootstrap?.user && game.isFavorite);
    return `<article class="game-card" style="transition-delay:${Math.min(index % 3, 2) * 90}ms" data-slug="${escapeHtml(game.slug)}" data-open-game="${escapeHtml(game.slug)}" role="button" tabindex="0" aria-label="${escapeHtml(game.title)}">
      <a class="game-card-media" href="/games/${encodeURIComponent(game.slug)}?src=catalog"><img src="${escapeHtml(capsuleUrl(game.capsule))}" alt="${escapeHtml(game.title)}" loading="lazy" width="630" height="500"></a>
      <div class="game-card-info"><h3 class="game-card-title"><a href="/games/${encodeURIComponent(game.slug)}?src=catalog">${escapeHtml(game.title)}</a></h3><div class="tag-list">${tags}</div>
        <div class="game-card-meta"><span class="players">${escapeHtml(window.SC.formatPlayers(game.minPlayers, game.maxPlayers))}${game.runtimeType === 'server' ? ` · <span class="server-ping" data-game-ping="${escapeHtml(game.slug)}">${escapeHtml(window.SC.t('pingChecking'))}</span>` : ''}</span><span class="rating">${window.SC.renderStars(game.averageRating)}</span></div>
        <div class="card-actions"><a class="card-play" href="/games/${encodeURIComponent(game.slug)}?src=catalog">${escapeHtml(window.SC.t('play'))}</a><button class="favorite-toggle ${favorite ? 'is-active' : ''}" type="button" data-favorite="${escapeHtml(game.slug)}" aria-label="${escapeHtml(window.SC.t(favorite ? 'unfavorite' : 'favorite'))}" title="${escapeHtml(window.SC.t(favorite ? 'unfavorite' : 'favorite'))}">${favorite ? '♥' : '♡'}</button></div></div></article>`;
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
  function setupObserver() {
    const cards = grid.querySelectorAll('.game-card');
    cards.forEach((element, index) => {
      element.style.transitionDelay = `${Math.min(index % 3, 2) * 85}ms`;
      if (observer) observer.observe(element); else element.classList.add('is-visible');
    });
  }
  function updateTags(tags) {
    const previous = tagFilter.value;
    const first = tagFilter.querySelector('option[value=""]');
    tagFilter.replaceChildren(first || new Option(window.SC.t('allTags'), ''));
    for (const tag of tags || []) {
      const option = new Option(String(tag).toLowerCase(), String(tag).toLowerCase());
      tagFilter.appendChild(option);
    }
    if (tags.includes(previous)) tagFilter.value = previous;
  }
  async function updatePings() {
    const nodes = [...grid.querySelectorAll('[data-game-ping]')];
    await Promise.all(nodes.map(async (node) => {
      const slug = node.dataset.gamePing;
      for (let attempt = 0; attempt < 7; attempt += 1) {
        try {
          const result = await window.SC.api(`/api/games/${encodeURIComponent(slug)}/ping`);
          if (result.status === 'online' && Number.isFinite(result.pingMs)) { node.textContent = `${result.pingMs} ms`; node.title = window.SC.t('pingOnline'); return; }
          if (result.status === 'not-applicable') { node.textContent = ''; return; }
          node.textContent = window.SC.t('pingStarting');
        } catch (error) { node.textContent = window.SC.t('pingOffline'); node.title = error.message || ''; return; }
        await new Promise((resolve) => setTimeout(resolve, 850));
      }
      node.textContent = window.SC.t('pingOffline');
    }));
  }
  async function loadGames() {
    const data = new FormData(filters);
    persistFilters();
    const query = new URLSearchParams();
    query.set('lang', window.SC.language);
    for (const key of ['tag','players','minRating','sort']) if (data.get(key)) query.set(key, data.get(key));
    if (data.get('q')) query.set('q', data.get('q'));
    const response = await window.SC.api(`/api/games?${query.toString()}`);
    currentTags = response.tags || [];
    updateTags(currentTags);
    const q = String(data.get('q') || '').trim().toLocaleLowerCase();
    currentGames = response.games || [];
    grid.innerHTML = currentGames.map(card).join('');
    emptyState.classList.toggle('hidden', currentGames.length > 0);
    if (catalogCounter) catalogCounter.textContent = `${currentGames.length} ${window.SC.t('countGames')}`;
    setupObserver();
    updatePings().catch(() => {});
    grid.querySelectorAll('[data-favorite]').forEach((button) => button.addEventListener('click', toggleFavorite));
    grid.querySelectorAll('[data-open-game]').forEach((cardElement) => {
      cardElement.addEventListener('click', (event) => {
        if (event.target.closest('[data-favorite]')) return;
        if (event.target.closest('.card-play')) return;
        if (event.target.closest('a') && (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1)) return;
        event.preventDefault();
        const slug = cardElement.dataset.openGame;
        window.SC.api('/api/events', { method: 'POST', body: { slug, type: 'catalog_click', guestId: window.SC.getGuestId() } }).catch(() => {});
        window.SC.openGameModal?.(slug);
      });
      cardElement.addEventListener('keydown', (event) => {
        if (event.target !== cardElement) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); window.SC.openGameModal?.(cardElement.dataset.openGame); }
      });
    });
  }
  async function toggleFavorite(event) {
    const button = event.currentTarget;
    const slug = button.dataset.favorite;
    if (!window.SC.bootstrap?.user) { window.location.href = '/login.html'; return; }
    try {
      const result = await window.SC.api(`/api/games/${encodeURIComponent(slug)}/favorite`, { method: 'POST', body: {} });
      button.classList.toggle('is-active', result.favorite);
      if (result.favorite) window.SC.celebrateFavorite?.(button);
      button.textContent = result.favorite ? '♥' : '♡';
      button.title = window.SC.t(result.favorite ? 'unfavorite' : 'favorite');
      button.setAttribute('aria-label', button.title);
      window.SC.toast(result.favorite ? window.SC.t('favoriteAdded') : window.SC.t('favoriteRemoved'));
    } catch (error) { window.SC.toast(error.message, true); }
  }
  let debounce;
  filters.addEventListener('submit', (event) => { event.preventDefault(); loadGames().catch((error) => window.SC.toast(error.message, true)); });
  filters.addEventListener('change', () => loadGames().catch((error) => window.SC.toast(error.message, true)));
  document.getElementById('searchInput').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => loadGames().catch((error) => window.SC.toast(error.message, true)), 180); });
  document.getElementById('resetFilters').addEventListener('click', () => { localStorage.removeItem(filterStorageKey); setTimeout(() => { persistFilters(); loadGames().catch((error) => window.SC.toast(error.message, true)); }, 0); });
  window.addEventListener('sc:language', () => { updateTags(currentTags); loadGames().catch(() => {}); });
  window.addEventListener('sc:theme', () => {});
  restoreFilters();
  window.SC.updateCatalogRating = (slug, averageRating, ratingsCount) => { const game = currentGames.find((item) => item.slug === slug); if (game) { game.averageRating = Number(averageRating || 0); game.ratingsCount = Number(ratingsCount || 0); } const card = grid.querySelector(`[data-slug="${CSS.escape(slug)}"]`); const rating = card?.querySelector('.rating'); if (rating) rating.innerHTML = window.SC.renderStars(averageRating); if (rating) rating.title = `${Number(averageRating || 0).toFixed(1)} / 5 · ${Number(ratingsCount || 0)} ratings`; };
  window.SC.ready.then(() => loadGames()).catch((error) => window.SC.toast(error.message, true));
})();

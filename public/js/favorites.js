(() => {
  'use strict';
  const root = document.getElementById('favoritesList');
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const text = (ru, en) => window.SC.language === 'ru' ? ru : en;
  function renderHistory(id, games) {
    const node = document.getElementById(id);
    if (!node) return;
    if (!games?.length) { node.innerHTML = `<div class="empty-state">${esc(window.SC.t('noData'))}</div>`; return; }
    node.innerHTML = games.map((game) => {
      const playTime = window.SC.formatTime(game.playSeconds || 0);
      const played = game.lastPlayed ? new Date(game.lastPlayed).toLocaleDateString(window.SC.language === 'ru' ? 'ru-RU' : 'en-US') : '';
      return `<article class="profile-game"><a href="/games/${encodeURIComponent(game.slug)}"><img src="${esc(game.capsule)}" alt="${esc(game.title)}" loading="lazy"></a><div><h2><a href="/games/${encodeURIComponent(game.slug)}">${esc(game.title)}</a></h2><p>${esc(window.SC.t('playTime'))}: ${esc(playTime)}${played ? ` · ${esc(played)}` : ''}</p></div><div class="profile-actions"><a class="button secondary" href="/games/${encodeURIComponent(game.slug)}">${esc(window.SC.t('openGame'))} ↗</a></div></article>`;
    }).join('');
  }
  function render(games) {
    if (!games.length) {
      root.innerHTML = `<div class="empty-state">${esc(window.SC.t('favoritesEmpty'))}</div>`;
      return;
    }
    root.innerHTML = games.map((game) => {
      return `<article class="profile-game" data-favorite-game="${Number(game.id)}"><a href="/games/${encodeURIComponent(game.slug)}"><img src="${esc(game.capsule)}" alt="${esc(game.title)}" loading="lazy"></a><div><h2><a href="/games/${encodeURIComponent(game.slug)}">${esc(game.title)}</a></h2></div><div class="profile-actions"><a class="button secondary" href="/games/${encodeURIComponent(game.slug)}">${esc(text('Играть', 'Play'))} ↗</a><button class="button secondary" type="button" data-remove-favorite="${esc(game.slug)}">${esc(text('Убрать', 'Remove'))}</button></div></article>`;
    }).join('');
    root.querySelectorAll('[data-remove-favorite]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await window.SC.api(`/api/games/${encodeURIComponent(button.dataset.removeFavorite)}/favorite`, { method: 'POST', body: {} });
        button.closest('[data-favorite-game]').remove();
        if (!root.querySelector('[data-favorite-game]')) render([]);
      } catch (error) { window.SC.toast(error.message, true); button.disabled = false; }
    }));
  }
  async function load() {
    document.title = `${window.SC.language === 'ru' ? 'Мои игры' : 'My games'} — SUPER CUBE Games`;
    const boot = await window.SC.ready;
    if (!boot?.user) { location.replace('/login.html?error=state'); return; }
    if (boot.user.isAdmin) { location.replace('/admin.html'); return; }
    const [data, summary] = await Promise.all([window.SC.api('/api/me/favorites'), window.SC.api('/api/me/summary')]);
    render(data.games || []);
    renderHistory('recentGames', summary.recent);
    renderHistory('topGames', summary.topPlayed);
    renderHistory('playedGames', summary.played);
    const count = document.getElementById('playedCount');
    if (count) count.textContent = String(summary.played?.length || 0);
  }
  window.addEventListener('sc:language', () => load().catch(() => {}));
  load().catch((error) => { window.SC.toast(error.message, true); if (error.status === 401) location.href = '/login.html'; });
})();

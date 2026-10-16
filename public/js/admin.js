(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { games: [], lang: localStorage.getItem('supercube-lang') === 'en' ? 'en' : 'ru', editing: '', uploading: false };
  const dictionary = {
    ru: { adminRole:'Администратор',runtimeTypeColumn:'Тип игры',serverGame:'Серверная',browserGame:'Обычная',totalGames:'Всего игр',published:'Опубликовано',players:'Уникальные игроки',accounts:'Аккаунты',loading:'Загружаем…',none:'Пока нет игр. Загрузите первый ZIP выше.',test:'Тест',preview:'Карточка',updateGame:'Обновить игру',edit:'Изменить',publish:'Опубликовать',unpublish:'Снять с публикации',del:'Удалить',publishedStatus:'Опубликована',draft:'Черновик',sessions:'запусков',ratings:'оценок',clicks:'кликов',catalog:'Каталог',external:'Внешние',favorites:'избранное',reviews:'отзывов',shares:'поделились',confirmPublish:'Опубликовать',confirmUnpublish:'снять с публикации',confirmDelete:'Удалить',yes:'Подтвердить',cancel:'Отмена',donePublish:'Игра опубликована.',doneUnpublish:'Публикация остановлена.',doneDelete:'Игра удалена.',saved:'Изменения сохранены.',selectedZip:'Размер архива',chooseZip:'Выберите ZIP-архив.',badZip:'Перетащите файл с расширением .zip.',uploading:'Загружаем архив…',created:'Черновик создан. Тестовая страница:',sizeLimit:'Архив должен быть меньше 100 MiB.',preserveStats:'Сохранения и статистика игроков будут сохранены.',updated:'Игра обновлена',uploadNetworkError:'Ошибка сети при загрузке архива.',uploadCancelled:'Загрузка отменена.',processingArchive:'Архив загружен. Сервер проверяет и распаковывает файлы…',waitForServer:'Не закрывай страницу, дождись ответа сервера.',uploadComplete:'Загрузка завершена.',refreshingList:'Обновляем список игр…',unknownError:'Не удалось выполнить действие.' },
    en: { adminRole:'Administrator',runtimeTypeColumn:'Game type',serverGame:'Server',browserGame:'Browser',totalGames:'Total games',published:'Published',players:'Unique players',accounts:'Accounts',loading:'Loading…',none:'No games yet. Upload the first ZIP above.',test:'Test',preview:'Card',updateGame:'Update game',edit:'Edit',publish:'Publish',unpublish:'Unpublish',del:'Delete',publishedStatus:'Published',draft:'Draft',sessions:'sessions',ratings:'ratings',clicks:'clicks',catalog:'Catalog',external:'External',favorites:'favourites',reviews:'reviews',shares:'shares',confirmPublish:'publish',confirmUnpublish:'unpublish',confirmDelete:'delete',yes:'Confirm',cancel:'Cancel',donePublish:'Game published.',doneUnpublish:'Game unpublished.',doneDelete:'Game deleted.',saved:'Changes saved.',selectedZip:'Archive size',chooseZip:'Choose a ZIP archive first.',badZip:'Drop a file with the .zip extension.',uploading:'Uploading archive…',created:'Draft created. Test page:',sizeLimit:'Archive must be smaller than 100 MiB.',preserveStats:'Player saves and statistics will be preserved.',updated:'Game updated',uploadNetworkError:'Network error while uploading archive.',uploadCancelled:'Upload cancelled.',processingArchive:'Archive uploaded. Server is validating and extracting files…',waitForServer:'Keep this page open until the server responds.',uploadComplete:'Upload complete.',refreshingList:'Refreshing game list…',unknownError:'The action could not be completed.' }
  };
  const t = (key) => dictionary[state.lang][key] || key;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (v) => new Intl.NumberFormat(state.lang === 'ru' ? 'ru-RU' : 'en-US').format(Number(v || 0));
  const byId = (id) => $(id);
  const setMessage = (node, text, error = false) => { node.textContent = text; node.classList.toggle('error-notice', error); };
  const archiveSize = (bytes) => `${fmt(bytes)} bytes · ${(bytes / 1024).toFixed(2)} KB · ${(bytes / 1048576).toFixed(3)} MB`;
  window.addEventListener('beforeunload', (event) => {
    if (!state.uploading) return;
    event.preventDefault();
    event.returnValue = '';
  });
  function setUploadProgress(percent, label, detail = '') {
    const wrap = $('uploadProgressWrap');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    $('uploadProgressFill').style.width = `${value}%`;
    $('uploadProgressPercent').textContent = `${value}%`;
    $('uploadProgressLabel').textContent = label;
    $('uploadProgressDetail').textContent = detail;
    wrap.setAttribute('aria-valuenow', String(value));
  }
  function hideUploadProgress() { $('uploadProgressWrap')?.classList.add('hidden'); }
  function uploadWithProgress(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Accept', 'application/json');
      if (window.SC?.csrfToken) xhr.setRequestHeader('x-csrf-token', window.SC.csrfToken);
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress(Math.min(99, (event.loaded / event.total) * 100), event.loaded, event.total);
      });
      xhr.upload.addEventListener('load', () => onProgress(100, 0, 0, true));
      xhr.addEventListener('load', () => {
        let payload;
        try { payload = JSON.parse(xhr.responseText || '{}'); } catch { payload = { error: xhr.responseText || `HTTP ${xhr.status}` }; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
        else { const error = new Error(payload.error || payload.message || `Request failed (${xhr.status})`); error.status = xhr.status; error.payload = payload; reject(error); }
      });
      xhr.addEventListener('error', () => reject(new Error(t('uploadNetworkError'))));
      xhr.addEventListener('abort', () => reject(new Error(t('uploadCancelled'))));
      xhr.send(formData);
    });
  }

  async function updateAdminPings() {
    const nodes = [...document.querySelectorAll('[data-admin-ping]')];
    await Promise.all(nodes.map(async (node) => {
      const slug = node.dataset.adminPing;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try { const result = await window.SC.api(`/api/games/${encodeURIComponent(slug)}/ping`); if (result.status === 'online') { node.textContent = `${state.lang === 'ru' ? 'Пинг' : 'Ping'}: ${result.pingMs} ms`; return; } node.textContent = state.lang === 'ru' ? 'Пинг: запускается…' : 'Ping: starting…'; }
        catch { node.textContent = state.lang === 'ru' ? 'Пинг: недоступен' : 'Ping: unavailable'; return; }
        await new Promise(resolve => setTimeout(resolve, 900));
      }
      node.textContent = state.lang === 'ru' ? 'Пинг: недоступен' : 'Ping: unavailable';
    }));
  }
  async function load() {
    const boot = await window.SC.ready;
    if (!boot?.user) { location.replace('/login.html?error=admin'); return; }
    if (!boot.user.isAdmin) { location.replace('/'); return; }
    $('adminIdentity').textContent = t('adminRole');
    const [summary, gameData] = await Promise.all([window.SC.api('/api/admin/summary'), window.SC.api('/api/admin/games')]);
    const stats = [
      [t('totalGames'), summary.games], [t('published'), summary.publishedGames], [t('players'), summary.uniquePlayers], [t('accounts'), summary.users]
    ];
    $('adminStats').innerHTML = stats.map(([label,value]) => `<div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${fmt(value)}</div></div>`).join('');
    state.games = gameData.games || [];
    renderGames();
  }
  function renderGames() {
    const tbody = $('adminGamesBody');
    if (!state.games.length) { tbody.innerHTML = `<tr><td colspan="8">${esc(t('none'))}</td></tr>`; return; }
    tbody.innerHTML = state.games.map((g) => {
      const m = g.metrics || {};
      const tags = g.tagsEn || g.tags || [];
      return `<tr>
        <td><div class="admin-game-cell"><img class="admin-game-capsule" src="${esc(g.capsule || '/og-default.svg')}" alt="" loading="lazy"><strong>${esc(g.title)}</strong></div></td>
        <td><span class="game-type-pill ${g.runtimeType === 'server' ? 'server' : 'browser'}">${esc(g.runtimeType === 'server' ? t('serverGame') : t('browserGame'))}</span></td>
        <td><span class="status ${esc(g.status)}">${esc(g.status === 'published' ? t('publishedStatus') : t('draft'))}</span></td>
        <td><strong>${fmt(m.uniquePlayers)}</strong> ${esc(t('players').toLowerCase())}<br><span class="small muted">${fmt(m.sessions)} ${esc(t('sessions'))}</span></td>
        <td><strong>${Number(m.averageRating || 0).toFixed(1)} ★</strong><br><span class="small muted">${fmt(m.ratingsCount)} ${esc(t('ratings'))}</span></td>
        <td>${Number(m.medianPlayMinutes || 0).toFixed(1)} min<br><span class="small muted">${fmt(m.totalPlaySeconds)} sec</span></td>
        <td><span>${fmt(m.clicks)} ${esc(t('clicks'))}</span><br><span class="small muted">${esc(t('catalog'))} ${fmt(m.catalogClicks)} · ${esc(t('external'))} ${fmt(m.externalReferrals)}</span><br><span class="small muted">♡ ${fmt(m.favorites)} · ${fmt(m.reviewsCount)} ${esc(t('reviews'))} · ↗ ${fmt(m.shareEvents)} ${esc(t('shares'))}</span></td>
        <td><div class="admin-actions"><button class="button secondary mini-button" type="button" data-preview="${esc(g.slug)}">${esc(t('preview'))}</button><a class="button secondary mini-button" href="${esc(g.testUrl)}" target="_blank" rel="noopener">${esc(t('test'))}</a><button class="button secondary mini-button" type="button" data-update="${esc(g.slug)}">${esc(t('updateGame'))}</button><button class="button secondary mini-button" type="button" data-edit="${esc(g.slug)}">${esc(t('edit'))}</button>${g.status === 'draft' ? `<button class="button mini-button" data-publish="${esc(g.slug)}" type="button">${esc(t('publish'))}</button>` : `<button class="button secondary mini-button" data-unpublish="${esc(g.slug)}" type="button">${esc(t('unpublish'))}</button>`}<button class="button danger mini-button" data-delete="${esc(g.slug)}" type="button">${esc(t('del'))}</button></div></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-preview]').forEach((b) => b.addEventListener('click', () => window.SC?.openGameModal?.(b.dataset.preview)));
    updateAdminPings();
    tbody.querySelectorAll('[data-update]').forEach((b) => b.addEventListener('click', () => updateGameArchive(b.dataset.update)));
    tbody.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openEditor(b.dataset.edit)));
    tbody.querySelectorAll('[data-publish]').forEach((b) => b.addEventListener('click', () => changeStatus(b.dataset.publish, 'publish')));
    tbody.querySelectorAll('[data-unpublish]').forEach((b) => b.addEventListener('click', () => changeStatus(b.dataset.unpublish, 'unpublish')));
    tbody.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => deleteGame(b.dataset.delete)));
  }
  async function changeStatus(slug, action) {
    const game = state.games.find((g) => g.slug === slug); if (!game) return;
    const verb = action === 'publish' ? t('confirmPublish') : t('confirmUnpublish');
    if (!confirm(`${t('yes')}: ${verb} «${game.title}»?`)) return;
    try { await window.SC.api(`/api/admin/games/${encodeURIComponent(slug)}/${action}`, { method: 'POST', body: {} }); window.SC.toast(action === 'publish' ? t('donePublish') : t('doneUnpublish')); await load(); }
    catch (e) { window.SC.toast(e.message || t('unknownError'), true); }
  }
  async function deleteGame(slug) {
    const game = state.games.find((g) => g.slug === slug); if (!game) return;
    if (!confirm(`${t('confirmDelete')} «${game.title}»?`)) return;
    try { await window.SC.api(`/api/admin/games/${encodeURIComponent(slug)}`, { method: 'DELETE' }); window.SC.toast(t('doneDelete')); await load(); }
    catch (e) { window.SC.toast(e.message || t('unknownError'), true); }
  }
  async function updateGameArchive(slug) {
    const game = state.games.find((item) => item.slug === slug); if (!game) return;
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.zip,application/zip'; input.hidden = true; document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0]; input.remove(); if (!file) return;
      if (!file.name.toLowerCase().endsWith('.zip')) { window.SC.toast(t('badZip'), true); return; }
      const size = archiveSize(file.size);
      if (!confirm(`${t('updateGame')}: ${game.title}?\n${t('selectedZip')}: ${size}\n${t('preserveStats')}`)) return;
      const fd = new FormData(); fd.append('archive', file);
      const updateButton = document.querySelector(`[data-update="${CSS.escape(slug)}"]`); if (updateButton) updateButton.disabled = true;
      state.uploading = true;
      setUploadProgress(0, t('uploading'), `${file.name} · ${archiveSize(file.size)}`);
      try {
        const result = await uploadWithProgress(`/api/admin/games/${encodeURIComponent(slug)}/update`, fd, (percent, loaded, total, sent) => {
          if (sent) setUploadProgress(100, t('processingArchive'), t('waitForServer'));
          else setUploadProgress(percent, t('uploading'), `${archiveSize(loaded)} / ${archiveSize(total || file.size)}`);
        });
        setUploadProgress(100, t('uploadComplete'), t('refreshingList'));
        window.SC.toast(`${t('updated')}: ${result.game?.title || game.title}`); await load();
      } catch (e) { setMessage($('uploadMessage'), e.message || t('unknownError'), true); window.SC.toast(e.message || t('unknownError'), true); }
      finally { state.uploading = false; if (updateButton) updateButton.disabled = false; window.setTimeout(hideUploadProgress, 1800); }
    }, { once:true }); input.click();
  }
  function openEditor(slug) {
    const g = state.games.find((item) => item.slug === slug); if (!g) return;
    state.editing = slug;
    $('editorTitle').textContent = `${t('edit')}: ${g.title}`;
    $('editTitle').value = g.title;
    $('editDescriptionRu').value = g.descriptionRu || g.description || '';
    $('editDescriptionEn').value = g.descriptionEn || g.description || '';
    $('editTagsRu').value = (g.tagsRu || []).join(', ');
    $('editTagsEn').value = (g.tagsEn || []).join(', ');
    $('editMinPlayers').value = g.minPlayers || 1;
    $('editMaxPlayers').value = g.maxPlayers || 1;
    $('editRuntimeType').value = g.runtimeType || 'browser';
    $('editCapsule').value = '';
    $('editorMessage').textContent = '';
    $('editorModal').classList.remove('hidden');
    document.body.classList.add('modal-open');
  }
  function closeEditor() { $('editorModal').classList.add('hidden'); document.body.classList.remove('modal-open'); }
  $('closeEditor').addEventListener('click', closeEditor);
  $('editorModal').addEventListener('click', (e) => { if (e.target === $('editorModal')) closeEditor(); });
  $('editorForm').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      await window.SC.api(`/api/admin/games/${encodeURIComponent(state.editing)}`, { method: 'PATCH', body: {
        title: $('editTitle').value.trim(), descriptionRu: $('editDescriptionRu').value, descriptionEn: $('editDescriptionEn').value,
        tagsRu: $('editTagsRu').value, tagsEn: $('editTagsEn').value, minPlayers: Number($('editMinPlayers').value),
        maxPlayers: Number($('editMaxPlayers').value), runtimeType: $('editRuntimeType').value
      }});
      const capsule = $('editCapsule').files[0];
      if (capsule) { const fd = new FormData(); fd.append('capsule', capsule); await window.SC.api(`/api/admin/games/${encodeURIComponent(state.editing)}/capsule`, { method: 'POST', body: fd }); }
      closeEditor(); window.SC.toast(t('saved')); await load();
    } catch (e) { setMessage($('editorMessage'), e.message || t('unknownError'), true); }
    finally { button.disabled = false; }
  });

  function showSelectedFile(file) {
    $('selectedArchive').textContent = file ? `${file.name} · ${archiveSize(file.size)}` : '';
  }
  $('archiveInput').addEventListener('change', () => showSelectedFile($('archiveInput').files[0]));
  ['dragenter','dragover'].forEach((name) => $('dropzone').addEventListener(name, (e) => { e.preventDefault(); $('dropzone').classList.add('is-dragover'); }));
  ['dragleave','drop'].forEach((name) => $('dropzone').addEventListener(name, (e) => { e.preventDefault(); $('dropzone').classList.remove('is-dragover'); }));
  $('dropzone').addEventListener('drop', (e) => {
    const file = [...(e.dataTransfer?.files || [])].find((f) => /\.zip$/i.test(f.name));
    if (!file) { setMessage($('uploadMessage'), t('badZip'), true); return; }
    const dt = new DataTransfer(); dt.items.add(file); $('archiveInput').files = dt.files; showSelectedFile(file);
  });
  $('uploadForm').addEventListener('submit', async (event) => {
    event.preventDefault(); const formNode = event.currentTarget; const file = $('archiveInput').files[0];
    if (!file) { setMessage($('uploadMessage'), t('chooseZip'), true); return; }
    if (file.size > 100 * 1024 * 1024) { setMessage($('uploadMessage'), t('sizeLimit'), true); return; }
    const button = formNode.querySelector('button[type="submit"]'); button.disabled = true; setMessage($('uploadMessage'), `${t('uploading')} ${archiveSize(file.size)}`);
    try {
      const fd = new FormData(); fd.append('archive', file);
      state.uploading = true;
      setUploadProgress(0, t('uploading'), `${file.name} · ${archiveSize(file.size)}`);
      const result = await uploadWithProgress('/api/admin/games/upload', fd, (percent, loaded, total, sent) => {
        if (sent) setUploadProgress(100, t('processingArchive'), t('waitForServer'));
        else setUploadProgress(percent, t('uploading'), `${archiveSize(loaded)} / ${archiveSize(total || file.size)}`);
      });
      setUploadProgress(100, t('uploadComplete'), t('refreshingList'));
      setMessage($('uploadMessage'), `${t('created')} ${result.game.title}. ${t('test')}: ${result.game.testUrl} · ${archiveSize(result.game.archiveBytes ?? file.size)}`);
      window.SC.toast(t('created')); $('archiveInput').value = ''; showSelectedFile(null); await load();
    } catch (e) { setMessage($('uploadMessage'), e.message || t('unknownError'), true); }
    finally { state.uploading = false; button.disabled = false; window.setTimeout(hideUploadProgress, 1800); }
  });
  window.addEventListener('sc:language', (e) => { state.lang = e.detail.lang === 'en' ? 'en' : 'ru'; renderGames(); });
  window.SC?.ready?.then(load).catch((e) => window.SC?.toast?.(e.message, true));
})();

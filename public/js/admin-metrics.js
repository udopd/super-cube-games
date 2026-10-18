(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let metrics = null;
  let players = [];
  let selectedPlayer = null;
  let allPlayers = [];
  const palette = ['#147a3d', '#2563eb', '#d97706', '#9333ea', '#db2777', '#0d9488'];
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const num = (value) => new Intl.NumberFormat(window.SC.language === 'ru' ? 'ru-RU' : 'en-US').format(Number(value || 0));
  const t = (ru, en) => window.SC.language === 'ru' ? ru : en;
  const dashboardLayoutKey = 'sc-admin-metrics-dashboard-v2';
  let dashboardLayout = null;
  let analyticsPage = 'metrics';
  let metricGames = [];
  function dashboardText(key) {
    const lang = window.SC?.language === 'en' ? 'en' : 'ru';
    const d = {
      games: ['Игры', 'Games'], platform: ['Состояние платформы', 'Platform status'],
      overview: ['Общие показатели', 'Overview'], gameplay: ['Игровая активность', 'Gameplay activity'], health: ['Состояние платформы', 'Platform health'], errors: ['Ошибки платформы и игр', 'Platform and game errors'], weeklyPlayers: ['Игроки за последние 7 дней', 'Players over the last 7 days'], medianRating: ['Медиана / оценка по игре', 'Median / rating by game'], playersToday: ['Число игроков сегодня · сравнение игр', 'Players today · compare games'],
      restore: ['Восстановить', 'Restore'], hide: ['Скрыть блок', 'Hide widget'],
      resize: ['Изменить ширину блока', 'Change widget width'], halfWidth: ['Вернуть обычную ширину', 'Return to half width'], fullscreen: ['Открыть подробный вид', 'Open detailed view'], closeFullscreen: ['Закрыть подробный вид', 'Close detailed view'], fullscreenTitle: ['Подробный вид блока', 'Widget detail view'],
      layout: ['Перетаскивай блоки за заголовок или скрывай их. Расположение сохранится в этом браузере.', 'Drag widgets by their headings or hide them. The layout is saved in this browser.'],
      noErrors: ['Ошибок по доступным источникам не обнаружено.', 'No errors were reported by available sources.'],
      runtimeError: ['Ошибка серверной игры', 'Server game error'], platform: ['Платформа', 'Platform'], event: ['Событие', 'Event'], recent: ['Недавние события', 'Recent events']
    };
    return d[key]?.[lang === 'ru' ? 0 : 1] || key;
  }
  function wrapAsWidget(node, title, id, grid, wide = false) {
    if (!node) return null;
    // Legacy sections carry large page-section spacing and no card surface. Convert
    // the root into a true widget card while preserving its internal content.
    node.classList.remove('section');
    node.classList.add('metric-panel', 'dashboard-widget');
    if (wide) node.classList.add('widget-wide');
    else node.classList.remove('widget-wide');
    node.dataset.widgetId = id;
    node.dataset.dashboardHome = grid.dataset.dashboardPanel;
    grid.appendChild(node);
    return node;
  }
  function createWidget(grid, id, titleKey, contentNode, wide = false, titleMarkup = null) {
    const section = document.createElement('section');
    section.className = 'metric-panel dashboard-widget' + (wide ? ' widget-wide' : '');
    section.dataset.widgetId = id;
    section.dataset.dashboardHome = grid.dataset.dashboardPanel;
    section.innerHTML = `<h2 data-dashboard-title="${safe(titleKey)}">${safe(dashboardText(titleKey))}</h2>`;
    if (contentNode) section.appendChild(contentNode);
    if (titleMarkup) section.querySelector('h2').innerHTML = titleMarkup;
    grid.appendChild(section);
    return section;
  }
  function initDashboardLayout() {
    const gamesGrid = $('dashboardGamesPanel'), platformGrid = $('dashboardPlatformPanel');
    if (!gamesGrid || !platformGrid) return;
    const sourceGameGrid = $('gamePlaysChart')?.closest('.grid-two');
    if (sourceGameGrid) [...sourceGameGrid.querySelectorAll(':scope > .metric-panel')].forEach((panel, i) => wrapAsWidget(panel, '', `game-chart-${i}`, gamesGrid, false));
    const historyGrid = $('gameCcuHistoryChart')?.closest('.trend-grid');
    ['gameCcuHistoryChart', 'gameCcuNowChart'].forEach((id, i) => {
      const panel = $(id)?.closest('.metric-panel');
      if (panel) wrapAsWidget(panel, '', id === 'gameCcuHistoryChart' ? 'game-ccu-history' : 'game-ccu-current', gamesGrid, true);
    });
    const medianPanel = $('medianRatingPanel');
    if (medianPanel) wrapAsWidget(medianPanel, '', 'game-median-rating', gamesGrid, false);
    const leaderboardSection = $('adminLeaderboardBody')?.closest('section.section');
    if (leaderboardSection) wrapAsWidget(leaderboardSection, '', 'game-leaderboard', gamesGrid, false);
    const gameMetricsSection = $('gameMetricRows')?.closest('section.section');
    if (gameMetricsSection) wrapAsWidget(gameMetricsSection, '', 'game-metrics-table', gamesGrid, false);

    const overview = document.createElement('section');
    overview.className = 'metric-panel dashboard-widget widget-wide'; overview.dataset.widgetId = 'platform-overview'; overview.dataset.dashboardHome = 'platform';
    overview.innerHTML = `<h2 data-dashboard-title="overview">${safe(dashboardText('overview'))}</h2>`;
    const overviewBody = document.createElement('div'); overviewBody.className = 'dashboard-widget-body';
    ['globalStats'].forEach((id) => { const el = $(id); if (el) overviewBody.appendChild(el); });
    overview.appendChild(overviewBody); platformGrid.appendChild(overview);
    const gameplay = document.createElement('section'); gameplay.className='metric-panel dashboard-widget widget-wide'; gameplay.dataset.widgetId='game-activity'; gameplay.dataset.dashboardHome='games';
    gameplay.innerHTML = `<h2 data-dashboard-title="gameplay">${safe(dashboardText('gameplay'))}</h2>`;
    const gameplayBody=document.createElement('div'); gameplayBody.className='dashboard-widget-body'; const gameplayStats=$('globalStatsSecondary'); if(gameplayStats) gameplayBody.appendChild(gameplayStats); gameplay.appendChild(gameplayBody); gamesGrid.appendChild(gameplay);
    ['platformCcuChart', 'dailyPlayersChart', 'dailyPlayers7dChart'].forEach((id, i) => {
      const panel = $(id)?.closest('.metric-panel');
      if (panel) wrapAsWidget(panel, '', ['platform-ccu-history','platform-daily-players','platform-weekly-players'][i], platformGrid, true);
    });
    const monitoring = $('monitoringSection');
    if (monitoring) {
      const status = $('monitoringStatus');
      const refresh = $('refreshMonitoring');
      const health = document.createElement('section'); health.className = 'metric-panel dashboard-widget widget-wide'; health.dataset.widgetId = 'platform-health'; health.dataset.dashboardHome = 'platform';
      health.innerHTML = `<div class="section-head"><h2 data-dashboard-title="health">${safe(dashboardText('health'))}</h2></div>`;
      if (refresh) health.querySelector('.section-head').appendChild(refresh);
      if (status) health.appendChild(status);
      platformGrid.appendChild(health);
      ['monitoringGames', 'monitoringEvents'].forEach((id, i) => {
        const panel = $(id)?.closest('.metric-panel');
        if (panel) wrapAsWidget(panel, '', i === 0 ? 'platform-server-games' : 'platform-events', platformGrid, true);
      });
      monitoring.remove();
    }
    const errorsWidget = document.createElement('section'); errorsWidget.className = 'metric-panel dashboard-widget widget-wide'; errorsWidget.dataset.widgetId = 'platform-errors'; errorsWidget.dataset.dashboardHome = 'platform';
    errorsWidget.innerHTML = `<h2 data-dashboard-title="errors">${safe(dashboardText('errors'))}</h2><div id="monitoringErrors" class="monitor-error-list"><p class="small muted">${safe(t('Загрузка ошибок…', 'Loading errors…'))}</p></div>`;
    platformGrid.appendChild(errorsWidget);
    // Remove the now-empty source grid containers after extracting the panels.
    if (sourceGameGrid && !sourceGameGrid.children.length) sourceGameGrid.remove();
    if (historyGrid && !historyGrid.querySelector('.metric-panel')) historyGrid.remove();
    // Add UI controls and persistent layout behavior to each direct widget.
    enhanceDashboardWidgets();
    document.querySelectorAll('.dashboard-widget-grid').forEach((grid) => [...grid.children].forEach((widget, index) => { widget.dataset.dashboardInitialIndex = String(index); }));
    const stored = (() => { try { return JSON.parse(localStorage.getItem(dashboardLayoutKey) || '{}'); } catch { return {}; } })();
    const widths = stored.widths || {};
    if (stored.widthVersion !== 1) {
      ['platform-ccu-history', 'platform-daily-players', 'platform-weekly-players'].forEach((id) => { widths[id] = true; });
      stored.widthVersion = 1;
    }
    dashboardLayout = { active: stored.active === 'platform' ? 'platform' : 'games', order: stored.order || {}, hidden: stored.hidden || {}, widths, widthVersion: stored.widthVersion };
    applyDashboardLayout();
    installWidgetFullscreen();
    $('dashboardGamesTab')?.addEventListener('click', () => { activateAnalyticsPage('metrics'); activateDashboardTab('games'); });
    $('dashboardPlatformTab')?.addEventListener('click', () => { activateAnalyticsPage('metrics'); activateDashboardTab('platform'); });
    window.addEventListener('sc:language', () => {
      document.querySelectorAll('[data-dashboard-title]').forEach((el) => { const key = el.dataset.dashboardTitle; el.textContent = dashboardText(key); });
      const note = $('dashboardLayoutNote'); if (note) note.textContent = dashboardText('layout');
      document.querySelectorAll('[data-widget-hide]').forEach((button) => { button.title = dashboardText('hide'); button.setAttribute('aria-label', button.title); });
      document.querySelectorAll('[data-widget-width-toggle]').forEach((button) => updateWidgetWidthControl(button.closest('.dashboard-widget')));
      document.querySelectorAll('.dashboard-widget-controls button').forEach((button) => { if(button.textContent==='↑'){button.title=t('Переместить выше','Move up');button.setAttribute('aria-label',button.title)} if(button.textContent==='↓'){button.title=t('Переместить ниже','Move down');button.setAttribute('aria-label',button.title)} });
      document.querySelectorAll('[data-widget-fullscreen]').forEach((button) => { button.title = dashboardText('fullscreen'); button.setAttribute('aria-label',button.title); });
      document.querySelectorAll('.dashboard-widget-drag-handle').forEach((button) => { button.title = t('Переместить блок','Move widget'); button.setAttribute('aria-label',button.title); });
      renderDashboardRestoreList();
      if (metricGames.length) { populateMedianRatingFilters(metricGames); renderMedianRating(metricGames); }
    });
  }
  function enhanceDashboardWidgets() {
    document.querySelectorAll('.dashboard-widget-grid > .dashboard-widget').forEach((widget) => {
      if (widget.dataset.widgetEnhanced === '1') return;
      widget.dataset.widgetEnhanced = '1';
      let header = widget.querySelector(':scope > .section-head');
      const directH2 = widget.querySelector(':scope > h2');
      if (!header && directH2) {
        header = document.createElement('div'); header.className = 'dashboard-widget-header';
        widget.insertBefore(header, directH2); header.appendChild(directH2);
      } else if (!header) {
        header = document.createElement('div'); header.className = 'dashboard-widget-header';
        const h2 = document.createElement('h2'); h2.textContent = widget.dataset.widgetId || 'Widget'; header.appendChild(h2); widget.insertBefore(header, widget.firstChild);
      }
      header.classList.add('dashboard-widget-header');
      header.draggable = false;
      let body = widget.querySelector(':scope > .dashboard-widget-body');
      if (!body) {
        body = document.createElement('div'); body.className = 'dashboard-widget-body';
        const children = [...widget.children].filter((child) => child !== header);
        children.forEach((child) => body.appendChild(child)); widget.appendChild(body);
      }
      const priorActions = [...header.querySelectorAll(':scope > button, :scope > a.button')];
      const heading = document.createElement('div'); heading.className = 'dashboard-widget-heading';
      [...header.children].filter((child) => !priorActions.includes(child)).forEach((child) => heading.appendChild(child));
      const handle = document.createElement('button');
      handle.type = 'button'; handle.className = 'dashboard-widget-drag-handle';
      handle.textContent = '⠿'; handle.title = t('Переместить блок','Move widget');
      handle.setAttribute('aria-label', handle.title); handle.setAttribute('aria-describedby', 'dashboardLayoutNote');
      const controls = document.createElement('div'); controls.className = 'dashboard-widget-controls';
      priorActions.forEach((action) => controls.appendChild(action));
      header.replaceChildren(handle, heading, controls);
      const fullscreen = document.createElement('button'); fullscreen.type = 'button'; fullscreen.className = 'dashboard-widget-control'; fullscreen.dataset.widgetFullscreen = ''; fullscreen.textContent = '⛶';
      fullscreen.title = dashboardText('fullscreen'); fullscreen.setAttribute('aria-label', fullscreen.title);
      const widthToggle = document.createElement('button'); widthToggle.type = 'button'; widthToggle.className = 'dashboard-widget-control'; widthToggle.dataset.widgetWidthToggle = ''; widthToggle.textContent = '↔';
      widthToggle.addEventListener('click', (event) => {
        event.stopPropagation();
        widget.classList.toggle('widget-wide');
        updateWidgetWidthControl(widget);
        saveDashboardLayout();
      });
      const hide = document.createElement('button'); hide.type = 'button'; hide.className = 'dashboard-widget-control'; hide.dataset.widgetHide = ''; hide.textContent = '×'; hide.title = dashboardText('hide'); hide.setAttribute('aria-label', dashboardText('hide'));
      controls.append(fullscreen, widthToggle, hide);
      fullscreen.addEventListener('click', (event) => { event.stopPropagation(); openWidgetFullscreen(widget, fullscreen); });
      updateWidgetWidthControl(widget);
      hide.addEventListener('click', (event) => { event.stopPropagation(); widget.hidden = true; saveDashboardLayout(); renderDashboardRestoreList(); });
      // Pointer-based sorting works with mouse, pen and touch; native HTML drag-and-drop is desktop-only.
      handle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || widget.hidden) return;
        event.preventDefault(); event.stopPropagation();
        const startX = event.clientX, startY = event.clientY;
        const drag = { startX, startY, x:startX, y:startY, active:false, target:null, targetAfter:false };
        const grid = widget.parentElement;
        try { handle.setPointerCapture(event.pointerId); } catch {}
        const clear = () => {
          document.removeEventListener('pointermove', move, true);
          document.removeEventListener('pointerup', finish, true);
          document.removeEventListener('pointercancel', finish, true);
          widget.classList.remove('is-dragging');
          document.querySelectorAll('.dashboard-widget.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
          widget.style.transform = ''; widget.style.pointerEvents = '';
        };
        const move = (ev) => {
          if (ev.pointerId !== event.pointerId) return;
          drag.x = ev.clientX; drag.y = ev.clientY;
          if (!drag.active && Math.hypot(drag.x-startX, drag.y-startY) > 5) {
            drag.active = true; widget.classList.add('is-dragging'); widget.style.pointerEvents = 'none';
          }
          if (!drag.active) return;
          widget.style.transform = `translate(${drag.x-startX}px, ${drag.y-startY}px)`;
          const hit = document.elementFromPoint(drag.x, drag.y)?.closest('.dashboard-widget');
          document.querySelectorAll('.dashboard-widget.is-drop-target').forEach((el) => { if (el !== hit) el.classList.remove('is-drop-target'); });
          drag.target = hit && hit !== widget && hit.parentElement === grid ? hit : null;
          if (drag.target) {
            drag.target.classList.add('is-drop-target');
            const siblings = [...grid.children].filter((item) => item.classList.contains('dashboard-widget') && !item.hidden);
            // Dropping on the previous card always inserts before it, so a one-step
            // move to the left cannot accidentally resolve to the current position.
            drag.targetAfter = siblings.indexOf(drag.target) > siblings.indexOf(widget);
          }
        };
        const finish = (ev) => {
          if (ev.pointerId !== event.pointerId) return;
          const shouldMove = drag.active && drag.target && drag.target.parentElement === grid;
          const beforeNode = shouldMove ? (drag.targetAfter ? drag.target.nextSibling : drag.target) : null;
          clear();
          if (shouldMove && beforeNode !== widget && beforeNode !== widget.nextSibling) animateGridMove(grid, widget, beforeNode);
          if (drag.active) { saveDashboardLayout(); ev.preventDefault(); }
        };
        document.addEventListener('pointermove', move, true);
        document.addEventListener('pointerup', finish, true);
        document.addEventListener('pointercancel', finish, true);
      });
      handle.addEventListener('keydown', (event) => {
        if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
        const grid = widget.parentElement; const visible = [...grid.children].filter((item) => !item.hidden);
        const index = visible.indexOf(widget); let next = index;
        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = Math.max(0,index-1); else next = Math.min(visible.length-1,index+1);
        if (next !== index && visible[next]) { event.preventDefault(); grid.insertBefore(widget, next < index ? visible[next] : visible[next].nextSibling); saveDashboardLayout(); handle.focus(); }
      });
    });
    const note = $('dashboardLayoutNote'); if (note) note.textContent = dashboardText('layout');
  }
  function animateGridMove(grid, movingWidget, beforeNode) {
    if (!grid || !movingWidget) return;
    const items = [...grid.children].filter((item) => item.classList?.contains('dashboard-widget') && !item.hidden);
    const beforeRects = new Map(items.map((item) => [item, item.getBoundingClientRect()]));
    grid.insertBefore(movingWidget, beforeNode || null);
    const afterItems = [...grid.children].filter((item) => item.classList?.contains('dashboard-widget') && !item.hidden);
    afterItems.forEach((item) => {
      const before = beforeRects.get(item); if (!before) return;
      const after = item.getBoundingClientRect(); const dx = before.left - after.left; const dy = before.top - after.top;
      if (!dx && !dy) return;
      item.style.transition = 'none'; item.style.transform = `translate(${dx}px, ${dy}px)`;
      item.getBoundingClientRect();
      requestAnimationFrame(() => {
        item.style.transition = 'transform 280ms cubic-bezier(.2,.75,.25,1)'; item.style.transform = 'translate(0,0)';
        const clean = () => { item.style.transition = ''; item.style.transform = ''; item.removeEventListener('transitionend', clean); };
        item.addEventListener('transitionend', clean); window.setTimeout(clean, 360);
      });
    });
  }
  function animateGridLayout(grid, mutate = () => {}) {
    if (!grid) return;
    const items = [...grid.children].filter((item) => item.classList?.contains('dashboard-widget') && !item.hidden);
    const before = new Map(items.map((item) => [item, item.getBoundingClientRect()]));
    mutate();
    requestAnimationFrame(() => items.forEach((item) => {
      if (!item.isConnected) return;
      const a = before.get(item), b = item.getBoundingClientRect(); if (!a || (!a.width && !a.height)) return;
      const dx = a.left - b.left, dy = a.top - b.top; if (!dx && !dy) return;
      item.style.transition = 'none'; item.style.transform = `translate(${dx}px, ${dy}px)`; item.getBoundingClientRect();
      requestAnimationFrame(() => { item.style.transition = 'transform 280ms cubic-bezier(.2,.75,.25,1)'; item.style.transform = 'translate(0,0)'; const clean = () => { item.style.transition=''; item.style.transform=''; item.removeEventListener('transitionend',clean); }; item.addEventListener('transitionend',clean); setTimeout(clean,360); });
    }));
  }
  let fullscreenWidgetState = null;
  function installWidgetFullscreen() {
    if ($('dashboardWidgetFullscreen')) return;
    const overlay = document.createElement('div'); overlay.id = 'dashboardWidgetFullscreen'; overlay.className = 'dashboard-widget-fullscreen-backdrop'; overlay.hidden = true;
    overlay.innerHTML = `<section class="dashboard-widget-fullscreen-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboardWidgetFullscreenTitle"><div class="dashboard-widget-fullscreen-bar"><h2 id="dashboardWidgetFullscreenTitle">${safe(dashboardText('fullscreenTitle'))}</h2><button type="button" class="dashboard-widget-fullscreen-close" aria-label="${safe(dashboardText('closeFullscreen'))}" title="${safe(dashboardText('closeFullscreen'))}">×</button></div><div class="dashboard-widget-fullscreen-content"></div></section>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.dashboard-widget-fullscreen-close').addEventListener('click', closeWidgetFullscreen);
    overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) closeWidgetFullscreen(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && fullscreenWidgetState) closeWidgetFullscreen(); });
    window.addEventListener('sc:language', () => { const title = $('dashboardWidgetFullscreenTitle'); const close = overlay.querySelector('.dashboard-widget-fullscreen-close'); if (title) title.textContent = dashboardText('fullscreenTitle'); if (close) { close.title = dashboardText('closeFullscreen'); close.setAttribute('aria-label', close.title); } });
  }
  function openWidgetFullscreen(widget, trigger) {
    if (fullscreenWidgetState) closeWidgetFullscreen();
    installWidgetFullscreen();
    const overlay = $('dashboardWidgetFullscreen'), content = overlay.querySelector('.dashboard-widget-fullscreen-content');
    const placeholder = document.createComment('dashboard-widget-position');
    widget.parentNode.insertBefore(placeholder, widget);
    const oldOverflow = document.body.style.overflow;
    fullscreenWidgetState = { widget, placeholder, oldOverflow, trigger };
    overlay.hidden = false; document.body.style.overflow = 'hidden';
    const visibleTitle = widget.querySelector('[data-dashboard-title], h2, h3')?.textContent?.trim();
    $('dashboardWidgetFullscreenTitle').textContent = visibleTitle || dashboardText('fullscreenTitle');
    content.appendChild(widget); widget.classList.add('is-fullscreen-widget');
    overlay.classList.add('is-open');
    overlay.querySelector('.dashboard-widget-fullscreen-close').focus();
  }
  function closeWidgetFullscreen() {
    if (!fullscreenWidgetState) return;
    const { widget, placeholder, oldOverflow, trigger } = fullscreenWidgetState;
    if (placeholder.parentNode) { placeholder.parentNode.insertBefore(widget, placeholder); placeholder.remove(); }
    widget.classList.remove('is-fullscreen-widget');
    const overlay = $('dashboardWidgetFullscreen'); overlay.hidden = true; overlay.classList.remove('is-open');
    document.body.style.overflow = oldOverflow; fullscreenWidgetState = null;
    saveDashboardLayout(); trigger?.focus?.();
  }

  function activateDashboardTab(tab) {
    if (!dashboardLayout) dashboardLayout = { active: 'games', order: {}, hidden: {} };
    dashboardLayout.active = tab === 'platform' ? 'platform' : 'games';
    applyDashboardLayout(); saveDashboardLayout();
  }
  function updateWidgetWidthControl(widget) {
    if (!widget) return;
    const button = widget.querySelector('[data-widget-width-toggle]');
    if (!button) return;
    const wide = widget.classList.contains('widget-wide');
    button.textContent = wide ? '><' : '↔';
    button.title = dashboardText(wide ? 'halfWidth' : 'resize');
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(wide));
  }
  function applyDashboardLayout() {
    const active = dashboardLayout.active || 'games';
    ['games','platform'].forEach((tab) => {
      const grid = $(`dashboard${tab === 'games' ? 'Games' : 'Platform'}Panel`); if (!grid) return;
      const order = dashboardLayout.order?.[tab] || [];
      order.forEach((id) => { const widget = [...grid.children].find((item) => item.dataset.widgetId === id); if (widget) grid.appendChild(widget); });
      [...grid.children].forEach((widget) => {
        const hidden = (dashboardLayout.hidden?.[tab] || []).includes(widget.dataset.widgetId);
        widget.hidden = hidden;
        if (Object.prototype.hasOwnProperty.call(dashboardLayout.widths || {}, widget.dataset.widgetId)) {
          widget.classList.toggle('widget-wide', Boolean(dashboardLayout.widths[widget.dataset.widgetId]));
        }
        updateWidgetWidthControl(widget);
      });
      grid.hidden = tab !== active;
      const tabButton = $(`dashboard${tab === 'games' ? 'Games' : 'Platform'}Tab`);
      if (tabButton) { tabButton.setAttribute('aria-selected', String(tab === active)); tabButton.classList.toggle('secondary', tab !== active); }
    });
    renderDashboardRestoreList();
  }
  function saveDashboardLayout() {
    if (!dashboardLayout) return;
    ['games','platform'].forEach((tab) => {
      const grid = $(`dashboard${tab === 'games' ? 'Games' : 'Platform'}Panel`); if (!grid) return;
      dashboardLayout.order[tab] = [...grid.children].map((widget) => widget.dataset.widgetId).filter(Boolean);
      dashboardLayout.hidden[tab] = [...grid.children].filter((widget) => widget.hidden).map((widget) => widget.dataset.widgetId);
      dashboardLayout.widths = { ...(dashboardLayout.widths || {}) };
      [...grid.children].forEach((widget) => { dashboardLayout.widths[widget.dataset.widgetId] = widget.classList.contains('widget-wide'); });
    });
    try { localStorage.setItem(dashboardLayoutKey, JSON.stringify(dashboardLayout)); } catch {}
    renderDashboardRestoreList();
  }
  function renderDashboardRestoreList() {
    const box = $('dashboardHiddenWidgets'), list = $('dashboardRestoreList'); if (!box || !list || !dashboardLayout) return;
    const hiddenItems = [];
    ['games','platform'].forEach((tab) => { const grid = $(`dashboard${tab === 'games' ? 'Games' : 'Platform'}Panel`); [...(grid?.children || [])].filter((w) => w.hidden).forEach((w) => hiddenItems.push({ tab, id: w.dataset.widgetId, title: w.querySelector('[data-dashboard-title], h2, h3')?.textContent || w.dataset.widgetId })); });
    box.hidden = !hiddenItems.length;
    const strong = box.querySelector('strong'); if (strong) strong.textContent = dashboardText('restore');
    list.innerHTML = hiddenItems.map((item) => `<button class="dashboard-restore-button" type="button" data-restore-widget="${safe(item.id)}">${safe(item.title)} +</button>`).join('');
    list.querySelectorAll('[data-restore-widget]').forEach((button) => button.addEventListener('click', () => { const widget = document.querySelector(`[data-widget-id="${CSS.escape(button.dataset.restoreWidget)}"]`); if (widget) widget.hidden = false; saveDashboardLayout(); }));
  }
  function stat(label, value, sub = '', format = {}) {
    const number = typeof value === 'number' && Number.isFinite(value);
    const decimals = Math.max(0, Math.min(3, Number(format.decimals || 0)));
    const suffix = String(format.suffix || '');
    const numberMarkup = number ? `<span data-counter-target="${value}" data-counter-decimals="${decimals}" data-counter-suffix="${safe(suffix)}">0</span>` : safe(value);
    return `<div class="stat"><div class="stat-label">${safe(label)}</div><div class="stat-value">${numberMarkup}</div>${sub ? `<div class="small muted">${safe(sub)}</div>` : ''}</div>`;
  }
  function animatedNumber(value) { return `<span data-counter-target="${Math.max(0, Number(value || 0))}">0</span>`; }
  function animatedTime(seconds) { return `<span data-time-target="${Math.max(0, Number(seconds || 0))}">0 sec</span>`; }
  function statTime(label, seconds) { return `<div class="stat"><div class="stat-label">${safe(label)}</div><div class="stat-value">${animatedTime(seconds)}</div></div>`; }
  function animateCounters() {
    const locale = window.SC.language === 'ru' ? 'ru-RU' : 'en-US';
    document.querySelectorAll('[data-counter-target]').forEach((node) => {
      const target = Math.max(0, Number(node.dataset.counterTarget || 0));
      const decimals = Math.max(0, Math.min(3, Number(node.dataset.counterDecimals || 0)));
      const suffix = node.dataset.counterSuffix || '';
      const start = performance.now();
      const duration = 720;
      const step = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - p) ** 3;
        const scale = 10 ** decimals;
        const value = Math.round(target * eased * scale) / scale;
        node.textContent = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    document.querySelectorAll('[data-time-target]').forEach((node) => {
      const target = Math.max(0, Number(node.dataset.timeTarget || 0));
      const start = performance.now();
      const duration = 720;
      const step = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - p) ** 3;
        node.textContent = window.SC.formatTime(target * eased);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  function barChart(id, items, key) {
    const root = $(id);
    if (!root) return;
    const max = Math.max(1, ...items.map((game) => Number(game.metrics?.[key] || 0)));
    root.innerHTML = items.length ? items.slice(0, 8).map((game) => {
      const value = Number(game.metrics?.[key] || 0);
      return `<div class="metric-bar-line"><span class="metric-bar-label" title="${safe(game.title)}">${safe(game.title)}</span><div class="metric-bar-track"><div class="metric-bar-fill" style="width:${Math.max(0, Math.min(100, value / max * 100))}%"></div></div><span class="metric-bar-value">${num(value)}</span></div>`;
    }).join('') : `<p class="small muted">${safe(t('Нет данных', 'No data yet'))}</p>`;
  }
  function shortDate(value, daily = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    return date.toLocaleDateString(window.SC.language === 'ru' ? 'ru-RU' : 'en-US', daily ? { day: '2-digit', month: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
  }
  function lineChart(id, series, { daily = false, legendId = null, emptyMessage = null } = {}) {
    const root = $(id);
    if (!root) return;
    const valid = (series || []).map((item) => ({ ...item, points: (item.points || []).filter((p) => Number.isFinite(Number(p.value))) })).filter((item) => item.points.length);
    if (!valid.length) {
      root.innerHTML = `<p class="small muted">${safe(emptyMessage || t('История появится после накопления данных.', 'History will appear after data starts accumulating.'))}</p>`;
      if (legendId && $(legendId)) $(legendId).innerHTML = '';
      return;
    }
    const width = 760, height = 220, left = 42, right = 12, top = 12, bottom = 32;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const max = Math.max(1, ...valid.flatMap((item) => item.points.map((point) => Number(point.value))));
    const min = 0;
    const xAt = (index, length) => left + (length <= 1 ? plotWidth / 2 : (index / (length - 1)) * plotWidth);
    const yAt = (value) => top + plotHeight - ((Number(value) - min) / (max - min || 1)) * plotHeight;
    const grid = [0, .25, .5, .75, 1].map((ratio) => {
      const y = top + plotHeight * ratio;
      const label = Math.round(max * (1 - ratio));
      return `<line class="grid-line" x1="${left}" y1="${y}" x2="${width-right}" y2="${y}"/><text class="axis-label" x="${left-8}" y="${y+3}" text-anchor="end">${num(label)}</text>`;
    }).join('');
    const xLabels = valid[0].points.filter((_, i, arr) => i === 0 || i === arr.length - 1 || i === Math.floor(arr.length / 3) || i === Math.floor(2 * arr.length / 3)).map((point) => {
      const index = valid[0].points.indexOf(point);
      return `<text class="axis-label" x="${xAt(index, valid[0].points.length)}" y="${height-8}" text-anchor="middle">${safe(shortDate(daily ? point.at : point.at, daily))}</text>`;
    }).join('');
    const lines = valid.map((item, seriesIndex) => {
      const coords = item.points.map((point, i) => `${xAt(i, item.points.length)},${yAt(point.value)}`).join(' ');
      const color = item.color || palette[seriesIndex % palette.length];
      return `<polyline class="chart-line" points="${coords}" stroke="${color}"><title>${safe(item.name)}</title></polyline>`;
    }).join('');
    root.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${safe(daily ? 'Daily unique players history' : 'Concurrent players history')}">${grid}${lines}${xLabels}</svg>`;
    if (legendId && $(legendId)) $(legendId).innerHTML = valid.map((item, i) => `<span><i style="background:${item.color || palette[i % palette.length]}"></i>${safe(item.name)}</span>`).join('');
  }
  function renderTrends(history) {
    const h = history || {};
    $('platformCcuSummary').textContent = t(`Сейчас активно: ${num(h.currentCcu || 0)} · последний снимок: ${num(h.latestCcuSnapshot || 0)}.`, `Currently active: ${num(h.currentCcu || 0)} · latest stored snapshot: ${num(h.latestCcuSnapshot || 0)}.`);
    lineChart('platformCcuChart', [{ name: 'Platform CCU', color: palette[0], points: (h.ccu24h || []).map((p) => ({ at: p.at, value: p.ccu })) }], { emptyMessage: t('Снимки CCU начнут накапливаться после запуска сервера и первого heartbeat.', 'CCU snapshots start accumulating after the server starts and the first heartbeat arrives.') });
    lineChart('dailyPlayersChart', [{ name: 'Daily players', color: palette[1], points: (h.dailyPlayers30d || []).map((p) => ({ at: p.day, value: p.players })) }], { daily: true, emptyMessage: t('Пока нет игровых сессий за последние 30 дней.', 'There are no play sessions in the last 30 days yet.') });
    lineChart('dailyPlayers7dChart', [{ name: t('Игроки в день', 'Players per day'), color: palette[2], points: (h.dailyPlayers30d || []).slice(-7).map((p) => ({ at: p.day, value: p.players })) }], { daily: true, emptyMessage: t('Данные за 7 дней появятся после первых игровых сессий.', 'The seven-day chart will appear after the first play sessions.') });
    const entries = Object.entries(h.games24h || {}).sort((a, b) => (b[1].points?.length || 0) - (a[1].points?.length || 0)).slice(0, 6);
    lineChart('gameCcuHistoryChart', entries.map(([slug, item], i) => ({ name: item.title || slug, color: palette[i % palette.length], points: (item.points || []).map((p) => ({ at: p.at, value: p.ccu })) })), { legendId: 'gameCcuLegend', emptyMessage: t('История CCU по играм появится после записи первых минутных снимков.', 'Per-game CCU history appears after the first minute snapshots are stored.') });
    const gameCcu = (h.gamePlayersToday || []).slice().sort((a, b) => Number(b.players || 0) - Number(a.players || 0)).slice(0, 10);
    const pieRoot = $('gameCcuNowChart');
    if (pieRoot) {
      if (!gameCcu.length) { pieRoot.innerHTML = `<p class="small muted">${safe(t('Нет опубликованных игр.', 'No published games.'))}</p>`; }
      else {
        const values = gameCcu.map(g => Math.max(0, Number(g.players || 0)));
        const playerMetricLabel = t('уникальных игроков сегодня','unique players today');
        const total = values.reduce((a,b)=>a+b,0);
        const wedges = [];
        let angle = -Math.PI / 2;
        const point = (a,r=94) => [150 + Math.cos(a)*r, 120 + Math.sin(a)*r];
        gameCcu.forEach((g,i) => {
          const value = values[i]; if (!total || !value) return;
          const end = angle + value / total * Math.PI * 2;
          const [x1,y1] = point(angle), [x2,y2] = point(end);
          const large = end-angle > Math.PI ? 1 : 0;
          const path = `M 150 120 L ${x1.toFixed(2)} ${y1.toFixed(2)} A 94 94 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
          const color = palette[i % palette.length];
          wedges.push(`<path class="ccu-pie-slice" tabindex="0" role="img" aria-label="${safe(g.title)}: ${num(value)} ${safe(playerMetricLabel)}" d="${path}" fill="${color}"><title>${safe(g.title)} — ${num(value)} ${safe(playerMetricLabel)}</title></path>`);
          angle = end;
        });
        const legend = gameCcu.map((g,i)=>`<div class="ccu-pie-legend-row" title="${safe(g.title)} — ${num(values[i])} ${safe(playerMetricLabel)}"><span class="ccu-pie-dot" style="background:${palette[i%palette.length]}"></span><span>${safe(g.title)}</span><strong>${num(values[i])}</strong></div>`).join('');
        const blank = total === 0 ? `<circle cx="150" cy="120" r="94" fill="var(--line)"><title>${safe(t('Сегодня ещё нет игровых сессий','No play sessions recorded today'))}</title></circle>` : '';
        pieRoot.innerHTML = `<div class="ccu-pie-layout"><svg viewBox="0 0 300 240" role="img" aria-label="${safe(t('Уникальные игроки за сегодня по играм','Unique players today by game'))}">${blank}${wedges.join('')}</svg><div class="ccu-pie-legend">${legend}<p class="small muted">${safe(t('Наведите на сектор, чтобы увидеть игру и число уникальных игроков за сегодня.','Hover a slice to see the game and unique players today.'))}</p></div></div>`;
      }
    }
  }
  function populateMedianRatingFilters(games) {
    const tag = $('medianTagFilter'); if (!tag) return;
    const current = tag.value;
    const tags = [...new Set(games.flatMap((game) => {
      const arr = game.tagsEn || game.tags || [];
      return arr.map((item) => String(item).trim()).filter(Boolean);
    }))].sort((a,b) => a.localeCompare(b, window.SC.language === 'ru' ? 'ru' : 'en'));
    tag.innerHTML = `<option value="">${safe(t('Все теги','All tags'))}</option>` + tags.map((item) => `<option value="${safe(item)}">${safe(item)}</option>`).join('');
    if (tags.includes(current)) tag.value = current;
    $('medianPlayersFilter')?.querySelectorAll('option').forEach((option, i) => {
      const labels = window.SC.language === 'ru' ? ['Любое число игроков','Один игрок','Несколько игроков'] : ['Any player count','Single-player','Multiplayer'];
      option.textContent = labels[i] || option.textContent;
    });
    $('medianRatingFilter')?.querySelectorAll('option').forEach((option, i) => {
      const labels = window.SC.language === 'ru' ? ['Любая оценка','3+ ★','4+ ★','4.5+ ★'] : ['Any rating','3+ ★','4+ ★','4.5+ ★']; option.textContent = labels[i] || option.textContent;
    });
    $('medianSortFilter')?.querySelectorAll('option').forEach((option, i) => {
      const labels = window.SC.language === 'ru' ? ['Сначала новые','По рейтингу','По медиане'] : ['Newest first','By rating','By median']; option.textContent = labels[i] || option.textContent;
    });
  }
  function renderMedianRating(games) {
    const root = $('medianRatingChart'); if (!root) return;
    const tag = $('medianTagFilter')?.value || '';
    const playersFilter = $('medianPlayersFilter')?.value || 'any';
    const minRating = Number($('medianRatingFilter')?.value || 0);
    const sort = $('medianSortFilter')?.value || 'newest';
    let items = (games || []).filter((game) => {
      if (game.status !== 'published') return false;
      const tags = game.tagsEn || game.tags || [];
      if (tag && !tags.includes(tag)) return false;
      if (playersFilter === 'solo' && Number(game.maxPlayers || 1) > 1) return false;
      if (playersFilter === 'multi' && Number(game.maxPlayers || 1) <= 1) return false;
      return Number(game.metrics?.averageRating || 0) >= minRating;
    });
    items.sort((a,b) => sort === 'rating' ? Number(b.metrics?.averageRating||0)-Number(a.metrics?.averageRating||0) : sort === 'median' ? Number(b.metrics?.medianPlayMinutes||0)-Number(a.metrics?.medianPlayMinutes||0) : String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    if (!items.length) { root.innerHTML = `<p class="small muted">${safe(t('Нет игр по выбранным фильтрам.','No games match the selected filters.'))}</p>`; return; }
    const medianMax = Math.max(1,...items.map((g)=>Number(g.metrics?.medianPlayMinutes||0)));
    root.innerHTML = items.slice(0,12).map((game) => {
      const median = Number(game.metrics?.medianPlayMinutes||0), rating = Number(game.metrics?.averageRating||0);
      return `<article class="median-rating-row"><div class="median-rating-game">${safe(game.title)}<div class="small muted">${safe(game.slug)}</div></div><div class="median-rating-bars"><div class="median-rating-line"><span>${safe(t('Медиана','Median'))}</span><div class="median-rating-track"><div class="median-rating-fill" style="width:${Math.min(100,median/medianMax*100)}%"></div></div><strong>${median.toFixed(1)} ${safe(t('мин','min'))}</strong></div><div class="median-rating-line"><span>${safe(t('Оценка','Rating'))}</span><div class="median-rating-track"><div class="median-rating-fill rating" style="width:${Math.min(100,rating/5*100)}%"></div></div><strong>${rating.toFixed(1)} ★</strong></div></div></article>`;
    }).join('');
  }
  async function load() {
    const boot = await window.SC.ready;
    if (!boot?.user || !boot.user.isAdmin) { location.replace('/login.html?error=admin'); return; }
    const data = await window.SC.api('/api/admin/metrics');
    metrics = data; players = data.leaderboard || [];
    const totalTime = window.SC.formatTime(data.totalPlaySeconds || 0);
    $('metricsUpdated').textContent = t('Аккаунты, время и события считаются на сервере. Всего активного игрового времени: ', 'Accounts, playtime and events are calculated server-side. Total active playtime: ') + totalTime;
    $('globalStats').innerHTML = [
      stat(t('Аккаунты', 'Accounts'), Number(data.users || 0)), stat(t('Игр всего', 'All games'), Number(data.games || 0)),
      stat(t('Опубликовано', 'Published'), Number(data.publishedGames || 0)), stat(t('Черновики', 'Drafts'), Number(data.draftGames || 0))
    ].join('');
    $('globalStatsSecondary').innerHTML = [
      stat(t('Уникальные игроки', 'Unique players'), Number(data.uniquePlayers || 0)), stat(t('Игровые сессии', 'Play sessions'), Number(data.sessions || 0)),
      stat(t('Игроки сегодня', 'Players today'), Number((data.history?.dailyPlayers30d || []).slice(-1)[0]?.players || 0)), stat(t('Средняя оценка', 'Average rating'), Number(data.averageRating || 0), `${num(data.ratings)} ${t('оценок', 'ratings')}`, { decimals: 2, suffix: ' ★' }),
      stat(t('Отзывы', 'Reviews'), Number(data.reviews || 0)), stat(t('Внутриигровые клики', 'In-game clicks'), Number(data.clicks || 0)),
      stat(t('Переходы из каталога', 'Catalog clicks'), Number(data.catalogClicks || 0)), stat(t('Поделиться', 'Share events'), Number(data.shareEvents || 0), `${num(data.sharedPlayers)} ${t('игроков делились', 'players shared')}`), stat(t('Избранное', 'Favourites'), Number(data.favorites || 0)), stat(t('Начато уровней', 'Levels started'), Number(data.levelStarts || 0)), stat(t('Завершено уровней', 'Levels completed'), Number(data.levelCompletions || 0)), stat(t('Доля завершения', 'Completion rate'), Number(data.levelCompletionRate || 0), '', { decimals: 1, suffix: '%' })
    ].join('');
    const games = data.gamesMetrics || [];
    metricGames = games;
    populateMedianRatingFilters(games);
    renderMedianRating(games);
    ['medianTagFilter','medianPlayersFilter','medianRatingFilter','medianSortFilter'].forEach((id) => $(id)?.addEventListener('change', () => renderMedianRating(games)));
    barChart('gamePlaysChart', games, 'sessions'); barChart('gameSharesChart', games, 'shareEvents'); renderTrends(data.history);
    $('adminLeaderboardBody').innerHTML = players.length ? players.map((p) => `<tr data-player="${Number(p.id)}"><td><strong>${safe(p.rank)}</strong></td><td><div class="admin-game-cell">${p.avatar ? `<img class="player-avatar" src="${safe(p.avatar)}" alt="">` : ''}<div><strong>${safe(p.nickname || '—')}</strong></div></div></td><td><strong>${animatedNumber(p.points)}</strong><div class="small muted">${animatedNumber(p.reviewPoints)} ${t('за отзывы', 'review points')}</div></td><td>${animatedTime(p.totalSeconds)}</td><td>${animatedNumber(p.gamesPlayed)}</td><td>${animatedNumber(p.reviewCount)}</td><td>${animatedNumber(p.favoritePoints)}</td><td>${animatedNumber(p.sharePoints)}</td></tr>`).join('') : `<tr><td colspan="8">${safe(t('Пока нет данных', 'No data yet'))}</td></tr>`;
    $('adminLeaderboardBody').querySelectorAll('[data-player]').forEach((row) => row.addEventListener('click', () => openPlayer(Number(row.dataset.player))));
    $('gameMetricRows').innerHTML = games.map((g) => `<tr><td><strong>${safe(g.title)}</strong><div class="small muted">${safe(g.slug)}</div></td><td>${safe(g.status)}</td><td>${animatedNumber(g.metrics.uniquePlayers)}</td><td>${animatedNumber(g.metrics.sessions)}</td><td>${animatedTime(g.metrics.totalPlaySeconds)}</td><td><span data-counter-target="${Number(g.metrics.averageRating || 0)}" data-counter-decimals="2" data-counter-suffix=" ★">0</span> (${animatedNumber(g.metrics.ratingsCount)})</td><td>${animatedNumber(g.metrics.reviewsCount)}</td><td>${animatedNumber(g.metrics.shareEvents)}<div class="small muted">${animatedNumber(g.metrics.sharedPlayers)} ${t('игроков', 'players')}</div></td><td>${animatedNumber(g.metrics.favorites)}</td></tr>`).join('') || '<tr><td colspan="9">—</td></tr>';
    animateCounters();
  }
  async function openPlayer(id) {
    try {
      selectedPlayer = id;
      const data = await window.SC.api(`/api/admin/players/${id}`);
      const u = data.user;
      $('deletePlayerButton').hidden = Boolean(u.isAdmin); $('playerAvatar').src = u.avatar_url || '/favicon.svg'; $('playerTitle').textContent = u.display_name || u.public_id; $('playerSub').textContent = `${u.public_id}`;
      $('playerDetailBody').innerHTML = `<details class="player-detail-block" open><summary>${t('Основная статистика', 'Overview')}</summary><div class="player-detail-block-content"><div class="player-detail-grid">${stat(t('Очки', 'Points'), Number(data.score?.points || 0))}${statTime(t('Общее время', 'Total playtime'), data.totals.seconds)}${stat(t('Сессии', 'Sessions'), Number(data.totals.sessions))}${stat(t('Сыграно игр', 'Games played'), Number(data.totals.games))}${stat(t('Отзывы', 'Reviews'), Number(data.reviews))}${stat(t('Избранное', 'Favourites'), Number(data.favorites))}${stat(t('Сохранения', 'Cloud saves'), Number(data.saves))}${stat(t('Дата регистрации', 'Joined'), new Date(u.created_at).toLocaleDateString())}</div></div></details><details class="player-detail-block" open><summary>${t('Игры и время', 'Games and playtime')}</summary><div class="player-detail-block-content"><div class="table-wrap"><table style="min-width:0"><thead><tr><th>${t('Игра', 'Game')}</th><th>${t('Время', 'Time')}</th><th>${t('Запуски', 'Sessions')}</th></tr></thead><tbody>${(data.games || []).map((g) => `<tr><td>${safe(g.title)}</td><td>${animatedTime(g.seconds)}</td><td>${animatedNumber(g.sessions)}</td></tr>`).join('') || '<tr><td colspan="3">—</td></tr>'}</tbody></table></div></div></details><details class="player-detail-block" open><summary>${t('Игры, которыми поделился игрок', 'Games shared by this player')}</summary><div class="player-detail-block-content"><div class="table-wrap"><table style="min-width:0"><thead><tr><th>${t('Игра', 'Game')}</th><th>${t('Переходы поделиться', 'Share actions')}</th><th>${t('Последний раз', 'Last shared')}</th></tr></thead><tbody>${(data.sharedGames || []).map((g) => `<tr><td><a href="/games/${encodeURIComponent(g.slug)}" target="_blank" rel="noreferrer">${safe(g.title)}</a></td><td>${animatedNumber(g.shareEvents)}</td><td>${safe(new Date(g.lastShared).toLocaleString(window.SC.language === 'ru' ? 'ru-RU' : 'en-US'))}</td></tr>`).join('') || `<tr><td colspan="3">${t('Нет зарегистрированных действий', 'No share events recorded')}</td></tr>`}</tbody></table></div></div></details>`;
      $('emailMessage').textContent = ''; $('playerModal').classList.remove('hidden'); document.body.style.overflow = 'hidden'; applyTemplate(); animateCounters();
    } catch (error) { window.SC.toast(error.message, true); }
  }
  function renderAllPlayers() {
    const query = String($('allPlayersSearch')?.value || '').trim().toLowerCase();
    const filtered = allPlayers.filter((player) => [player.nickname, player.email, player.playerId].some((value) => String(value || '').toLowerCase().includes(query)));
    $('allPlayersCount').textContent = t(`${num(filtered.length)} из ${num(allPlayers.length)} игроков`, `${num(filtered.length)} of ${num(allPlayers.length)} players`);
    $('allPlayersBody').innerHTML = filtered.length ? filtered.map((player, index) => `<tr data-player-href="/admin/player?id=${Number(player.id)}" tabindex="0"><td>${num(index + 1)}</td><td><div class="admin-game-cell">${player.avatar ? `<img class="player-avatar" src="${safe(player.avatar)}" alt="">` : ''}<div><strong>${safe(player.nickname || '—')}</strong><div class="small muted">${safe(player.playerId || '')}</div></div></div></td><td>${safe(player.email)}</td><td>${safe(player.createdAt ? new Date(player.createdAt).toLocaleDateString(window.SC.language === 'ru' ? 'ru-RU' : 'en-US') : '—')}</td><td><strong>${animatedNumber(player.points)}</strong></td><td>${animatedTime(player.totalSeconds)}</td><td>${animatedNumber(player.gamesPlayed)}</td><td>${animatedNumber(player.sessions)}</td></tr>`).join('') : `<tr><td colspan="8">${safe(t('Игроки не найдены.', 'No players found.'))}</td></tr>`;
    $('allPlayersBody').querySelectorAll('[data-player-href]').forEach((row) => {
      const open = () => { location.href = row.dataset.playerHref; };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    });
  }
  async function loadAllPlayers() {
    $('allPlayersBody').innerHTML = `<tr><td colspan="8">${safe(t('Загрузка…', 'Loading…'))}</td></tr>`;
    const data = await window.SC.api('/api/admin/players');
    allPlayers = data.players || [];
    renderAllPlayers();
  }
  function activateAnalyticsPage(page) {
    const showPlayers = page === 'players';
    analyticsPage = showPlayers ? 'players' : 'metrics';
    $('metricsOverviewView').hidden = showPlayers;
    $('allPlayersView').hidden = !showPlayers;
    const activeDashboard = dashboardLayout?.active || 'games';
    for (const [id, selected] of [['dashboardGamesTab', !showPlayers && activeDashboard === 'games'], ['dashboardPlatformTab', !showPlayers && activeDashboard === 'platform'], ['allPlayersTab', showPlayers]]) {
      const button = $(id);
      button?.setAttribute('aria-selected', String(selected));
      button?.classList.toggle('secondary', !selected);
    }
    if (showPlayers && !allPlayers.length) loadAllPlayers().catch((error) => window.SC.toast(error.message, true));
  }
  function updateAnalyticsTabLabels() {
    $('allPlayersTab').textContent = t('Все игроки', 'All players');
    $('allPlayersView').querySelector('h2').textContent = t('Все игроки', 'All players');
    $('allPlayersSearch').placeholder = t('Поиск по имени, email или ID', 'Search by name, email or ID');
    const headers = ['#', t('Игрок', 'Player'), 'Email', t('Регистрация', 'Joined'), t('Очки', 'Points'), t('Время', 'Playtime'), t('Игр', 'Games'), t('Сессий', 'Sessions')];
    $('allPlayersView').querySelectorAll('thead th').forEach((cell, index) => { cell.textContent = headers[index] || ''; });
    if (allPlayers.length) renderAllPlayers();
  }
  $('deletePlayerButton')?.addEventListener('click', async () => {
    if (!selectedPlayer || !window.confirm(t('Удалить аккаунт этого игрока и все связанные данные? Это нельзя отменить.', 'Delete this player account and all related data? This cannot be undone.'))) return;
    const button = $('deletePlayerButton'); button.disabled = true;
    try { await window.SC.api(`/api/admin/players/${selectedPlayer}`, { method: 'DELETE', body: {} }); closePlayer(); await load(); window.SC.toast(t('Аккаунт удалён.', 'Account deleted.')); }
    catch (error) { window.SC.toast(error.message, true); } finally { button.disabled = false; }
  });
  function closePlayer() { $('playerModal').classList.add('hidden'); document.body.style.overflow = ''; selectedPlayer = null; }
  function applyTemplate() {
    const lang = window.SC.language;
    const templates = {
      welcome: { subject: lang === 'ru' ? 'Добро пожаловать в SUPER CUBE Games' : 'Welcome to SUPER CUBE Games', html: lang === 'ru' ? '<p>Привет!</p><p>Спасибо, что играешь на <strong>SUPER CUBE Games</strong>. Надеемся, ты найдёшь здесь следующую любимую игру.</p><p>Хорошей игры! 🎮</p>' : '<p>Hello!</p><p>Thanks for playing <strong>SUPER CUBE Games</strong>. We hope you discover your next favourite game here.</p><p>Have fun! 🎮</p>' },
      feedback: { subject: lang === 'ru' ? 'Спасибо за обратную связь' : 'Thanks for your feedback', html: lang === 'ru' ? '<p>Спасибо за отзыв и помощь в развитии платформы.</p><p>Мы ценим время, которое ты уделяешь играм и сообществу.</p>' : '<p>Thank you for your feedback and for helping improve the platform.</p><p>We appreciate the time you spend with our games and community.</p>' },
      update: { subject: lang === 'ru' ? 'Новости SUPER CUBE Games' : 'SUPER CUBE Games update', html: lang === 'ru' ? '<p>Привет!</p><p>В SUPER CUBE Games появились обновления.</p><ul><li>Новые игры и улучшения интерфейса</li><li>Более точная статистика игрового времени</li></ul>' : '<p>Hello!</p><p>There are updates on SUPER CUBE Games.</p><ul><li>New games and interface improvements</li><li>More accurate playtime statistics</li></ul>' }, custom: { subject: '', html: '' }
    };
    const selected = templates[$('emailTemplate').value]; $('emailSubject').value = selected.subject; $('emailBody').innerHTML = selected.html;
  }
  document.querySelectorAll('[data-format]').forEach((button) => button.addEventListener('click', () => { $('emailBody').focus(); document.execCommand(button.dataset.format, false, null); }));
  $('emailTemplate').addEventListener('change', applyTemplate); $('closePlayerModal').addEventListener('click', closePlayer);
  $('playerModal').addEventListener('click', (event) => { if (event.target === $('playerModal')) closePlayer(); });
  $('sendPlayerEmail').addEventListener('click', async () => {
    if (!selectedPlayer) return;
    const button = $('sendPlayerEmail'); button.disabled = true; $('emailMessage').textContent = t('Отправляем…', 'Sending…');
    try { await window.SC.api(`/api/admin/players/${selectedPlayer}/email`, { method: 'POST', body: { subject: $('emailSubject').value, html: $('emailBody').innerHTML } }); $('emailMessage').textContent = t('Письмо отправлено.', 'Email sent.'); }
    catch (error) { $('emailMessage').textContent = error.message; }
    finally { button.disabled = false; }
  });
  initDashboardLayout();
  $('allPlayersTab').addEventListener('click', () => activateAnalyticsPage('players'));
  $('allPlayersSearch').addEventListener('input', renderAllPlayers);
  updateAnalyticsTabLabels();
  if (new URLSearchParams(location.search).get('tab') === 'players') activateAnalyticsPage('players');
  $('refreshMetrics').addEventListener('click', () => load().catch((error) => window.SC.toast(error.message, true)));
  window.addEventListener('sc:language', () => { updateAnalyticsTabLabels(); load().catch(() => {}); });
  window.SC.ready.then(load).catch((error) => window.SC.toast(error.message, true));
})();


(() => { const $=id=>document.getElementById(id); const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); const tr=(ru,en)=>window.SC.language==='ru'?ru:en; async function loadMonitoring(){try{const boot=await window.SC.ready;if(!boot?.user?.isAdmin)return;const d=await window.SC.api('/api/admin/monitoring');$('monitoringStatus').innerHTML=`<div class="metric-panel"><h2>${esc(tr('Платформа','Platform'))}</h2><strong>${esc(d.platform.status)}</strong><p class="metrics-note">${esc(tr('Работает','Uptime'))} ${Math.floor(d.platform.uptimeSeconds/60)} ${esc(tr('мин','min'))} · RSS ${(d.platform.memoryBytes/1048576).toFixed(1)} MB</p></div><div class="metric-panel"><h2>${esc(tr('Серверные игры','Server games'))}</h2><strong>${d.serverGames.length}</strong><p class="metrics-note">${esc(tr('Проверено','Checked'))} ${esc(d.checkedAt)}</p></div><div class="metric-panel"><h2>${esc(tr('События','Events'))}</h2><strong>${d.recentEvents.length}</strong><p class="metrics-note">${esc(tr('Последние 100 событий приложения','Last 100 application events'))}</p></div>`;$('monitoringGames').innerHTML=d.serverGames.length?d.serverGames.map(g=>`<tr><td>${esc(g.title)} <span class="small muted">${esc(g.slug)}</span></td><td>${esc(g.status)}</td><td>${esc(g.runtimeStatus||g.status||'unknown')}</td><td>${esc(g.error || (g.pingMs!=null?`${tr('Пинг','Ping')}: ${g.pingMs} ms`:tr('Нет диагностики runtime','No runtime diagnostics')))}</td></tr>`).join(''):`<tr><td colspan="4">${esc(tr('Нет серверных игр','No server games'))}</td></tr>`;$('monitoringEvents').innerHTML=d.recentEvents.length?d.recentEvents.map(e=>`<tr><td>${esc(e.createdAt)}</td><td>${esc(e.title||e.slug||'—')}</td><td>${esc(e.eventType)}</td><td>${esc(e.source||'—')}</td></tr>`).join(''):`<tr><td colspan="4">${esc(tr('Нет недавних событий','No recent events'))}</td></tr>`;const errors=Array.isArray(d.errors)?d.errors:[];const errorRoot=$('monitoringErrors');if(errorRoot)errorRoot.innerHTML=errors.length?errors.map(e=>`<article class="monitor-error-item"><strong>${esc(e.scope||'platform')} · ${esc(e.title||e.path||e.eventType||'Error')}</strong><div>${esc(e.message||e.detail||e.eventType||'Runtime error')}</div><div class="muted">${esc(e.at||e.createdAt||'')} ${e.status?`· HTTP ${esc(e.status)}`:''}</div></article>`).join(''):`<p class="small muted">${esc(window.SC.language==='ru'?'Ошибок по доступным источникам не обнаружено.':'No errors were reported by available sources.')}</p>`;}catch(e){$('monitoringStatus').innerHTML=`<div class="metric-panel">${esc(tr('Мониторинг недоступен','Monitoring unavailable'))}: ${esc(e.message)}</div>`}}document.addEventListener('DOMContentLoaded',()=>{ $('refreshMonitoring')?.addEventListener('click',loadMonitoring); loadMonitoring(); });window.addEventListener('sc:language',()=>loadMonitoring());})();

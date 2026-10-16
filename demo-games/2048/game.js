(() => {
  'use strict';
  const SIZE = 4;
  const boardElement = document.getElementById('board');
  const scoreElement = document.getElementById('score');
  const bestElement = document.getElementById('best');
  const undoButton = document.getElementById('undo');
  const overlay = document.getElementById('overlay');
  const gameStatus = document.getElementById('gameStatus');
  const BEST_KEY = 'sc-2048-best';
  const inPlatformFrame = window.parent !== window;
  const messages = {
    ru: { edition:'ГОЛОВОЛОМКА № 01', eyebrow:'СДВИГАЙ · ОБЪЕДИНЯЙ · ПОВТОРЯЙ', intro:'Соединяй одинаковые плитки. Дойди до 2048.', score:'СЧЁТ', best:'РЕКОРД', newGame:'Новая игра', undo:'Отменить ход', hint:'Стрелки или WASD для хода', status:'УДАЧНОЙ ИГРЫ', continue:'Продолжить игру', again:'Играть снова', winEyebrow:'ПОБЕДА', won:'ПЛИТКА 2048 НАЙДЕНА', out:'ХОДЫ ЗАКОНЧИЛИСЬ', undoDone:'ХОД ОТМЕНЁН', free:'ТЕПЕРЬ БЕЗ ОГРАНИЧЕНИЙ', empty:'пусто', over:'ИГРА ОКОНЧЕНА', continueButton:'Продолжить' },
    en: { edition:'PUZZLE № 01', eyebrow:'SLIDE · MERGE · REPEAT', intro:'Join matching tiles. Reach 2048.', score:'SCORE', best:'BEST', newGame:'New game', undo:'Undo move', hint:'Use arrows or WASD to move', status:'HAVE A NICE GAME', continue:'Keep playing', again:'Play again', winEyebrow:'YOU WIN', won:'2048 TILE FOUND', out:'NO MORE MOVES', undoDone:'MOVE UNDONE', free:'FREE PLAY', empty:'empty', over:'GAME OVER', continueButton:'Continue' }
  };
  let language = 'ru';
  function text(key) { return messages[language][key] || key; }
  function readBest() { if (inPlatformFrame) return 0; try { return Number(localStorage.getItem(BEST_KEY) || 0); } catch { return 0; } }
  function saveBest(value) {
    if (inPlatformFrame) { window.parent.postMessage({ channel: 'SC_GAME_STORAGE', action: 'set', key: 'best', value: String(value) }, '*'); return; }
    try { localStorage.setItem(BEST_KEY, String(value)); } catch {}
  }
  function loadBestFromPlatform() {
    if (inPlatformFrame) window.parent.postMessage({ channel: 'SC_GAME_STORAGE', action: 'get', key: 'best' }, '*');
  }
  function applySettings(settings = {}) {
    language = settings.language === 'en' ? 'en' : 'ru';
    document.documentElement.lang = language;
    if (settings.theme === 'light' || settings.theme === 'dark') document.documentElement.dataset.theme = settings.theme;
    document.querySelectorAll('[data-i18n]').forEach((node) => { const key = node.dataset.i18n; if (messages[language][key]) node.textContent = messages[language][key]; });
    document.getElementById('gameStatus').textContent = text('status');
    if (!overlay.classList.contains('hidden')) {
      document.getElementById('overlayEyebrow').textContent = won ? text('winEyebrow') : text('over');
      document.getElementById('overlayTitle').textContent = won ? '2048!' : (language === 'ru' ? 'Нет ходов' : 'No moves');
      document.getElementById('continueGame').textContent = won ? text('continue') : text('again');
    }
    document.querySelector('.board-shell').setAttribute('aria-label', language === 'ru' ? 'Игровое поле 2048' : '2048 game board');
    document.querySelector('.mobile-controls').setAttribute('aria-label', language === 'ru' ? 'Кнопки управления' : 'Game controls');
    const names = { up:['Вверх','Up'], right:['Вправо','Right'], down:['Вниз','Down'], left:['Влево','Left'] };
    document.querySelectorAll('[data-direction]').forEach(button => button.setAttribute('aria-label', names[button.dataset.direction][language === 'ru' ? 0 : 1]));
  }
  let board = Array(SIZE * SIZE).fill(0);
  let score = 0;
  let best = readBest();
  let previous = null;
  let won = false;
  let touchStart = null;

  function emptyCells() { return board.map((value, index) => value ? -1 : index).filter((index) => index >= 0); }
  function spawn() {
    const cells = emptyCells();
    if (!cells.length) return;
    board[cells[Math.floor(Math.random() * cells.length)]] = Math.random() < 0.9 ? 2 : 4;
  }
  function render() {
    const previousTiles = [...boardElement.children].filter((cell) => cell.dataset.value).map((cell) => ({ value: cell.dataset.value, rect: cell.getBoundingClientRect(), used: false }));
    boardElement.replaceChildren();
    board.forEach((value, index) => {
      const cell = document.createElement('div');
      cell.className = 'cell'; cell.setAttribute('role', 'gridcell'); cell.setAttribute('aria-label', value ? String(value) : text('empty'));
      if (value) { cell.dataset.value = String(value); cell.textContent = String(value); }
      cell.dataset.index = String(index); boardElement.append(cell);
      if (value) {
        const rect = cell.getBoundingClientRect();
        const matches = previousTiles.filter((tile) => !tile.used && tile.value === String(value));
        matches.sort((a, b) => Math.hypot(a.rect.left - rect.left, a.rect.top - rect.top) - Math.hypot(b.rect.left - rect.left, b.rect.top - rect.top));
        const previousTile = matches[0];
        if (previousTile) {
          previousTile.used = true;
          const dx = previousTile.rect.left - rect.left, dy = previousTile.rect.top - rect.top;
          if (dx || dy) {
            cell.style.transition = 'none'; cell.style.transform = `translate(${dx}px, ${dy}px)`;
            requestAnimationFrame(() => { cell.style.transition = ''; cell.style.transform = ''; });
          }
        } else cell.classList.add('is-new-tile');
      }
    });
    scoreElement.textContent = score.toLocaleString(); bestElement.textContent = best.toLocaleString(); undoButton.disabled = !previous;
  }
  function hasMoves() {
    if (emptyCells().length) return true;
    for (let row = 0; row < SIZE; row++) for (let col = 0; col < SIZE; col++) {
      const current = board[row * SIZE + col];
      if (col < SIZE - 1 && current === board[row * SIZE + col + 1]) return true;
      if (row < SIZE - 1 && current === board[(row + 1) * SIZE + col]) return true;
    }
    return false;
  }
  function showOverlay(title, eyebrow) {
    document.getElementById('overlayTitle').textContent = title;
    document.getElementById('overlayEyebrow').textContent = eyebrow;
    document.getElementById('continueGame').textContent = title === '2048!' ? text('continue') : text('again');
    overlay.classList.remove('hidden');
  }
  function move(direction) {
    if (!overlay.classList.contains('hidden')) return;
    const maxBefore = Math.max(...board);
    const before = board.join(','); const oldScore = score; const next = [...board];
    for (let line = 0; line < SIZE; line++) {
      const indices = Array.from({ length: SIZE }, (_, offset) => direction === 'left' ? line * SIZE + offset : direction === 'right' ? line * SIZE + (SIZE - 1 - offset) : direction === 'up' ? offset * SIZE + line : (SIZE - 1 - offset) * SIZE + line);
      const values = indices.map((index) => board[index]).filter(Boolean); const merged = [];
      for (let index = 0; index < values.length; index++) { if (values[index] === values[index + 1]) { const value = values[index] * 2; merged.push(value); score += value; index++; } else merged.push(values[index]); }
      indices.forEach((cell, index) => { next[cell] = merged[index] || 0; });
    }
    if (before === next.join(',')) { score = oldScore; return; }
    previous = { board: [...board], score: oldScore, won };
    board = next; spawn();
    if (score > best) { best = score; saveBest(best); }
    if (!won && board.includes(2048)) { won = true; gameStatus.textContent = text('won'); showOverlay('2048!', text('winEyebrow')); }
    else if (!hasMoves()) { gameStatus.textContent = text('out'); showOverlay(language === 'ru' ? 'Нет ходов' : 'No moves', text('over')); }
    render();
    const maxAfter = Math.max(...board);
    if (maxAfter > maxBefore) emitMaxParticles(board.indexOf(maxAfter));
  }
  function emitMaxParticles(index) {
    const tile = boardElement.querySelector(`[data-index="${index}"]`);
    if (!tile || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = tile.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
    for (let i = 0; i < 18; i++) {
      const particle = document.createElement('span');
      particle.className = 'max-tile-particle';
      particle.textContent = i % 3 === 0 ? '✦' : '●';
      particle.style.left = `${centerX}px`; particle.style.top = `${centerY}px`;
      particle.style.setProperty('--dx', `${Math.round((Math.random() - .5) * 210)}px`);
      particle.style.setProperty('--dy', `${Math.round(-35 - Math.random() * 150)}px`);
      particle.style.setProperty('--turn', `${Math.round((Math.random() - .5) * 400)}deg`);
      particle.style.setProperty('--delay', `${Math.round(Math.random() * 100)}ms`);
      document.body.append(particle);
      particle.addEventListener('animationend', () => particle.remove(), { once: true });
    }
  }
  function reset() {
    board = Array(SIZE * SIZE).fill(0); score = 0; previous = null; won = false;
    overlay.classList.add('hidden'); gameStatus.textContent = text('status'); spawn(); spawn(); render();
  }
  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase(); const directions = { arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'up',w:'up',arrowdown:'down',s:'down' };
    if (directions[key]) { event.preventDefault(); move(directions[key]); } else if (key === 'r') reset(); else if (key === 'z' && previous) undoButton.click();
  });
  document.getElementById('newGame').addEventListener('click', reset);
  undoButton.addEventListener('click', () => { if (!previous) return; board = previous.board; score = previous.score; won = previous.won; previous = null; overlay.classList.add('hidden'); gameStatus.textContent = text('undoDone'); render(); });
  document.getElementById('continueGame').addEventListener('click', () => { if (won) { overlay.classList.add('hidden'); gameStatus.textContent = text('free'); } else reset(); });
  document.querySelectorAll('[data-direction]').forEach((button) => button.addEventListener('click', () => move(button.dataset.direction)));
  const shell = document.querySelector('.board-shell');
  shell.addEventListener('touchstart', (event) => { const touch = event.changedTouches[0]; touchStart = { x: touch.clientX, y: touch.clientY }; }, { passive: true });
  shell.addEventListener('touchend', (event) => { if (!touchStart) return; const touch = event.changedTouches[0]; const dx = touch.clientX - touchStart.x; const dy = touch.clientY - touchStart.y; if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); touchStart = null; }, { passive: true });
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !event.data) return;
    if (event.data.channel === 'SC_PLATFORM_SETTINGS') { applySettings(event.data); loadBestFromPlatform(); }
    if (event.data.channel === 'SC_GAME_STORAGE_RESULT' && event.data.key === 'best') {
      best = Math.max(best, Number(event.data.value || 0)); render();
    }
  });
  window.addEventListener('sc:language', (event) => applySettings({ language: event.detail?.lang, theme: document.documentElement.dataset.theme }));
  window.addEventListener('sc:theme', (event) => applySettings({ language, theme: event.detail?.theme }));
  applySettings({ language: document.documentElement.lang, theme: document.documentElement.dataset.theme });
  loadBestFromPlatform();
  reset();
})();

(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const t = (ru, en) => window.SC.language === 'ru' ? ru : en;
  let details;
  const date = (value) => value ? new Date(value).toLocaleString(window.SC.language === 'ru' ? 'ru-RU' : 'en-US') : '—';
  const time = (seconds) => window.SC.formatTime(Number(seconds || 0));
  function table(title, headers, rows, empty = '—') {
    const body = rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">${esc(empty)}</td></tr>`;
    return `<details class="admin-player-block" open><summary>${esc(title)}</summary><div class="admin-player-block-content"><div class="table-wrap"><table><thead><tr>${headers.map((head) => `<th>${esc(head)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></div></details>`;
  }
  function render() {
    const { user, totals, score } = details;
    document.title = `${user.display_name || user.public_id} — ${t('Карточка игрока', 'Player profile')} — SUPER CUBE`;
    const stats = [
      [t('Очки', 'Points'), Number(score?.points || 0).toLocaleString()],
      [t('Общее игровое время', 'Total playtime'), time(totals.seconds)],
      [t('Игровые сессии', 'Play sessions'), Number(totals.sessions).toLocaleString()],
      [t('Игр сыграно', 'Games played'), Number(totals.games).toLocaleString()],
      [t('Отзывы', 'Reviews'), Number(details.reviews).toLocaleString()],
      [t('Оценки', 'Ratings'), Number(details.ratings.length).toLocaleString()],
      [t('Избранное', 'Favourites'), Number(details.favoriteGames.length).toLocaleString()],
      [t('Облачные сохранения', 'Cloud saves'), Number(details.cloudSaves.length).toLocaleString()]
    ];
    let html = `<header class="admin-player-header"><img src="${esc(user.avatar_url || '/favicon.svg')}" alt=""><div><h1>${esc(user.display_name || user.public_id)}</h1><div class="admin-player-meta"><span>${esc(user.public_id || '')}</span><span>${esc(user.email)}</span><span>${user.email_verified ? esc(t('Email подтверждён', 'Email verified')) : esc(t('Email не подтверждён', 'Email not verified'))}</span><span>${esc(t('Регистрация', 'Joined'))}: ${esc(date(user.created_at))}</span><span>${esc(t('Последний вход', 'Last sign-in'))}: ${esc(date(user.last_login_at))}</span>${user.isAdmin ? `<strong>${esc(t('Администратор', 'Administrator'))}</strong>` : ''}</div></div></header>`;
    html += `<details class="admin-player-block" open><summary>${esc(t('Общая статистика', 'Overview'))}</summary><div class="admin-player-block-content"><section class="admin-player-stats">${stats.map(([label, value]) => `<article class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div></article>`).join('')}</section></div></details>`;
    html += table(t('Игры и время', 'Games and playtime'), [t('Игра', 'Game'), t('Время', 'Playtime'), t('Запуски', 'Sessions'), t('Последняя игра', 'Last played')], details.games.map((game) => [`<a href="/games/${encodeURIComponent(game.slug)}" target="_blank" rel="noreferrer">${esc(game.title)}</a>`, esc(time(game.seconds)), esc(Number(game.sessions).toLocaleString()), esc(date(game.lastPlayed))]));
    html += table(t('Отзывы и ответы', 'Reviews and replies'), [t('Игра', 'Game'), t('Текст', 'Content'), t('Тип', 'Type'), t('Создано', 'Created'), t('Изменено', 'Updated')], details.reviewEntries.map((review) => [esc(review.title), esc(review.body), esc(review.isAdminReply ? t('Ответ администрации', 'Admin reply') : review.parentId ? t('Ответ', 'Reply') : t('Отзыв', 'Review')), esc(date(review.createdAt)), esc(date(review.updatedAt))]));
    html += table(t('Оценки', 'Ratings'), [t('Игра', 'Game'), t('Оценка', 'Rating'), t('Обновлено', 'Updated')], details.ratings.map((rating) => [esc(rating.title), `${Number(rating.rating)} ★`, esc(date(rating.updatedAt))]));
    html += table(t('Избранные игры', 'Favourite games'), [t('Игра', 'Game'), t('Добавлено', 'Added')], details.favoriteGames.map((game) => [esc(game.title), esc(date(game.addedAt))]));
    html += table(t('Игры, которыми поделился игрок', 'Games shared by this player'), [t('Игра', 'Game'), t('Переходы', 'Share events'), t('Последний раз', 'Last shared')], details.sharedGames.map((game) => [esc(game.title), esc(Number(game.shareEvents).toLocaleString()), esc(date(game.lastShared))]));
    html += table(t('История игровых сессий', 'Play session history'), [t('Игра', 'Game'), t('Начало', 'Started'), t('Завершение', 'Ended'), t('Время', 'Duration'), t('Источник', 'Source'), t('Статус', 'Status')], details.sessions.map((session) => [esc(session.title), esc(date(session.startedAt)), esc(date(session.endedAt)), esc(time(session.seconds)), esc(session.source), esc(session.active ? t('Активна', 'Active') : t('Завершена', 'Ended'))]));
    html += table(t('События игрока', 'Player events'), [t('Игра', 'Game'), t('Событие', 'Event'), t('Источник', 'Source'), t('Дата', 'Date'), t('Данные', 'Metadata')], details.events.map((event) => [esc(event.title), esc(event.eventType), esc(event.source), esc(date(event.createdAt)), `<pre class="admin-player-data">${esc(JSON.stringify(event.metadata, null, 2))}</pre>`]));
    html += `<details class="admin-player-block" open><summary>${esc(t('Облачные сохранения', 'Cloud saves'))}</summary><div class="admin-player-block-content">${details.cloudSaves.length ? details.cloudSaves.map((save) => `<article><h3>${esc(save.title)} · ${esc(date(save.updatedAt))}</h3><pre class="admin-player-data">${esc(JSON.stringify(save.data, null, 2))}</pre></article>`).join('') : `<p class="muted">${esc(t('Сохранений нет.', 'No cloud saves.'))}</p>`}</div></details>`;
    html += `<details class="admin-player-block" open><summary>${esc(t('Статистика и учётные данные', 'Account and scoring data'))}</summary><div class="admin-player-block-content"><dl>${[[t('ID аккаунта', 'Account ID'), user.id], [t('Публичный ID', 'Public ID'), user.public_id], [t('Email', 'Email'), user.email], [t('Подтверждение email', 'Email verified'), user.email_verified ? t('Да', 'Yes') : t('Нет', 'No')], [t('Очки за отзывы', 'Review points'), score?.reviewPoints || 0], [t('Очки за избранное', 'Favourite points'), score?.favoritePoints || 0], [t('Очки за публикации', 'Share points'), score?.sharePoints || 0], [t('Бонус за часы', 'Playtime bonus'), score?.hourBonus || 0]].map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></div></details>`;
    html += `<section class="admin-player-danger"><div><h2>${esc(t('Удалить аккаунт', 'Delete account'))}</h2><p class="muted">${esc(t('Удалит аккаунт игрока и все связанные данные. Действие нельзя отменить.', 'Permanently removes this player account and all associated data. This cannot be undone.'))}</p><p id="playerDeleteMessage" class="small muted" role="status"></p></div><button class="button danger" id="deleteAccountButton" type="button" ${user.isAdmin ? 'hidden' : ''}>${esc(t('Удалить аккаунт навсегда', 'Delete account permanently'))}</button></section>`;
    $('playerCard').innerHTML = html;
    $('deleteAccountButton')?.addEventListener('click', deleteAccount);
  }
  async function deleteAccount(event) {
    const button = event.currentTarget;
    if (!window.confirm(t('Удалить аккаунт этого игрока и все связанные данные? Это нельзя отменить.', 'Delete this player account and all related data? This cannot be undone.'))) return;
    button.disabled = true;
    try {
      await window.SC.api(`/api/admin/players/${details.user.id}`, { method: 'DELETE', body: {} });
      location.replace('/admin/metrics?tab=players');
    } catch (error) {
      $('playerDeleteMessage').textContent = error.message;
      button.disabled = false;
    }
  }
  async function load() {
    const boot = await window.SC.ready;
    if (!boot?.user?.isAdmin) { location.replace('/login.html?error=admin'); return; }
    const id = Number(new URLSearchParams(location.search).get('id'));
    if (!Number.isSafeInteger(id) || id < 1) throw new Error(t('Не указан корректный ID игрока.', 'A valid player ID is required.'));
    details = await window.SC.api(`/api/admin/players/${id}`);
    render();
  }
  window.addEventListener('sc:language', () => { if (details) render(); });
  load().catch((error) => { $('playerCard').innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; });
})();

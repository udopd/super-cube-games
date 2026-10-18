(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let savedNickname = '';
  let savedAvatar = '/favicon.svg';
  async function load() {
    const boot = await window.SC.ready;
    if (!boot?.user) { location.replace('/login.html?error=state'); return; }
    if (boot.user.isAdmin) { location.replace('/admin.html'); return; }
    const data = await window.SC.api('/api/me/summary');
    byId('profileIdentity').textContent = `${data.user.name || data.user.email} · ${data.user.email}`;
    byId('publicPlayerId').textContent = `${data.user.playerId || 'SC-…'} · ${data.user.email}`;
    savedAvatar = data.user.avatar || '/favicon.svg';
    savedNickname = data.user.name || '';
    byId('profileAvatar').src = savedAvatar;
    byId('profileAvatar').dataset.savedUrl = savedAvatar;
    byId('deleteAvatarButton').hidden = !data.user.avatar;
    byId('nicknameInput').value = savedNickname;
  }
  async function compactAvatar(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error(window.SC.language === 'ru' ? 'Выбери PNG, JPG или WebP.' : 'Choose a PNG, JPG or WebP image.');
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch { throw new Error(window.SC.language === 'ru' ? 'Не удалось прочитать изображение.' : 'Could not read this image.'); }
    try {
      const side = Math.min(bitmap.width, bitmap.height);
      const cropX = (bitmap.width - side) / 2;
      const cropY = (bitmap.height - side) / 2;
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('Could not prepare avatar image.');
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, cropX, cropY, side, side, 0, 0, 64, 64);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not compress avatar.')), 'image/webp', 0.82));
      return new File([blob], 'avatar.webp', { type: 'image/webp', lastModified: Date.now() });
    } finally { bitmap.close?.(); }
  }
  byId('avatarFile')?.addEventListener('change', async (event) => {
    const input = event.currentTarget; const file = input.files[0];
    if (!file) return;
    const deleteButton = byId('deleteAvatarButton'); input.disabled = true; deleteButton.disabled = true;
    try { const compressed = await compactAvatar(file); const upload = new FormData(); upload.append('avatar', compressed); const result = await window.SC.api('/api/me/avatar', { method: 'POST', body: upload }); savedAvatar = result.avatar; byId('profileAvatar').src = `${result.avatar}?v=${Date.now()}`; byId('profileAvatar').dataset.savedUrl = result.avatar; deleteButton.hidden = false; input.value = ''; byId('avatarMessage').textContent = window.SC.language === 'ru' ? 'Изображение обрезано до квадрата и сохранено.' : 'Image cropped to a square and saved.'; await window.SC.refreshBootstrap(); }
    catch (error) { input.value = ''; byId('avatarMessage').textContent = error.message; }
    finally { input.disabled = false; deleteButton.disabled = false; }
  });
  byId('deleteAvatarButton')?.addEventListener('click', async (event) => {
    const button = event.currentTarget; button.disabled = true; byId('avatarFile').disabled = true;
    try { await window.SC.api('/api/me/avatar', { method: 'DELETE', body: {} }); savedAvatar = '/favicon.svg'; byId('profileAvatar').src = savedAvatar; byId('profileAvatar').dataset.savedUrl = savedAvatar; byId('avatarFile').value = ''; button.hidden = true; byId('avatarMessage').textContent = window.SC.language === 'ru' ? 'Аватар удалён.' : 'Avatar removed.'; await window.SC.refreshBootstrap(); }
    catch (error) { byId('avatarMessage').textContent = error.message; button.disabled = false; }
    finally { byId('avatarFile').disabled = false; }
  });
  byId('nicknameForm')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
    try { const result = await window.SC.api('/api/me/profile', { method: 'PATCH', body: { name: byId('nicknameInput').value } }); byId('nicknameMessage').textContent = window.SC.language === 'ru' ? 'Никнейм сохранён.' : 'Nickname saved.'; savedNickname = result.name; byId('nicknameInput').value = savedNickname; byId('profileIdentity').textContent = `${result.name} · ${window.SC.bootstrap?.user?.email || ''}`; await window.SC.refreshBootstrap(); }
    catch (error) { byId('nicknameMessage').textContent = error.message; }
    finally { button.disabled = false; }
  });
  byId('cancelProfileChanges')?.addEventListener('click', () => { byId('nicknameInput').value = savedNickname; byId('nicknameMessage').textContent = ''; });
  byId('passwordForm')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
    try { await window.SC.api('/api/me/password', { method: 'POST', body: { currentPassword: byId('currentPassword').value, newPassword: byId('newPassword').value } }); byId('passwordMessage').textContent = window.SC.language === 'ru' ? 'Пароль обновлён.' : 'Password updated.'; byId('currentPassword').value=''; byId('newPassword').value=''; }
    catch (error) { byId('passwordMessage').textContent = error.message; }
    finally { button.disabled = false; }
  });
  byId('cancelPasswordChanges')?.addEventListener('click', () => { byId('currentPassword').value = ''; byId('newPassword').value = ''; byId('passwordMessage').textContent = ''; });
  byId('deleteAccountButton')?.addEventListener('click', async (event) => {
    const confirmText = window.SC.language === 'ru' ? 'Удалить аккаунт и все связанные данные? Это действие нельзя отменить.' : 'Delete your account and all related data? This cannot be undone.';
    if (!window.confirm(confirmText)) return;
    const button = event.currentTarget; button.disabled = true;
    try { await window.SC.api('/api/me/account', { method: 'DELETE', body: {} }); await window.SC.refreshBootstrap(); location.replace('/'); }
    catch (error) { byId('deleteAccountMessage').textContent = error.message; button.disabled = false; }
  });
  function updatePasswordHint() { const hint = byId('passwordHint'); if (hint) hint.textContent = window.SC.language === 'ru' ? 'Минимум 6 символов.' : 'At least 6 characters.'; }
  window.addEventListener('sc:language', () => { updatePasswordHint(); load().catch(() => {}); });
  updatePasswordHint();
  load().catch((error) => { window.SC.toast(error.message, true); if (error.status === 401) location.href = '/login.html'; });
})();

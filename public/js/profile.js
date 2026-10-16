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
    byId('nicknameInput').value = savedNickname;
  }
  async function compactAvatar(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error(window.SC.language === 'ru' ? 'Выбери PNG, JPG или WebP.' : 'Choose a PNG, JPG or WebP image.');
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch { throw new Error(window.SC.language === 'ru' ? 'Не удалось прочитать изображение.' : 'Could not read this image.'); }
    if (bitmap.width !== 512 || bitmap.height !== 512) { bitmap.close?.(); throw new Error(window.SC.language === 'ru' ? 'Исходный аватар должен быть ровно 512 × 512 пикселей.' : 'The source avatar must be exactly 512 × 512 pixels.'); }
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d', { alpha: true });
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, 0, 0, 64, 64); bitmap.close?.();
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not compress avatar.')), 'image/webp', 0.82));
    return new File([blob], 'avatar.webp', { type: 'image/webp', lastModified: Date.now() });
  }
  byId('avatarForm')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const file = byId('avatarFile').files[0];
    if (!file) return;
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try { const compressed = await compactAvatar(file); const upload = new FormData(); upload.append('avatar', compressed); const result = await window.SC.api('/api/me/avatar', { method: 'POST', body: upload }); savedAvatar = result.avatar; byId('profileAvatar').src = `${result.avatar}?v=${Date.now()}`; byId('profileAvatar').dataset.savedUrl = result.avatar; byId('avatarFile').value = ''; byId('avatarMessage').textContent = window.SC.language === 'ru' ? 'Аватар сжат до 64 × 64 и обновлён.' : 'Avatar compressed to 64 × 64 and updated.'; await window.SC.refreshBootstrap(); }
    catch (error) { byId('avatarMessage').textContent = error.message; }
    finally { button.disabled = false; }
  });
  byId('cancelAvatarChanges')?.addEventListener('click', () => { byId('avatarFile').value = ''; byId('profileAvatar').src = savedAvatar; byId('avatarMessage').textContent = ''; });
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

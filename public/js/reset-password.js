(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const form = byId('resetPasswordForm');
  const params = new URLSearchParams(location.search);
  const email = params.get('email') || '';
  const token = params.get('token') || '';
  history.replaceState(null, '', location.pathname);
  const localText = {
    ru: { resetTitle:'Новый<br>пароль.',resetIntro:'Создай новый пароль для своего аккаунта.',resetHeading:'Сброс пароля',confirmPassword:'Повтори пароль',saveNewPassword:'Сохранить новый пароль',passwordMinHint:'Минимум 6 символов',passwordStrengthWeak:'Надёжность: слабая',passwordStrengthFair:'Надёжность: средняя',passwordStrengthGood:'Надёжность: хорошая',passwordStrengthStrong:'Надёжность: высокая',passwordTooShort:'Пароль должен содержать от 6 до 128 символов.',resetLinkInvalid:'Ссылка недействительна или срок её действия истёк. Запроси новую.',passwordMismatch:'Пароли не совпадают.',passwordResetSuccess:'Пароль обновлён. Теперь можно войти.' },
    en: { resetTitle:'New<br>password.',resetIntro:'Create a new password for your account.',resetHeading:'Reset password',confirmPassword:'Confirm password',saveNewPassword:'Save new password',passwordMinHint:'At least 6 characters',passwordStrengthWeak:'Strength: weak',passwordStrengthFair:'Strength: fair',passwordStrengthGood:'Strength: good',passwordStrengthStrong:'Strength: strong',passwordTooShort:'Password must contain 6–128 characters.',resetLinkInvalid:'This link is invalid or expired. Request a new one.',passwordMismatch:'Passwords do not match.',passwordResetSuccess:'Password updated. You can now sign in.' }
  };
  const t = (key) => localText[window.SC?.language === 'en' ? 'en' : 'ru'][key] || window.SC?.t(key) || key;
  function applyLocalTranslations() {
    for (const element of document.querySelectorAll('[data-i18n]')) {
      const value = localText[window.SC?.language === 'en' ? 'en' : 'ru'][element.dataset.i18n];
      if (value) element.innerHTML = value;
    }
  }
  const showMessage = (value, error = false) => {
    byId('resetMessage').textContent = value;
    byId('resetMessage').classList.toggle('error-notice', error);
    byId('resetBackLink').classList.toggle('hidden', !value || error);
  };
  function strength() {
    const password = byId('resetPassword').value;
    const score = password.length < 6 ? 0 : 1 + Number(password.length >= 10) + Number(/[A-ZА-ЯЁ]/.test(password) && /[a-zа-яё]/.test(password)) + Number(/\d/.test(password)) + Number(/[^A-Za-zА-Яа-яЁё0-9]/.test(password));
    byId('passwordStrengthFill').style.width = `${password.length ? Math.min(100, Math.round(score / 5 * 100)) : 0}%`;
    byId('passwordStrengthFill').dataset.level = score <= 1 ? 'weak' : score <= 2 ? 'fair' : score <= 3 ? 'good' : 'strong';
    byId('passwordStrengthFill').parentElement.setAttribute('aria-valuenow', String(score));
    byId('passwordStrengthLabel').textContent = password.length < 6 ? t('passwordMinHint') : t(score <= 2 ? 'passwordStrengthWeak' : score <= 3 ? 'passwordStrengthFair' : score <= 4 ? 'passwordStrengthGood' : 'passwordStrengthStrong');
  }
  byId('resetPassword').addEventListener('input', strength);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = byId('resetPassword').value;
    if (!email || !/^[a-f0-9]{64}$/i.test(token)) { showMessage(t('resetLinkInvalid'), true); form.classList.add('hidden'); return; }
    if (password !== byId('resetPasswordConfirm').value) { showMessage(t('passwordMismatch'), true); return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await window.SC.api('/api/auth/password/reset/complete', { method: 'POST', body: { email, token, password } });
      form.classList.add('hidden');
      showMessage(t('passwordResetSuccess'));
    } catch (error) {
      showMessage(error?.payload?.code === 'INVALID_PASSWORD' ? t('passwordTooShort') : t('resetLinkInvalid'), true);
      form.classList.add('hidden');
    } finally { button.disabled = false; }
  });
  if (!email || !/^[a-f0-9]{64}$/i.test(token)) { showMessage(t('resetLinkInvalid'), true); form.classList.add('hidden'); byId('resetBackLink').classList.remove('hidden'); }
  applyLocalTranslations();
  window.addEventListener('sc:language', () => { applyLocalTranslations(); strength(); });
})();

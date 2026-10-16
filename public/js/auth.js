(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const loginForm = byId('passwordLoginForm');
  if (!loginForm) return;
  const registerForm = byId('registerForm');
  const verifyForm = byId('emailVerifyForm');
  const forgotPanel = byId('forgotPasswordPanel');
  const forgotForm = byId('forgotPasswordForm');
  const message = byId('authMessage');
  const loginTab = byId('loginModeButton');
  const registerTab = byId('registerModeButton');
  const localText = {
    ru: { forgotPassword:'Забыли пароль?',forgotPasswordHelp:'Отправим ссылку для смены пароля на адрес, указанный при регистрации.',sendResetLink:'Отправить ссылку',backToLogin:'Назад ко входу',registrationCodeHelp:'Введите код из письма, чтобы подтвердить адрес и завершить регистрацию.',passwordMinHint:'Минимум 6 символов',passwordStrengthWeak:'Надёжность: слабая',passwordStrengthFair:'Надёжность: средняя',passwordStrengthGood:'Надёжность: хорошая',passwordStrengthStrong:'Надёжность: высокая',passwordTooShort:'Пароль должен содержать от 6 до 128 символов.',registrationExpired:'Срок регистрации истёк. Начни заново.',resetLinkSent:'Если аккаунт с таким адресом существует, мы отправили ссылку для сброса пароля.',resetLinkInvalid:'Ссылка недействительна или срок её действия истёк. Запроси новую.',passwordMismatch:'Пароли не совпадают.',passwordResetSuccess:'Пароль обновлён. Теперь можно войти.' },
    en: { forgotPassword:'Forgot password?',forgotPasswordHelp:'We will send a password reset link to the email address on your account.',sendResetLink:'Send reset link',backToLogin:'Back to sign in',registrationCodeHelp:'Enter the email code to confirm your address and finish creating your account.',passwordMinHint:'At least 6 characters',passwordStrengthWeak:'Strength: weak',passwordStrengthFair:'Strength: fair',passwordStrengthGood:'Strength: good',passwordStrengthStrong:'Strength: strong',passwordTooShort:'Password must contain 6–128 characters.',registrationExpired:'Registration expired. Start again.',resetLinkSent:'If an account exists for that address, we sent a password reset link.',resetLinkInvalid:'This link is invalid or expired. Request a new one.',passwordMismatch:'Passwords do not match.',passwordResetSuccess:'Password updated. You can now sign in.' }
  };
  const t = (key) => localText[window.SC?.language === 'en' ? 'en' : 'ru'][key] || window.SC?.t(key) || key;
  function applyLocalTranslations() {
    for (const element of document.querySelectorAll('[data-i18n]')) {
      const value = localText[window.SC?.language === 'en' ? 'en' : 'ru'][element.dataset.i18n];
      if (value) element.textContent = value;
    }
  }
  let activeEmail = '';
  let codeRequested = false;

  function showMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle('muted', !error);
    message.classList.toggle('error-notice', error);
  }
  function friendlyError(error) {
    const codes = {
      PRIVACY_CONSENT_REQUIRED: 'privacyConsentRequired', INVALID_EMAIL: 'authErrorEmail',
      INVALID_PASSWORD: 'passwordTooShort', EMAIL_NOT_CONFIGURED: 'authErrorEmailConfig',
      EMAIL_DELIVERY_FAILED: 'authErrorEmailDelivery', ACCOUNT_EXISTS: 'authErrorAccountExists',
      INVALID_OTP_FORMAT: 'authErrorCodeFormat', OTP_EXPIRED: 'authErrorCodeExpired',
      OTP_INVALID: 'authErrorCodeInvalid', REGISTRATION_EXPIRED: 'registrationExpired'
    };
    return t(codes[String(error?.payload?.code || '')] || '') || error?.message || t('providerError');
  }
  function setMode(mode) {
    const registering = mode === 'register';
    loginTab.classList.toggle('active', !registering);
    registerTab.classList.toggle('active', registering);
    loginTab.setAttribute('aria-pressed', String(!registering));
    registerTab.setAttribute('aria-pressed', String(registering));
    loginForm.classList.toggle('hidden', registering);
    registerForm.classList.toggle('hidden', !registering);
    verifyForm.classList.add('hidden');
    forgotPanel.classList.add('hidden');
    activeEmail = '';
    codeRequested = false;
    showMessage('');
  }
  function updatePasswordStrength() {
    const password = byId('registerPassword').value;
    const score = password.length < 6 ? 0 : 1 + Number(password.length >= 10) + Number(/[A-ZА-ЯЁ]/.test(password) && /[a-zа-яё]/.test(password)) + Number(/\d/.test(password)) + Number(/[^A-Za-zА-Яа-яЁё0-9]/.test(password));
    const percent = password.length ? Math.min(100, Math.round(score / 5 * 100)) : 0;
    const fill = byId('passwordStrengthFill');
    fill.style.width = `${percent}%`;
    fill.dataset.level = score <= 1 ? 'weak' : score <= 2 ? 'fair' : score <= 3 ? 'good' : 'strong';
    fill.parentElement.setAttribute('aria-valuenow', String(score));
    byId('passwordStrengthLabel').textContent = password.length < 6 ? t('passwordMinHint') : t(score <= 2 ? 'passwordStrengthWeak' : score <= 3 ? 'passwordStrengthFair' : score <= 4 ? 'passwordStrengthGood' : 'passwordStrengthStrong');
  }
  async function startRegistrationCode() {
    if (!byId('privacyConsent').checked) { showMessage(t('privacyConsentRequired'), true); byId('privacyConsent').focus(); return; }
    const email = byId('registerEmail').value.trim().toLowerCase();
    const password = byId('registerPassword').value;
    const button = registerForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await window.SC.api('/api/auth/email/start', { method: 'POST', body: { email, password, mode: 'register', privacyAccepted: true } });
      activeEmail = email;
      codeRequested = true;
      byId('registerEmail').readOnly = true;
      byId('registerPassword').readOnly = true;
      registerForm.querySelector('[type="submit"]').classList.add('hidden');
      verifyForm.classList.remove('hidden');
      const success = t('registrationCodeSent');
      showMessage(result.debugCode ? `${success} ${t('devCodePrefix')}: ${result.debugCode}` : success);
      byId('codeInput').focus();
    } catch (error) { showMessage(friendlyError(error), true); }
    finally { button.disabled = false; }
  }
  async function login(event) {
    event.preventDefault();
    const button = loginForm.querySelector('[type="submit"]');
    button.disabled = true;
    byId('passwordLoginMessage').textContent = '';
    try {
      const result = await window.SC.api('/api/auth/password', { method: 'POST', body: { login: byId('passwordLoginName').value.trim(), password: byId('passwordLoginValue').value } });
      location.assign(result.redirect || '/profile.html');
    } catch (error) { byId('passwordLoginMessage').textContent = error.message || t('loginFailed'); }
    finally { button.disabled = false; }
  }
  async function verifyRegistration(event) {
    event.preventDefault();
    const button = verifyForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await window.SC.api('/api/auth/email/verify', { method: 'POST', body: { email: activeEmail, code: byId('codeInput').value.trim(), mode: 'register' } });
      showMessage(t('registerCodeSuccess'));
      location.assign(result.redirect || '/profile.html');
    } catch (error) { showMessage(friendlyError(error), true); }
    finally { button.disabled = false; }
  }
  async function requestReset(event) {
    event.preventDefault();
    const button = forgotForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await window.SC.api('/api/auth/password/reset/start', { method: 'POST', body: { email: byId('forgotEmail').value.trim().toLowerCase() } });
      const sentMessage = t('resetLinkSent');
      showMessage(result.debugLink ? `${sentMessage} ${result.debugLink}` : sentMessage);
    } catch (error) { showMessage(friendlyError(error), true); }
    finally { button.disabled = false; }
  }

  loginForm.addEventListener('submit', login);
  registerForm.addEventListener('submit', (event) => { event.preventDefault(); startRegistrationCode(); });
  verifyForm.addEventListener('submit', verifyRegistration);
  forgotForm.addEventListener('submit', requestReset);
  loginTab.addEventListener('click', () => setMode('login'));
  registerTab.addEventListener('click', () => setMode('register'));
  byId('forgotPasswordButton').addEventListener('click', () => {
    byId('forgotEmail').value = byId('passwordLoginName').value.trim();
    loginForm.classList.add('hidden');
    registerForm.classList.add('hidden');
    forgotPanel.classList.remove('hidden');
    showMessage('');
  });
  byId('backToLoginButton').addEventListener('click', () => setMode('login'));
  byId('changeEmailButton').addEventListener('click', () => {
    verifyForm.classList.add('hidden');
    byId('registerEmail').readOnly = false;
    byId('registerPassword').readOnly = false;
    registerForm.querySelector('[type="submit"]').classList.remove('hidden');
    byId('codeInput').value = '';
    codeRequested = false;
    showMessage('');
    byId('registerEmail').focus();
  });
  byId('resendCodeButton').addEventListener('click', () => { if (codeRequested) startRegistrationCode(); });
  byId('registerPassword').addEventListener('input', updatePasswordStrength);

  setMode('login');
  const params = new URLSearchParams(location.search);
  if (params.get('password-reset') === 'success') showMessage(t('passwordResetSuccess'));
  const error = params.get('error');
  if (error === 'session') showMessage(t('authErrorSession'), true);
  if (error === 'admin') showMessage(t('authErrorAdmin'), true);
  applyLocalTranslations();
  window.SC.ready.then((data) => {
    if (!data) showMessage(t('serverUnavailable'), true);
    else if (!data.providers?.email) loginForm.querySelector('[type="submit"]').disabled = true;
    if (data?.user) location.replace(data.user.isAdmin ? '/admin.html' : '/profile.html');
  });
  window.addEventListener('sc:language', () => { applyLocalTranslations(); updatePasswordStrength(); });
})();

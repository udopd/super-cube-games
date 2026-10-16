import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { csrfGuard, sha256, safeEqualHex } from './security.js';
import { passwordHash } from './passwords.js';

const now = () => new Date().toISOString();
const normalizedEmail = (value) => String(value || '').trim().toLowerCase().slice(0, 254);

function identityLinkConflict() {
  const error = new Error('This sign-in identity is already associated with another account. Use the original sign-in method or contact the platform administrator.');
  error.code = 'IDENTITY_LINK_CONFLICT';
  error.status = 409;
  return error;
}

// Idempotently create a provider identity without treating PostgreSQL's 23505
// error text as a SQLite UNIQUE error. Never reassign an identity to another user.
async function ensureIdentity(db, userId, provider, subject, timestamp = now()) {
  const normalizedSubject = String(subject);
  const existingProviderIdentity = await db.prepare(
    'SELECT provider_subject FROM identities WHERE user_id=? AND provider=?'
  ).get(userId, provider);
  if (existingProviderIdentity && String(existingProviderIdentity.provider_subject) !== normalizedSubject) {
    throw identityLinkConflict();
  }

  try {
    await db.prepare(`INSERT INTO identities(user_id, provider, provider_subject, created_at)
      VALUES(?,?,?,?) ON CONFLICT(provider, provider_subject) DO NOTHING`)
      .run(userId, provider, normalizedSubject, timestamp);
  } catch (error) {
    // The other identity uniqueness rule (one identity per provider per user)
    // can still conflict; make that a clear account-linking error.
    if (error?.code === '23505') throw identityLinkConflict();
    throw error;
  }

  const linkedIdentity = await db.prepare(
    'SELECT user_id FROM identities WHERE provider=? AND provider_subject=?'
  ).get(provider, normalizedSubject);
  if (!linkedIdentity || Number(linkedIdentity.user_id) !== Number(userId)) {
    throw identityLinkConflict();
  }
}

async function ensurePublicId(db, userId) {
  const row = await db.prepare('SELECT public_id FROM users WHERE id=?').get(userId);
  if (!row || row.public_id) return row?.public_id || '';
  let publicId;
  do { publicId = `SC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; }
  while (await db.prepare('SELECT 1 FROM users WHERE public_id=?').get(publicId));
  await db.prepare('UPDATE users SET public_id=? WHERE id=?').run(publicId, userId);
  return publicId;
}

function sendSessionUser(req, res, userId) {
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: 'Could not start a secure session.' });
    req.session.userId = userId;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    req.session.save((saveError) => {
      if (saveError) return res.status(500).json({ error: 'Could not save session.' });
      res.json({ ok: true, redirect: '/profile.html' });
    });
  });
}

function authCodeEmail({ code }) {
  const title = 'Подтвердите адрес почты';
  const intro = 'Введите этот код на странице регистрации, чтобы подтвердить адрес почты.';
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — SUPER CUBE</title></head><body style="margin:0;padding:0;background:#f3f4f0;color:#171916;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f0;padding:36px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e6df"><tr><td style="padding:28px 32px 22px;border-bottom:1px solid #e9ebe5"><div style="font-size:13px;font-weight:900;letter-spacing:2px;color:#171916">SUPER CUBE</div><div style="margin-top:5px;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#858980">GAMES PLATFORM</div></td></tr><tr><td style="padding:32px"><h1 style="margin:0 0 12px;font-size:25px;line-height:1.2;letter-spacing:-.6px;color:#171916">${title}</h1><p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#62665e">${intro}</p><div style="padding:22px 16px;background:#f5f7f0;border:1px solid #e6eadd;text-align:center"><div style="margin-bottom:8px;font-size:10px;font-weight:800;letter-spacing:1.6px;color:#73786d">ОДНОРАЗОВЫЙ КОД</div><div style="font-family:Consolas,Monaco,monospace;font-size:36px;line-height:1.2;font-weight:800;letter-spacing:9px;color:#171916">${code}</div></div><p style="margin:20px 0 14px;font-size:13px;line-height:1.55;color:#62665e">Код действует 10 минут. Не пересылайте письмо и не сообщайте код другим.</p><p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#858980">Если вы не запрашивали код, просто проигнорируйте это письмо.</p></td></tr><tr><td style="padding:18px 32px;background:#f8f9f6;border-top:1px solid #e9ebe5;font-size:11px;line-height:1.5;color:#858980">Это автоматическое письмо сервиса SUPER CUBE Games. Отвечать на него не нужно.</td></tr></table></td></tr></table></body></html>`;
  const text = `${title}\n\n${intro}\n\nВаш код: ${code}\n\nКод действует 10 минут. Не пересылайте письмо и не сообщайте код другим.\n\nЕсли вы не запрашивали код, проигнорируйте это письмо.`;
  return { html, text };
}

function passwordResetEmail({ link }) {
  const title = 'Сброс пароля';
  const intro = 'Мы получили запрос на смену пароля для вашего аккаунта SUPER CUBE Games.';
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${title} — SUPER CUBE</title></head><body style="margin:0;padding:0;background:#f3f4f0;color:#171916;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f0;padding:36px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e6df"><tr><td style="padding:28px 32px 22px;border-bottom:1px solid #e9ebe5"><div style="font-size:13px;font-weight:900;letter-spacing:2px;color:#171916">SUPER CUBE</div><div style="margin-top:5px;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#858980">GAMES PLATFORM</div></td></tr><tr><td style="padding:32px"><h1 style="margin:0 0 12px;font-size:25px;line-height:1.2;letter-spacing:-.6px;color:#171916">${title}</h1><p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#62665e">${intro}</p><div style="padding:24px 16px;background:#f5f7f0;border:1px solid #e6eadd;text-align:center"><a href="${link}" style="display:inline-block;padding:14px 24px;background:#171916;color:#fff;text-decoration:none;font-size:14px;font-weight:800">Создать новый пароль</a></div><p style="margin:20px 0 14px;font-size:13px;line-height:1.55;color:#62665e">Ссылка действует 30 минут и может быть использована один раз.</p><p style="margin:0;font-size:12px;line-height:1.55;color:#858980">Если кнопка не работает, откройте эту ссылку:<br><a href="${link}" style="color:#315c35;word-break:break-all">${link}</a></p><p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#858980">Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо. Пароль останется прежним.</p></td></tr><tr><td style="padding:18px 32px;background:#f8f9f6;border-top:1px solid #e9ebe5;font-size:11px;line-height:1.5;color:#858980">Это автоматическое письмо сервиса SUPER CUBE Games. Отвечать на него не нужно.</td></tr></table></td></tr></table></body></html>`;
  const text = `${title}\n\n${intro}\n\nСоздать новый пароль: ${link}\n\nСсылка действует 30 минут и может быть использована один раз. Если вы не запрашивали сброс пароля, проигнорируйте это письмо.`;
  return { html, text };
}

function validEmail(email) { return /^.{1,200}@[\s\S]+\.[^\s@]{2,}$/u.test(email) && !/\s/.test(email); }
function validPassword(password) { return password.length >= 6 && password.length <= 128; }

export function registerAuthRoutes(app, ctx) {
  const { db, env } = ctx;
  app.use('/api/auth', ctx.authLimiter);

  app.post('/api/auth/email/start', csrfGuard, async (req, res) => {
    const email = normalizedEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (req.body?.mode !== 'register') return res.status(410).json({ code: 'EMAIL_CODE_LOGIN_DISABLED', error: 'Sign in with your password.' });
    if (req.body?.privacyAccepted !== true) return res.status(400).json({ code: 'PRIVACY_CONSENT_REQUIRED', error: 'Accept the privacy policy to create an account.' });
    if (!validEmail(email)) return res.status(400).json({ code: 'INVALID_EMAIL', error: 'Enter a valid email address.' });
    if (!validPassword(password)) return res.status(400).json({ code: 'INVALID_PASSWORD', error: 'Password must be 6–128 characters.' });
    if (!env.SMTP_HOST && env.NODE_ENV === 'production') return res.status(503).json({ code: 'EMAIL_NOT_CONFIGURED', error: 'Email delivery is not configured.' });

    // Check both linked email identities and user records. The identity is authoritative
    // if an account's verified email identity survived a previous profile-email change.
    const linked = await db.prepare(`SELECT u.* FROM identities i JOIN users u ON u.id=i.user_id
      WHERE i.provider='email' AND i.provider_subject=?`).get(email);
    const account = linked || await db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (account) return res.status(409).json({ code: 'ACCOUNT_EXISTS', error: 'An account with this email already exists. Switch to Sign in to continue.' });

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = sha256(`register:${email}:${code}:${env.OTP_PEPPER || env.SESSION_SECRET}`);
    const pendingPasswordHash = passwordHash(password);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000).toISOString();
    await db.prepare(`INSERT INTO email_codes(email, code_hash, expires_at, attempts, created_at, pending_password_hash) VALUES(?,?,?,0,?,?)
      ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, created_at=excluded.created_at, pending_password_hash=excluded.pending_password_hash`)
      .run(email, codeHash, expiresAt, createdAt.toISOString(), pendingPasswordHash);
    if (env.SMTP_HOST) {
      try {
        const secure = String(env.SMTP_SECURE).toLowerCase() === 'true';
        const transporter = nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure, requireTLS: !secure, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined });
        const message = authCodeEmail({ code });
        await transporter.sendMail({ from: env.SMTP_FROM || 'SUPER CUBE Games <no-reply@example.com>', to: email, subject: 'Подтвердите аккаунт — SUPER CUBE Games', ...message });
      } catch (error) {
        console.error(`[email-code] SMTP delivery failed (${error.code || 'SMTP_ERROR'}) at ${env.SMTP_HOST}:${env.SMTP_PORT || 587}:`, error.message);
        return res.status(503).json({ code: 'EMAIL_DELIVERY_FAILED', error: 'Could not deliver the email. Try again later.' });
      }
      return res.json({ ok: true, mode: 'register', message: 'A registration code has been sent. It expires in 10 minutes.' });
    }
    console.warn(`[dev email code:register] ${email}: ${code}`);
    return res.json({ ok: true, mode: 'register', message: 'Development mode: code is in the server log.', debugCode: env.NODE_ENV === 'production' ? undefined : code });
  });

  app.post('/api/auth/email/verify', csrfGuard, async (req, res) => {
    const email = normalizedEmail(req.body?.email);
    const code = String(req.body?.code || '').trim();
    if (req.body?.mode !== 'register') return res.status(410).json({ code: 'EMAIL_CODE_LOGIN_DISABLED', error: 'Sign in with your password.' });
    if (!validEmail(email)) return res.status(400).json({ code: 'INVALID_EMAIL', error: 'Enter a valid email address.' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ code: 'INVALID_OTP_FORMAT', error: 'Enter the six-digit code.' });
    const row = await db.prepare('SELECT * FROM email_codes WHERE email=?').get(email);
    if (!row || new Date(row.expires_at).getTime() < Date.now() || row.attempts >= 5) {
      await db.prepare('DELETE FROM email_codes WHERE email=?').run(email);
      return res.status(400).json({ code: 'OTP_EXPIRED', error: 'The code expired. Request a new one.' });
    }
    const expected = sha256(`register:${email}:${code}:${env.OTP_PEPPER || env.SESSION_SECRET}`);
    if (!safeEqualHex(row.code_hash, expected)) {
      await db.prepare('UPDATE email_codes SET attempts=attempts+1 WHERE email=?').run(email);
      return res.status(400).json({ code: 'OTP_INVALID', error: 'That code is not correct for this flow. Request a new code if you changed Sign in / Create account.' });
    }

    const timestamp = now();
    let user = await db.prepare(`SELECT u.* FROM identities i JOIN users u ON u.id=i.user_id
      WHERE i.provider='email' AND i.provider_subject=?`).get(email);
    if (!user) user = await db.prepare('SELECT * FROM users WHERE email=?').get(email);

    if (user) {
      await db.prepare('DELETE FROM email_codes WHERE email=?').run(email);
      return res.status(409).json({ code: 'ACCOUNT_EXISTS', error: 'An account with this email already exists. Switch to Sign in.' });
    }
    if (!row.pending_password_hash) return res.status(400).json({ code: 'REGISTRATION_EXPIRED', error: 'Start registration again.' });
    await db.prepare('DELETE FROM email_codes WHERE email=?').run(email);
    try {
      const result = await db.prepare('INSERT INTO users(email, display_name, email_verified, created_at, last_login_at, password_hash) VALUES(?,?,1,?,?,?)')
        .run(email, email.split('@')[0], timestamp, timestamp, row.pending_password_hash);
      user = { id: Number(result.lastInsertRowid) };
    } catch (error) {
      if (error?.code !== '23505') throw error;
      return res.status(409).json({ code: 'ACCOUNT_EXISTS', error: 'An account with this email already exists. Switch to Sign in.' });
    }
    await db.prepare('UPDATE users SET email_verified=1, last_login_at=? WHERE id=?').run(timestamp, user.id);
    // If this email is already linked, the helper verifies that it belongs to this
    // exact account and never reassigns it to another user.
    await ensureIdentity(db, user.id, 'email', email, timestamp);
    await ensurePublicId(db, user.id);
    sendSessionUser(req, res, user.id);
  });

  app.post('/api/auth/password/reset/start', csrfGuard, async (req, res) => {
    const email = normalizedEmail(req.body?.email);
    if (!validEmail(email)) return res.status(400).json({ code: 'INVALID_EMAIL', error: 'Enter a valid email address.' });
    if (!env.SMTP_HOST && env.NODE_ENV === 'production') return res.status(503).json({ code: 'EMAIL_NOT_CONFIGURED', error: 'Email delivery is not configured.' });
    const linked = await db.prepare(`SELECT u.* FROM identities i JOIN users u ON u.id=i.user_id
      WHERE i.provider='email' AND i.provider_subject=?`).get(email);
    const account = linked || await db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!account || !account.email_verified) return res.json({ ok: true });

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(`password-reset:${email}:${token}:${env.OTP_PEPPER || env.SESSION_SECRET}`);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000).toISOString();
    await db.prepare(`INSERT INTO password_reset_tokens(email, token_hash, expires_at, created_at) VALUES(?,?,?,?)
      ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash, expires_at=excluded.expires_at, created_at=excluded.created_at`)
      .run(email, tokenHash, expiresAt, createdAt.toISOString());
    const baseUrl = String(env.BASE_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : `http://localhost:${env.PORT || 3000}`)).replace(/\/$/, '');
    const link = `${baseUrl}/reset-password.html?email=${encodeURIComponent(email)}&token=${token}`;
    if (env.SMTP_HOST) {
      try {
        const secure = String(env.SMTP_SECURE).toLowerCase() === 'true';
        const transporter = nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure, requireTLS: !secure, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined });
        await transporter.sendMail({ from: env.SMTP_FROM || 'SUPER CUBE Games <no-reply@example.com>', to: email, subject: 'Сброс пароля — SUPER CUBE Games', ...passwordResetEmail({ link }) });
      } catch (error) {
        await db.prepare('DELETE FROM password_reset_tokens WHERE email=?').run(email);
        console.error(`[password-reset] SMTP delivery failed (${error.code || 'SMTP_ERROR'}) at ${env.SMTP_HOST}:${env.SMTP_PORT || 587}:`, error.message);
        return res.status(503).json({ code: 'EMAIL_DELIVERY_FAILED', error: 'Could not deliver the email. Try again later.' });
      }
    } else {
      console.warn(`[dev password reset] ${email}: ${link}`);
      if (env.NODE_ENV !== 'production') return res.json({ ok: true, debugLink: link });
    }
    res.json({ ok: true });
  });

  app.post('/api/auth/password/reset/complete', csrfGuard, async (req, res) => {
    const email = normalizedEmail(req.body?.email);
    const token = String(req.body?.token || '');
    const password = String(req.body?.password || '');
    if (!validEmail(email) || !/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ code: 'RESET_LINK_INVALID', error: 'This password reset link is invalid or has expired.' });
    if (!validPassword(password)) return res.status(400).json({ code: 'INVALID_PASSWORD', error: 'Password must be 6–128 characters.' });
    const row = await db.prepare('SELECT * FROM password_reset_tokens WHERE email=?').get(email);
    const expected = sha256(`password-reset:${email}:${token}:${env.OTP_PEPPER || env.SESSION_SECRET}`);
    if (!row || new Date(row.expires_at).getTime() < Date.now() || !safeEqualHex(row.token_hash, expected)) {
      if (row && new Date(row.expires_at).getTime() < Date.now()) await db.prepare('DELETE FROM password_reset_tokens WHERE email=?').run(email);
      return res.status(400).json({ code: 'RESET_LINK_INVALID', error: 'This password reset link is invalid or has expired.' });
    }
    const account = await db.prepare('SELECT id FROM users WHERE email=? AND email_verified=1').get(email);
    if (!account) return res.status(400).json({ code: 'RESET_LINK_INVALID', error: 'This password reset link is invalid or has expired.' });
    const consumed = await db.prepare('DELETE FROM password_reset_tokens WHERE email=? AND token_hash=? AND expires_at>?').run(email, row.token_hash, now());
    if (!consumed.changes) return res.status(400).json({ code: 'RESET_LINK_INVALID', error: 'This password reset link is invalid or has expired.' });
    await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash(password), account.id);
    res.json({ ok: true, redirect: '/login.html?password-reset=success' });
  });

  app.post('/api/auth/logout', csrfGuard, (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('scgames.sid', { path: '/' });
      res.json({ ok: true, redirect: '/' });
    });
  });
}

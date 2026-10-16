import crypto from 'node:crypto';

export function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const supplied = req.get('x-csrf-token');
  const expected = req.session?.csrfToken;
  const suppliedBuffer = Buffer.from(String(supplied || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  if (!supplied || !expected || suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return res.status(403).json({ error: 'Security token expired. Refresh the page and try again.' });
  }
  next();
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function safeEqualHex(a, b) {
  if (!a || !b || String(a).length !== String(b).length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(String(a), 'hex'), Buffer.from(String(b), 'hex')); }
  catch { return false; }
}

export function makeSlug(title) {
  const transliteration = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
  };
  return String(title || '').toLowerCase().normalize('NFKD')
    .replace(/[а-яё]/g, (char) => transliteration[char] ?? char)
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'game';
}

export function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags || '').split(',');
  const seen = new Set();
  return list.map((tag) => String(tag).trim().replace(/\s+/g, ' ').slice(0, 40).toLowerCase())
    .filter((tag) => tag && !seen.has(tag.toLowerCase()) && seen.add(tag.toLowerCase()))
    .slice(0, 24);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function safeReturnPath(value, fallback = '/') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value.slice(0, 500);
}

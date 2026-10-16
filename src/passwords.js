import crypto from 'node:crypto';

export function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, encoded) {
  const [scheme, salt, hash] = String(encoded || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  try {
    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

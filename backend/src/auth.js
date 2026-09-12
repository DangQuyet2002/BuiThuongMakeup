import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';

const KEY_LEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, KEY_LEN, SCRYPT_PARAMS).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const [, salt, expected] = parts;
  try {
    const actual = scryptSync(plain, salt, KEY_LEN, SCRYPT_PARAMS);
    const expectedBuf = Buffer.from(expected, 'hex');
    if (actual.length !== expectedBuf.length) return false;
    return timingSafeEqual(actual, expectedBuf);
  } catch {
    return false;
  }
}

export function generateSessionToken() {
  return randomBytes(32).toString('hex');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function generatePassword(length = 12) {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digit = '23456789';
  const symbol = '!@#$%&*';
  const all = lower + upper + digit + symbol;

  let out = [];
  out.push(lower[randomBytes(1)[0] % lower.length]);
  out.push(upper[randomBytes(1)[0] % upper.length]);
  out.push(digit[randomBytes(1)[0] % digit.length]);
  out.push(symbol[randomBytes(1)[0] % symbol.length]);
  for (let i = out.length; i < length; i++) {
    out.push(all[randomBytes(1)[0] % all.length]);
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

export function passwordStrength(pw) {
  const problems = [];
  if (!pw || pw.length < 8) problems.push('Cần ít nhất 8 ký tự');
  if (pw && !/[a-z]/.test(pw)) problems.push('Cần có chữ thường');
  if (pw && !/[A-Z]/.test(pw)) problems.push('Cần có chữ hoa');
  if (pw && !/\d/.test(pw)) problems.push('Cần có chữ số');
  const weak = ['123456', 'password', 'matkhau', 'admin', 'qwerty', 'abc123'];
  if (pw && weak.some((w) => pw.toLowerCase().includes(w))) {
    problems.push('Mật khẩu quá dễ đoán');
  }
  return { ok: problems.length === 0, problems };
}

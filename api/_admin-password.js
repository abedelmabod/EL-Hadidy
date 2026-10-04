import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export function matchesLegacyPassword(stored, supplied) {
  if (typeof stored !== 'string' || !stored) return false;
  const expected = createHash('sha256').update(stored).digest();
  const actual = createHash('sha256').update(supplied).digest();
  return timingSafeEqual(expected, actual);
}

export async function hashAdminPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `scrypt:v1:${salt}:${derived.toString('hex')}`;
}

export async function verifyAdminPassword(stored, supplied) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'scrypt' || parts[1] !== 'v1'
    || !/^[0-9a-f]{32}$/.test(parts[2]) || !/^[0-9a-f]{128}$/.test(parts[3])) return false;
  const expected = Buffer.from(parts[3], 'hex');
  const actual = await scrypt(supplied, parts[2], expected.length);
  return timingSafeEqual(expected, actual);
}

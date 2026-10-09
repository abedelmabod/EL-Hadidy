import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DeviceBindingError } from './_device-binding.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const matches = (a, b) => typeof a === 'string' && typeof b === 'string'
  && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const sessionSchema = [
  `CREATE TABLE IF NOT EXISTS student_desktop_permissions (student_uid TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS student_desktop_bindings (
    student_uid TEXT PRIMARY KEY, device_hash TEXT NOT NULL, secret_hash TEXT NOT NULL, linked_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS student_active_sessions (
    student_uid TEXT PRIMARY KEY, platform TEXT NOT NULL, device_hash TEXT NOT NULL,
    secret_hash TEXT NOT NULL, token_hash TEXT NOT NULL, profile_json TEXT NOT NULL,
    created_at TEXT NOT NULL, checked_at TEXT NOT NULL)`,
  'CREATE UNIQUE INDEX IF NOT EXISTS student_session_token ON student_active_sessions(token_hash)',
];

export function clientPlatform(headers) {
  const value = headers['x-client-platform'];
  // Older phone builds omit the platform header; their installation IDs carry it.
  // This is routing metadata only: device secrets and session checks remain mandatory.
  if (value === undefined && typeof headers['x-device-id'] === 'string'
    && /^(android|ios)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(headers['x-device-id'])) {
    return 'mobile';
  }
  if (!['mobile', 'windows'].includes(value)) throw new DeviceBindingError('PLATFORM_REQUIRED', 400);
  return value;
}

export function publicProfile(profile) {
  // Explicit allow-list: credentials and private support fields never leave the server.
  const keys = ['id', 'authUid', 'name', 'username', 'email', 'phone', 'year', 'academicYear',
    'accessYears', 'usedCodes', 'usedCode', 'isBanned', 'isSubscribed'];
  return Object.fromEntries(keys.filter((key) => profile[key] !== undefined).map((key) => [key, profile[key]]));
}

export async function claimSession(db, uid, proof, platform, profile) {
  const token = randomBytes(32).toString('base64url');
  const tx = await db.transaction('write');
  try {
    const existing = (await tx.execute({ sql: 'SELECT * FROM student_active_sessions WHERE student_uid = ?', args: [uid] })).rows[0];
    if (existing && (existing.platform !== platform || !matches(existing.device_hash, proof.idHash)
      || !matches(existing.secret_hash, proof.secretHash))) throw new DeviceBindingError('SESSION_ACTIVE', 409);
    if (platform === 'windows') {
      const permission = (await tx.execute({ sql: 'SELECT enabled FROM student_desktop_permissions WHERE student_uid = ?', args: [uid] })).rows[0];
      if (!permission?.enabled) throw new DeviceBindingError('DESKTOP_NOT_APPROVED');
      const revoked = (await tx.execute({ sql: 'SELECT 1 FROM student_revoked_devices WHERE student_uid = ? AND device_hash = ? AND secret_hash = ?', args: [uid, proof.idHash, proof.secretHash] })).rows[0];
      if (revoked) throw new DeviceBindingError('DEVICE_MISMATCH');
      const bound = (await tx.execute({ sql: 'SELECT * FROM student_desktop_bindings WHERE student_uid = ?', args: [uid] })).rows[0];
      if (bound && (!matches(bound.device_hash, proof.idHash) || !matches(bound.secret_hash, proof.secretHash))) throw new DeviceBindingError('DEVICE_MISMATCH');
      if (!bound) await tx.execute({ sql: 'INSERT INTO student_desktop_bindings VALUES (?, ?, ?, ?)', args: [uid, proof.idHash, proof.secretHash, new Date().toISOString()] });
    }
    const now = new Date().toISOString();
    await tx.execute({ sql: `INSERT INTO student_active_sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_uid) DO UPDATE SET token_hash = excluded.token_hash,
      profile_json = excluded.profile_json, created_at = excluded.created_at, checked_at = excluded.checked_at`,
    args: [uid, platform, proof.idHash, proof.secretHash, digest(token), JSON.stringify(publicProfile(profile)), now, now] });
    await tx.commit();
    return { sessionToken: token, profile: publicProfile(profile) };
  } catch (error) { await tx.rollback(); throw error; }
  finally { tx.close(); }
}

export async function verifySession(db, headers, proof, { allowExpired = false } = {}) {
  const token = headers['x-student-session'];
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new DeviceBindingError('SESSION_REQUIRED', 401);
  const row = (await db.execute({ sql: 'SELECT * FROM student_active_sessions WHERE token_hash = ?', args: [digest(token)] })).rows[0];
  if (!row || row.platform !== clientPlatform(headers) || !matches(row.device_hash, proof.idHash)
    || !matches(row.secret_hash, proof.secretHash)) throw new DeviceBindingError('SESSION_REVOKED', 401);
  if (!allowExpired && Date.now() - Date.parse(row.created_at) > 7 * 24 * 60 * 60 * 1000) throw new DeviceBindingError('SESSION_EXPIRED', 401);
  return { uid: row.student_uid, profile: JSON.parse(row.profile_json), tokenHash: row.token_hash };
}

export async function releaseSession(db, session) {
  await db.execute({ sql: 'DELETE FROM student_active_sessions WHERE student_uid = ? AND token_hash = ?', args: [session.uid, session.tokenHash] });
}

export async function resetSessions(db, uid) {
  await db.batch([
    { sql: `INSERT OR IGNORE INTO student_revoked_devices SELECT student_uid, device_hash, secret_hash FROM student_desktop_bindings WHERE student_uid = ?`, args: [uid] },
    { sql: 'DELETE FROM student_desktop_bindings WHERE student_uid = ?', args: [uid] },
    { sql: 'DELETE FROM student_active_sessions WHERE student_uid = ?', args: [uid] },
  ], 'write');
}

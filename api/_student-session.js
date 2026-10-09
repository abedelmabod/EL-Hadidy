import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DeviceBindingError, bindDeviceInTransaction, deviceResetStatements } from './_device-binding.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const matches = (a, b) => typeof a === 'string' && typeof b === 'string'
  && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const sessionSchema = [
  `CREATE TABLE IF NOT EXISTS student_access_blocks (student_uid TEXT PRIMARY KEY, blocked INTEGER NOT NULL, operation_id TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS student_login_attempts (bucket TEXT PRIMARY KEY, started_at INTEGER NOT NULL, attempts INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS student_desktop_permissions (student_uid TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS student_desktop_bindings (
    student_uid TEXT PRIMARY KEY, device_hash TEXT NOT NULL, secret_hash TEXT NOT NULL, linked_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS student_desktop_reset_grants (
    student_uid TEXT PRIMARY KEY, granted_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS student_active_sessions (
    student_uid TEXT PRIMARY KEY, platform TEXT NOT NULL, device_hash TEXT NOT NULL,
    secret_hash TEXT NOT NULL, token_hash TEXT NOT NULL, profile_json TEXT NOT NULL,
    created_at TEXT NOT NULL, checked_at TEXT NOT NULL)`,
  'CREATE UNIQUE INDEX IF NOT EXISTS student_session_token ON student_active_sessions(token_hash)',
];

export function clientPlatform(headers) {
  const value = headers['x-client-platform'];
  // Pre-platform phone builds used several persisted installation ID formats.
  // Missing metadata means the legacy mobile protocol, not proof of a trusted device.
  // Callers still require device secrets, binding checks, and an exclusive session.
  if (value === undefined) return 'mobile';
  if (!['mobile', 'windows'].includes(value)) throw new DeviceBindingError('PLATFORM_REQUIRED', 400);
  return value;
}

export function publicProfile(profile) {
  // Explicit allow-list: credentials and private support fields never leave the server.
  const keys = ['id', 'authUid', 'name', 'username', 'email', 'phone', 'year', 'academicYear',
    'accessYears', 'usedCodes', 'usedCode', 'isBanned', 'isSubscribed'];
  return Object.fromEntries(keys.filter((key) => profile[key] !== undefined).map((key) => [key, profile[key]]));
}

export async function claimSession(db, uid, proof, platform, profile, { legacyIds = [] } = {}) {
  const token = randomBytes(32).toString('base64url');
  const tx = await db.transaction('write');
  try {
    const blocked = (await tx.execute({ sql: 'SELECT blocked FROM student_access_blocks WHERE student_uid = ?', args: [uid] })).rows[0];
    if (blocked?.blocked) throw new DeviceBindingError('ACCOUNT_BANNED', 403);
    const existing = (await tx.execute({ sql: 'SELECT * FROM student_active_sessions WHERE student_uid = ?', args: [uid] })).rows[0];
    if (existing && (existing.platform !== platform || !matches(existing.device_hash, proof.idHash)
      || !matches(existing.secret_hash, proof.secretHash))) throw new DeviceBindingError('SESSION_ACTIVE', 409);
    if (platform === 'mobile') await bindDeviceInTransaction(tx, uid, proof, legacyIds);
    if (platform === 'windows') {
      const permission = (await tx.execute({ sql: 'SELECT enabled FROM student_desktop_permissions WHERE student_uid = ?', args: [uid] })).rows[0];
      if (!permission?.enabled) throw new DeviceBindingError('DESKTOP_NOT_APPROVED');
      const resetGrant = (await tx.execute({ sql: 'SELECT 1 FROM student_desktop_reset_grants WHERE student_uid = ?', args: [uid] })).rows[0];
      const revoked = (await tx.execute({ sql: 'SELECT 1 FROM student_revoked_devices WHERE student_uid = ? AND device_hash = ? AND secret_hash = ?', args: [uid, proof.idHash, proof.secretHash] })).rows[0];
      if (revoked && !resetGrant) throw new DeviceBindingError('DEVICE_MISMATCH');
      const bound = (await tx.execute({ sql: 'SELECT * FROM student_desktop_bindings WHERE student_uid = ?', args: [uid] })).rows[0];
      if (bound && (!matches(bound.device_hash, proof.idHash) || !matches(bound.secret_hash, proof.secretHash))) throw new DeviceBindingError('DEVICE_MISMATCH');
      if (!bound) await tx.execute({ sql: 'INSERT INTO student_desktop_bindings VALUES (?, ?, ?, ?)', args: [uid, proof.idHash, proof.secretHash, new Date().toISOString()] });
      if (resetGrant) {
        await tx.execute({ sql: `DELETE FROM student_revoked_devices
          WHERE student_uid = ? AND device_hash = ? AND secret_hash = ?`, args: [uid, proof.idHash, proof.secretHash] });
        await tx.execute({ sql: 'DELETE FROM student_desktop_reset_grants WHERE student_uid = ?', args: [uid] });
      }
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
  const row = (await db.execute({ sql: `SELECT s.* FROM student_active_sessions s WHERE token_hash = ?
    AND NOT EXISTS (SELECT 1 FROM student_access_blocks b WHERE b.student_uid = s.student_uid AND b.blocked = 1)`, args: [digest(token)] })).rows[0];
  if (!row || row.platform !== clientPlatform(headers) || !matches(row.device_hash, proof.idHash)
    || !matches(row.secret_hash, proof.secretHash)) throw new DeviceBindingError('SESSION_REVOKED', 401);
  if (!allowExpired && Date.now() - Date.parse(row.created_at) > 7 * 24 * 60 * 60 * 1000) throw new DeviceBindingError('SESSION_EXPIRED', 401);
  return { uid: row.student_uid, profile: JSON.parse(row.profile_json), tokenHash: row.token_hash };
}

export async function verifyLegacyMobileSession(db, uid, headers, proof, { allowExpired = false } = {}) {
  // Legacy clients send a verified Firebase identity and device proof, but no lease token.
  // Never claim or renew here: an existing mobile lease and binding must both match.
  if (headers['x-client-platform'] !== undefined || headers['x-student-session'] !== undefined) {
    throw new DeviceBindingError('SESSION_REQUIRED', 401);
  }
  const row = (await db.execute({ sql: `SELECT s.* FROM student_active_sessions s
    JOIN student_device_bindings b ON b.student_uid = s.student_uid
      AND b.device_hash = s.device_hash AND b.secret_hash = s.secret_hash
    WHERE s.student_uid = ? AND s.platform = 'mobile'
      AND NOT EXISTS (SELECT 1 FROM student_access_blocks a WHERE a.student_uid = s.student_uid AND a.blocked = 1)
      AND NOT EXISTS (SELECT 1 FROM student_revoked_devices r WHERE r.student_uid = s.student_uid
        AND r.device_hash = s.device_hash AND r.secret_hash = s.secret_hash)`, args: [uid] })).rows[0];
  if (!row || !matches(row.device_hash, proof.idHash) || !matches(row.secret_hash, proof.secretHash)) {
    throw new DeviceBindingError('SESSION_REVOKED', 401);
  }
  if (!allowExpired && Date.now() - Date.parse(row.created_at) > 7 * 24 * 60 * 60 * 1000) {
    throw new DeviceBindingError('SESSION_EXPIRED', 401);
  }
  return { uid: row.student_uid, profile: JSON.parse(row.profile_json), tokenHash: row.token_hash };
}

export async function releaseSession(db, session) {
  await db.execute({ sql: 'DELETE FROM student_active_sessions WHERE student_uid = ? AND token_hash = ?', args: [session.uid, session.tokenHash] });
}

function sessionResetStatements(uid) {
  return [
    { sql: `INSERT OR IGNORE INTO student_revoked_devices SELECT student_uid, device_hash, secret_hash FROM student_desktop_bindings WHERE student_uid = ?`, args: [uid] },
    { sql: 'DELETE FROM student_desktop_bindings WHERE student_uid = ?', args: [uid] },
    { sql: 'DELETE FROM student_active_sessions WHERE student_uid = ?', args: [uid] },
    { sql: `INSERT INTO student_desktop_reset_grants VALUES (?, ?)
      ON CONFLICT(student_uid) DO UPDATE SET granted_at = excluded.granted_at`, args: [uid, new Date().toISOString()] },
  ];
}

export async function resetSessions(db, uid) {
  await db.batch(sessionResetStatements(uid), 'write');
}

export async function resetStudentDevices(db, uid) {
  await db.batch([...deviceResetStatements(uid), ...sessionResetStatements(uid)], 'write');
}

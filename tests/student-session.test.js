import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { deviceProof } from '../api/_device-binding.js';
import { claimSession, sessionSchema, verifySession, releaseSession, publicProfile, resetSessions, clientPlatform, verifyLegacyMobileSession } from '../api/_student-session.js';

const headers = (platform, id, secret) => ({ 'x-client-platform': platform, 'x-device-id': id, 'x-device-secret': secret.repeat(64) });
const phone = headers('mobile', 'phone_installation', 'a');
const pc = headers('windows', 'desktop_installation', 'b');
async function setup() {
  const db = createClient({ url: 'file::memory:' });
  await db.batch([...sessionSchema, `CREATE TABLE student_revoked_devices (student_uid TEXT, device_hash TEXT, secret_hash TEXT, PRIMARY KEY(student_uid, device_hash, secret_hash))`], 'write');
  await db.execute("INSERT INTO student_desktop_permissions VALUES ('student', 1)");
  return db;
}
const profile = { id: 'student', name: 'Student', password: 'DO-NOT-EXPOSE', authUid: 'student' };
test('legacy Firebase identity and proof only verify an existing matching mobile lease', async () => {
  const db = await setup();
  try {
    await db.execute(`CREATE TABLE student_device_bindings (
      student_uid TEXT PRIMARY KEY, device_hash TEXT NOT NULL, secret_hash TEXT NOT NULL, linked_at TEXT NOT NULL)`);
    const { bindDevice } = await import('../api/_device-binding.js');
    const legacy = { 'x-device-id': 'legacy_installation_123', 'x-device-secret': 'f'.repeat(64) };
    const proof = deviceProof(legacy);
    const verify = (uid = 'student', h = legacy, p = proof) => verifyLegacyMobileSession(db, uid, h, p);
    await assert.rejects(verify(), { code: 'SESSION_REVOKED' });
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM student_active_sessions')).rows[0].n, 0);
    await bindDevice(db, 'student', proof);
    await claimSession(db, 'student', proof, 'mobile', profile);
    const before = (await db.execute('SELECT * FROM student_active_sessions')).rows[0];
    assert.equal((await verify()).profile.name, 'Student');
    assert.deepEqual((await db.execute('SELECT * FROM student_active_sessions')).rows[0], before);
    await assert.rejects(verify('other'), { code: 'SESSION_REVOKED' });
    await assert.rejects(verify('student', legacy, deviceProof(phone)), { code: 'SESSION_REVOKED' });
    await assert.rejects(verify('student', { ...legacy, 'x-client-platform': 'mobile' }), { code: 'SESSION_REQUIRED' });
    await assert.rejects(verify('student', { ...legacy, 'x-student-session': 'invalid' }), { code: 'SESSION_REQUIRED' });
    await assert.rejects(claimSession(db, 'student', deviceProof(pc), 'windows', profile), { code: 'SESSION_ACTIVE' });
    await db.execute("UPDATE student_active_sessions SET created_at = '2000-01-01'");
    await assert.rejects(verify(), { code: 'SESSION_EXPIRED' });
    const expired = await verifyLegacyMobileSession(db, 'student', legacy, proof, { allowExpired: true });
    await releaseSession(db, expired);
    await claimSession(db, 'student', deviceProof(pc), 'windows', profile);
    await assert.rejects(verify(), { code: 'SESSION_REVOKED' });
    await resetSessions(db, 'student');
    await assert.rejects(verify(), { code: 'SESSION_REVOKED' });
    await claimSession(db, 'student', proof, 'mobile', profile);
    await db.execute('DELETE FROM student_device_bindings');
    await assert.rejects(verify(), { code: 'SESSION_REVOKED' });
  } finally { db.close(); }
});
test('profile snapshot excludes credentials', () => assert.equal(publicProfile(profile).password, undefined));
const legacyPhone = {
  'x-device-id': 'android_12345678-1234-1234-1234-123456789abc',
  'x-device-secret': 'c'.repeat(64),
};
test('missing platform supports legacy mobile IDs while explicit invalid platforms are rejected', () => {
  assert.equal(clientPlatform(legacyPhone), 'mobile');
  assert.equal(clientPlatform({ ...legacyPhone, 'x-device-id': legacyPhone['x-device-id'].replace('android_', 'ios_') }), 'mobile');
  assert.equal(clientPlatform(pc), 'windows');
  assert.equal(clientPlatform({}), 'mobile');
  assert.equal(clientPlatform({ 'x-device-id': 'persisted_installation_123' }), 'mobile');
  for (const invalid of [ { ...legacyPhone, 'x-client-platform': null }, { ...legacyPhone, 'x-client-platform': '' },
    { ...legacyPhone, 'x-client-platform': 'invalid' } ]) {
    assert.throws(() => clientPlatform(invalid), { code: 'PLATFORM_REQUIRED' });
  }
});

test('legacy phone still needs its secret and lease, and cannot displace Windows', async () => {
  const db = await setup();
  try {
    assert.throws(() => deviceProof({ 'x-device-id': legacyPhone['x-device-id'] }), { code: 'DEVICE_PROOF_REQUIRED' });
    const proof = deviceProof(legacyPhone);
    const result = await claimSession(db, 'student', proof, clientPlatform(legacyPhone), profile);
    await assert.rejects(verifySession(db, legacyPhone, proof), { code: 'SESSION_REQUIRED' });
    const signed = { ...legacyPhone, 'x-student-session': result.sessionToken };
    await assert.rejects(verifySession(db, signed, deviceProof({ ...legacyPhone, 'x-device-secret': 'd'.repeat(64) })), { code: 'SESSION_REVOKED' });
    await assert.rejects(verifySession(db, { ...signed, 'x-client-platform': 'windows' }, proof), { code: 'SESSION_REVOKED' });
    await assert.rejects(claimSession(db, 'student', deviceProof(pc), 'windows', profile), { code: 'SESSION_ACTIVE' });
    await releaseSession(db, await verifySession(db, signed, proof));
    await claimSession(db, 'student', deviceProof(pc), 'windows', profile);
    await assert.rejects(claimSession(db, 'student', proof, clientPlatform(legacyPhone), profile), { code: 'SESSION_ACTIVE' });
  } finally { db.close(); }
});

test('legacy non-UUID installation retains all binding and session checks', async () => {
  const db = await setup();
  try {
    await db.execute(`CREATE TABLE student_device_bindings (
      student_uid TEXT PRIMARY KEY, device_hash TEXT NOT NULL, secret_hash TEXT NOT NULL, linked_at TEXT NOT NULL)`);
    const { bindDevice, resetDevice } = await import('../api/_device-binding.js');
    const legacy = { 'x-device-id': 'persisted_installation_123', 'x-device-secret': 'e'.repeat(64) };
    const proof = deviceProof(legacy);
    assert.throws(() => deviceProof({}), { code: 'DEVICE_PROOF_REQUIRED' });
    await bindDevice(db, 'student', proof);
    await assert.rejects(bindDevice(db, 'student', deviceProof(phone)), { code: 'DEVICE_MISMATCH' });
    const result = await claimSession(db, 'student', proof, clientPlatform(legacy), profile);
    const signed = { ...legacy, 'x-student-session': result.sessionToken };
    assert.equal((await verifySession(db, signed, proof)).uid, 'student');
    await assert.rejects(verifySession(db, { ...signed, 'x-client-platform': 'windows' }, proof), { code: 'SESSION_REVOKED' });
    await assert.rejects(claimSession(db, 'student', deviceProof(pc), 'windows', profile), { code: 'SESSION_ACTIVE' });
    await resetDevice(db, 'student');
    await resetSessions(db, 'student');
    await assert.rejects(bindDevice(db, 'student', proof), { code: 'DEVICE_MISMATCH' });
    await assert.rejects(verifySession(db, signed, proof), { code: 'SESSION_REVOKED' });
  } finally { db.close(); }
});
test('Windows requires administrator approval', async () => {
  const db = await setup();
  try { await assert.rejects(claimSession(db, 'unapproved', deviceProof(pc), 'windows', profile), { code: 'DESKTOP_NOT_APPROVED' }); }
  finally { db.close(); }
});
test('explicit phone logout permits Windows; Windows logout permits the same phone', async () => {
  const db = await setup();
  try {
    const first = await claimSession(db, 'student', deviceProof(phone), 'mobile', profile);
    await assert.rejects(claimSession(db, 'student', deviceProof(pc), 'windows', profile), { code: 'SESSION_ACTIVE' });
    const session = await verifySession(db, { ...phone, 'x-student-session': first.sessionToken }, deviceProof(phone));
    await releaseSession(db, session);
    const second = await claimSession(db, 'student', deviceProof(pc), 'windows', profile);
    await assert.rejects(claimSession(db, 'student', deviceProof(phone), 'mobile', profile), { code: 'SESSION_ACTIVE' });
    await assert.rejects(verifySession(db, { ...phone, 'x-student-session': first.sessionToken }, deviceProof(phone)), { code: 'SESSION_REVOKED' });
    await releaseSession(db, await verifySession(db, { ...pc, 'x-student-session': second.sessionToken }, deviceProof(pc)));
    await claimSession(db, 'student', deviceProof(phone), 'mobile', profile);
  } finally { db.close(); }
});
test('concurrent phone/Windows logins cannot both claim an active session', async () => {
  const db = await setup();
  try {
    const results = await Promise.allSettled([claimSession(db, 'student', deviceProof(phone), 'mobile', profile), claimSession(db, 'student', deviceProof(pc), 'windows', profile)]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM student_active_sessions')).rows[0].n, 1);
  } finally { db.close(); }
});
test('heartbeat cannot claim, copy credentials to another device, or switch platform', async () => {
  const db = await setup();
  try {
    const result = await claimSession(db, 'student', deviceProof(phone), 'mobile', profile);
    await assert.rejects(verifySession(db, { ...pc, 'x-student-session': result.sessionToken }, deviceProof(pc)), { code: 'SESSION_REVOKED' });
    await assert.rejects(verifySession(db, { ...phone, 'x-client-platform': 'windows', 'x-student-session': result.sessionToken }, deviceProof(phone)), { code: 'SESSION_REVOKED' });
    await assert.rejects(verifySession(db, phone, deviceProof(phone)), { code: 'SESSION_REQUIRED' });
    const row = (await db.execute('SELECT * FROM student_active_sessions')).rows[0];
    assert.notEqual(row.token_hash, result.sessionToken);
    assert.equal(JSON.parse(row.profile_json).password, undefined);
    await db.execute("UPDATE student_active_sessions SET checked_at = '2000-01-01' WHERE student_uid = 'student'");
    await assert.rejects(claimSession(db, 'student', deviceProof(pc), 'windows', profile), { code: 'SESSION_ACTIVE' });
  } finally { db.close(); }
});
test('reset revokes the old desktop token and proof without changing mobile binding', async () => {
  const db = await setup();
  try {
    const result = await claimSession(db, 'student', deviceProof(pc), 'windows', profile);
    await resetSessions(db, 'student');
    await assert.rejects(verifySession(db, { ...pc, 'x-student-session': result.sessionToken }, deviceProof(pc)), { code: 'SESSION_REVOKED' });
    await assert.rejects(claimSession(db, 'student', deviceProof(pc), 'windows', profile), { code: 'DEVICE_MISMATCH' });
  } finally { db.close(); }
});

test('an expired session cannot read content or permit a platform switch without logout', async () => {
  const db = await setup();
  try {
    const result = await claimSession(db, 'student', deviceProof(phone), 'mobile', profile);
    await db.execute("UPDATE student_active_sessions SET created_at = '2000-01-01' WHERE student_uid = 'student'");
    const signed = { ...phone, 'x-student-session': result.sessionToken };
    await assert.rejects(verifySession(db, signed, deviceProof(phone)), { code: 'SESSION_EXPIRED' });
    await assert.rejects(claimSession(db, 'student', deviceProof(pc), 'windows', profile), { code: 'SESSION_ACTIVE' });
    await releaseSession(db, await verifySession(db, signed, deviceProof(phone), { allowExpired: true }));
    await claimSession(db, 'student', deviceProof(pc), 'windows', profile);
  } finally { db.close(); }
});

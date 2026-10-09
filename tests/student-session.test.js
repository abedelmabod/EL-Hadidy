import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { deviceProof, deviceBindingSchema } from '../api/_device-binding.js';
import { claimSession, sessionSchema, verifySession, releaseSession, publicProfile, resetSessions, resetStudentDevices, clientPlatform, verifyLegacyMobileSession } from '../api/_student-session.js';

const headers = (platform, id, secret) => ({ 'x-client-platform': platform, 'x-device-id': id, 'x-device-secret': secret.repeat(64) });
const phone = headers('mobile', 'phone_installation', 'a');
const pc = headers('windows', 'desktop_installation', 'b');
async function setup() {
  const db = createClient({ url: 'file::memory:' });
  await db.batch([...sessionSchema, ...deviceBindingSchema], 'write');
  await db.execute("INSERT INTO student_desktop_permissions VALUES ('student', 1)");
  return db;
}
const profile = { id: 'student', name: 'Student', password: 'DO-NOT-EXPOSE', authUid: 'student' };
test('legacy Firebase identity and proof only verify an existing matching mobile lease', async () => {
  const db = await setup();
  try {
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
    await bindDevice(db, 'student', proof);
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
test('authorized reset revokes the old desktop token and permits the same computer once', async () => {
  const db = await setup();
  try {
    const result = await claimSession(db, 'student', deviceProof(pc), 'windows', profile);
    await resetSessions(db, 'student');
    await assert.rejects(verifySession(db, { ...pc, 'x-student-session': result.sessionToken }, deviceProof(pc)), { code: 'SESSION_REVOKED' });
    const fresh = await claimSession(db, 'student', deviceProof(pc), 'windows', profile);
    assert.notEqual(fresh.sessionToken, result.sessionToken);
    assert.equal((await verifySession(db, { ...pc, 'x-student-session': fresh.sessionToken }, deviceProof(pc))).uid, 'student');
    await assert.rejects(verifySession(db, { ...pc, 'x-student-session': result.sessionToken }, deviceProof(pc)), { code: 'SESSION_REVOKED' });
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM student_desktop_reset_grants')).rows[0].n, 0);
  } finally { db.close(); }
});

test('a Windows reset grant does not bypass approval or allow a second computer', async () => {
  const db = await setup();
  try {
    await claimSession(db, 'student', deviceProof(pc), 'windows', profile);
    await resetStudentDevices(db, 'student');
    await db.execute("UPDATE student_desktop_permissions SET enabled = 0 WHERE student_uid = 'student'");
    await assert.rejects(claimSession(db, 'student', deviceProof(pc), 'windows', profile), { code: 'DESKTOP_NOT_APPROVED' });
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM student_desktop_reset_grants')).rows[0].n, 1);
    await db.execute("UPDATE student_desktop_permissions SET enabled = 1 WHERE student_uid = 'student'");
    const replacement = headers('windows', 'replacement_computer', 'z');
    const results = await Promise.allSettled([
      claimSession(db, 'student', deviceProof(pc), 'windows', profile),
      claimSession(db, 'student', deviceProof(replacement), 'windows', profile),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const active = (await db.execute('SELECT * FROM student_active_sessions')).rows[0];
    const winningHeaders = active.device_hash === deviceProof(pc).idHash ? pc : replacement;
    const losingHeaders = winningHeaders === pc ? replacement : pc;
    await releaseSession(db, { uid: 'student', tokenHash: active.token_hash });
    await assert.rejects(claimSession(db, 'student', deviceProof(losingHeaders), 'windows', profile), { code: 'DEVICE_MISMATCH' });
    await claimSession(db, 'student', deviceProof(winningHeaders), 'windows', profile);
  } finally { db.close(); }
});

test('desktop reset and phone login preserve exclusive platform sessions', async () => {
  const db = await setup();
  try {
    await claimSession(db, 'student', deviceProof(pc), 'windows', profile);
    await resetStudentDevices(db, 'student');
    const mobile = await claimSession(db, 'student', deviceProof(phone), 'mobile', profile);
    await assert.rejects(claimSession(db, 'student', deviceProof(pc), 'windows', profile), { code: 'SESSION_ACTIVE' });
    await releaseSession(db, await verifySession(db, { ...phone, 'x-student-session': mobile.sessionToken }, deviceProof(phone)));
    await claimSession(db, 'student', deviceProof(pc), 'windows', profile);
    await assert.rejects(claimSession(db, 'student', deviceProof(phone), 'mobile', profile), { code: 'SESSION_ACTIVE' });
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

test('authorized full reset invalidates the old lease and allows a fresh lease on the same phone', async () => {
  const db = await setup();
  try {
    const proof = deviceProof(phone);
    const first = await claimSession(db, 'student', proof, 'mobile', profile);
    await resetStudentDevices(db, 'student');
    await assert.rejects(verifySession(db, { ...phone, 'x-student-session': first.sessionToken }, proof), { code: 'SESSION_REVOKED' });
    const legacy = { 'x-device-id': phone['x-device-id'], 'x-device-secret': phone['x-device-secret'] };
    await assert.rejects(verifyLegacyMobileSession(db, 'student', legacy, proof), { code: 'SESSION_REVOKED' });
    const next = await claimSession(db, 'student', proof, 'mobile', profile);
    assert.notEqual(first.sessionToken, next.sessionToken);
    assert.equal((await verifySession(db, { ...phone, 'x-student-session': next.sessionToken }, proof)).uid, 'student');
    assert.equal((await verifyLegacyMobileSession(db, 'student', legacy, proof)).uid, 'student');
    await assert.rejects(verifySession(db, { ...phone, 'x-student-session': first.sessionToken }, proof), { code: 'SESSION_REVOKED' });
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM student_device_reset_grants')).rows[0].n, 0);
  } finally { db.close(); }
});

test('replacement phone after reset ignores stale Firestore device IDs and blocks the old phone', async () => {
  const db = await setup();
  try {
    await claimSession(db, 'student', deviceProof(phone), 'mobile', profile);
    await resetStudentDevices(db, 'student');
    const replacement = headers('mobile', 'replacement_installation', 'r');
    const fresh = await claimSession(db, 'student', deviceProof(replacement), 'mobile', profile, { legacyIds: [phone['x-device-id']] });
    assert.equal((await verifySession(db, { ...replacement, 'x-student-session': fresh.sessionToken }, deviceProof(replacement))).uid, 'student');
    await assert.rejects(claimSession(db, 'student', deviceProof(phone), 'mobile', profile), { code: 'SESSION_ACTIVE' });
    await releaseSession(db, await verifySession(db, { ...replacement, 'x-student-session': fresh.sessionToken }, deviceProof(replacement)));
    await assert.rejects(claimSession(db, 'student', deviceProof(phone), 'mobile', profile), { code: 'DEVICE_MISMATCH' });
  } finally { db.close(); }
});

test('two phones racing after full reset cannot both consume the authorization', async () => {
  const db = await setup();
  try {
    await claimSession(db, 'student', deviceProof(phone), 'mobile', profile);
    await resetStudentDevices(db, 'student');
    const replacement = headers('mobile', 'replacement_installation', 'r');
    const results = await Promise.allSettled([
      claimSession(db, 'student', deviceProof(phone), 'mobile', profile),
      claimSession(db, 'student', deviceProof(replacement), 'mobile', profile),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM student_device_reset_grants')).rows[0].n, 0);
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM student_device_bindings')).rows[0].n, 1);
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM student_active_sessions')).rows[0].n, 1);
  } finally { db.close(); }
});

test('failed session persistence rolls back the new binding and leaves reset permission usable', async () => {
  const db = await setup();
  try {
    const proof = deviceProof(phone);
    await claimSession(db, 'student', proof, 'mobile', profile);
    await resetStudentDevices(db, 'student');
    await db.execute(`CREATE TRIGGER fail_session BEFORE INSERT ON student_active_sessions
      BEGIN SELECT RAISE(FAIL, 'simulated storage failure'); END`);
    await assert.rejects(claimSession(db, 'student', proof, 'mobile', profile));
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM student_device_bindings')).rows[0].n, 0);
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM student_device_reset_grants')).rows[0].n, 1);
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM student_revoked_devices')).rows[0].n, 1);
    await db.execute('DROP TRIGGER fail_session');
    await claimSession(db, 'student', proof, 'mobile', profile);
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM student_device_reset_grants')).rows[0].n, 0);
  } finally { db.close(); }
});

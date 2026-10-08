import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { deviceProof } from '../api/_device-binding.js';
import { claimSession, sessionSchema, verifySession, releaseSession, publicProfile, resetSessions } from '../api/_student-session.js';

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
test('profile snapshot excludes credentials', () => assert.equal(publicProfile(profile).password, undefined));
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

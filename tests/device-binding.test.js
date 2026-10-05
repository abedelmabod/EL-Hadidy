import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { bindDevice, deviceProof, verifyDevice, resetDevice } from '../api/_device-binding.js';

const proof = (id, secret = 'a'.repeat(64)) => deviceProof({ 'x-device-id': id, 'x-device-secret': secret });
const first = proof('android_device_one');
const second = proof('ios_device_two', 'b'.repeat(64));
async function database() {
  const db = createClient({ url: 'file::memory:' });
  await db.execute(`CREATE TABLE student_device_bindings (
    student_uid TEXT PRIMARY KEY, device_hash TEXT NOT NULL, secret_hash TEXT NOT NULL, linked_at TEXT NOT NULL)`);
  await db.execute(`CREATE TABLE student_revoked_devices (
    student_uid TEXT NOT NULL, device_hash TEXT NOT NULL, secret_hash TEXT NOT NULL,
    PRIMARY KEY (student_uid, device_hash, secret_hash))`);
  return db;
}

test('missing and malformed device credentials are rejected', () => {
  assert.throws(() => deviceProof({}), { code: 'DEVICE_PROOF_REQUIRED' });
  assert.throws(() => proof('android_device_one', 'short'), { code: 'DEVICE_PROOF_REQUIRED' });
});

test('only one device binds; knowing the installation ID without its secret is insufficient', async () => {
  const db = await database();
  try {
    await bindDevice(db, 'student', first);
    await bindDevice(db, 'student', first);
    await verifyDevice(db, 'student', first);
    await assert.rejects(bindDevice(db, 'student', second), { code: 'DEVICE_MISMATCH' });
    await assert.rejects(verifyDevice(db, 'student', proof('android_device_one', 'c'.repeat(64))), { code: 'DEVICE_MISMATCH' });
    const row = (await db.execute('SELECT * FROM student_device_bindings')).rows[0];
    assert.equal(row.device_hash.length, 64);
    assert.notEqual(row.secret_hash, 'a'.repeat(64));
  } finally { db.close(); }
});

test('concurrent first logins cannot both bind', async () => {
  const db = await database();
  try {
    const results = await Promise.allSettled([bindDevice(db, 'student', first), bindDevice(db, 'student', second)]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal((await db.execute('SELECT COUNT(*) AS count FROM student_device_bindings')).rows[0].count, 1);
  } finally { db.close(); }
});

test('legacy first device is preserved and administrator reset revokes its proof', async () => {
  const db = await database();
  try {
    await assert.rejects(bindDevice(db, 'student', second, ['android_device_one']), { code: 'DEVICE_MISMATCH' });
    await bindDevice(db, 'student', first, ['android_device_one']);
    await resetDevice(db, 'student');
    await assert.rejects(verifyDevice(db, 'student', first), { code: 'DEVICE_MISMATCH' });
    await assert.rejects(bindDevice(db, 'student', first), { code: 'DEVICE_MISMATCH' });
    await bindDevice(db, 'student', second);
    await verifyDevice(db, 'student', second);
    await assert.rejects(verifyDevice(db, 'student', first), { code: 'DEVICE_MISMATCH' });
  } finally { db.close(); }
});

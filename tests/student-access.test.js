import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { deviceBindingSchema, deviceProof } from '../api/_device-binding.js';
import { sessionSchema, claimSession, verifySession, verifyLegacyMobileSession } from '../api/_student-session.js';
import { setDesktopPermission, setStudentBan } from '../api/_student-access.js';
import { readFile } from 'node:fs/promises';
import { HttpError } from '../api/_quiz-server.js';
import { DeviceBindingError } from '../api/_device-binding.js';

const headers = { 'x-client-platform': 'windows', 'x-device-id': 'desktop_installation', 'x-device-secret': 'b'.repeat(64) };
const phone = { 'x-device-id': 'mobile_installation', 'x-device-secret': 'a'.repeat(64) };
async function setup() {
  const db = createClient({ url: 'file::memory:' });
  await db.batch([...sessionSchema, ...deviceBindingSchema], 'write');
  await setDesktopPermission(db, 'student', true);
  return db;
}

test('desktop permission and lease deletion roll back together on database failure', async () => {
  const db = await setup();
  try {
    const session = await claimSession(db, 'student', deviceProof(headers), 'windows', {});
    await db.execute("CREATE TRIGGER fail_delete BEFORE DELETE ON student_active_sessions BEGIN SELECT RAISE(FAIL, 'failure'); END");
    await assert.rejects(setDesktopPermission(db, 'student', false));
    assert.equal((await db.execute('SELECT enabled FROM student_desktop_permissions')).rows[0].enabled, 1);
    await verifySession(db, { ...headers, 'x-student-session': session.sessionToken }, deviceProof(headers));
    await db.execute('DROP TRIGGER fail_delete');
    await setDesktopPermission(db, 'student', false);
    await assert.rejects(verifySession(db, { ...headers, 'x-student-session': session.sessionToken }, deviceProof(headers)));
    await assert.rejects(claimSession(db, 'student', deviceProof(headers), 'windows', {}), { code: 'DESKTOP_NOT_APPROVED' });
  } finally { db.close(); }
});

test('ban invalidates tokens and legacy sessions even when Firestore fails; reset cannot bypass the block', async () => {
  const db = await setup();
  try {
    const session = await claimSession(db, 'student', deviceProof(phone), 'mobile', {});
    const { resetStudentDevices } = await import('../api/_student-session.js');
    const result = await setStudentBan(db, { update: async () => { throw Error('offline'); } }, 'student', true);
    assert.equal(result.accessBlocked, true);
    assert.equal(result.warnings.length, 1);
    await assert.rejects(verifySession(db, { ...phone, 'x-student-session': session.sessionToken }, deviceProof(phone)));
    await assert.rejects(verifyLegacyMobileSession(db, 'student', phone, deviceProof(phone)));
    await resetStudentDevices(db, 'student');
    await assert.rejects(claimSession(db, 'student', deviceProof(phone), 'mobile', {}), { code: 'ACCOUNT_BANNED' });
    await assert.rejects(claimSession(db, 'student', deviceProof(headers), 'windows', {}), { code: 'ACCOUNT_BANNED' });
    const restored = await setStudentBan(db, { update: async () => {} }, 'student', false);
    assert.deepEqual(restored.warnings, []);
    await claimSession(db, 'student', deviceProof(phone), 'mobile', {});
  } finally { db.close(); }
});

test('failure to block Turso leaves Firestore unchanged and prior access intact', async () => {
  const db = await setup();
  try {
    let writes = 0;
    const session = await claimSession(db, 'student', deviceProof(headers), 'windows', {});
    await db.execute("CREATE TRIGGER fail_block BEFORE INSERT ON student_access_blocks BEGIN SELECT RAISE(FAIL, 'failure'); END");
    await assert.rejects(setStudentBan(db, { update: async () => { writes += 1; } }, 'student', true));
    assert.equal(writes, 0);
    await verifySession(db, { ...headers, 'x-student-session': session.sessionToken }, deviceProof(headers));
  } finally { db.close(); }
});

test('failed or superseded unban never removes a newer security block', async () => {
  const db = await setup();
  try {
    let result = await setStudentBan(db, { update: async () => { throw Error('offline'); } }, 'student', false);
    assert.equal(result.accessBlocked, true);
    result = await setStudentBan(db, { update: async () => {
      await setStudentBan(db, { update: async () => {} }, 'student', true);
    } }, 'student', false);
    assert.equal(result.warnings.length, 1);
    await assert.rejects(claimSession(db, 'student', deviceProof(headers), 'windows', {}), { code: 'ACCOUNT_BANNED' });
    await db.execute("CREATE TRIGGER fail_unblock BEFORE UPDATE ON student_access_blocks WHEN NEW.blocked = 0 BEGIN SELECT RAISE(FAIL, 'failure'); END");
    result = await setStudentBan(db, { update: async () => {} }, 'student', false);
    assert.equal(result.accessBlocked, true);
    assert.equal(result.warnings.length, 1);
  } finally { db.close(); }
});

test('management API rejects unauthorized staff and uses server-derived UID for ban and permission changes', async () => {
  const source = await readFile(new URL('../api/device-session.js', import.meta.url), 'utf8');
  const createHandler = new Function('getDatabase', 'identify', 'requireDeviceManager', 'HttpError', 'DeviceBindingError',
    'setStudentBan', 'setDesktopPermission', 'logDeviceSessionRejection',
    source.replace(/^import .*;\r?\n/gm, '').replace('export default async function', 'return async function'));
  const changes = [];
  const ref = {};
  const response = () => ({ setHeader() {}, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } });
  const makeHandler = (authorized) => createHandler(async () => ({}), async () => ({
    store: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, id: 'document', ref, data: () => ({ authUid: 'server-uid' }) }) }) }) },
  }), async () => { if (!authorized) throw new HttpError(403, 'forbidden'); }, HttpError, DeviceBindingError,
  async (_, passedRef, uid, banned) => { assert.equal(passedRef, ref); changes.push({ uid, banned }); return { ok: true }; },
  async (_, uid, enabled) => { changes.push({ uid, enabled }); }, () => {});
  for (const action of ['setBan', 'allowDesktop']) {
    const request = { method: 'POST', headers: {}, body: { action, studentId: 'document', uid: 'attacker', banned: true, enabled: false } };
    const rejected = response();
    await makeHandler(false)(request, rejected);
    assert.equal(rejected.code, 403);
    assert.equal(changes.length, action === 'setBan' ? 0 : 1);
    const accepted = response();
    await makeHandler(true)(request, accepted);
    assert.equal(accepted.code, 200);
    assert.equal(changes.at(-1).uid, 'server-uid');
  }
});

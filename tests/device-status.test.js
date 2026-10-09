import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { deviceBindingSchema, deviceProof, DeviceBindingError } from '../api/_device-binding.js';
import { claimSession, resetStudentDevices, sessionSchema, releaseSession, verifySession } from '../api/_student-session.js';
import { readDeviceStatuses } from '../api/_device-status.js';

test('Turso device status follows binding, logout, reset and re-login without Firestore writes', async () => {
  const db = createClient({ url: 'file::memory:' });
  try {
    await db.batch([...sessionSchema, ...deviceBindingSchema], 'write');
    const headers = { 'x-client-platform': 'mobile', 'x-device-id': 'phone_installation', 'x-device-secret': 'a'.repeat(64) };
    const proof = deviceProof(headers);
    const before = (await readDeviceStatuses(db, ['student'])).student;
    assert.equal(before.mobileBound, false);
    const session = await claimSession(db, 'student', proof, 'mobile', { id: 'student' });
    const bound = (await readDeviceStatuses(db, ['student', 'other'])).student;
    assert.equal(bound.mobileBound, true);
    assert.equal(bound.sessionPlatform, 'mobile');
    assert.ok(bound.mobileLinkedAt);
    assert.doesNotMatch(JSON.stringify(bound), /hash|secret|token|profile_json/);
    await releaseSession(db, await verifySession(db, { ...headers, 'x-student-session': session.sessionToken }, proof));
    const loggedOut = (await readDeviceStatuses(db, ['student'])).student;
    assert.equal(loggedOut.mobileBound, true);
    assert.equal(loggedOut.sessionPlatform, null);
    await resetStudentDevices(db, 'student');
    assert.equal((await readDeviceStatuses(db, ['student'])).student.mobileBound, false);
    await claimSession(db, 'student', proof, 'mobile', { id: 'student' });
    assert.equal((await readDeviceStatuses(db, ['student'])).student.mobileBound, true);
  } finally { db.close(); }
});

test('Windows binding is separate from phone binding and status queries use parameters', async () => {
  const db = createClient({ url: 'file::memory:' });
  try {
    await db.batch([...sessionSchema, ...deviceBindingSchema], 'write');
    await db.execute("INSERT INTO student_desktop_permissions VALUES ('student', 1)");
    await claimSession(db, 'student', deviceProof({ 'x-device-id': 'desktop_installation', 'x-device-secret': 'b'.repeat(64) }), 'windows', {});
    const result = await readDeviceStatuses(db, ['student', "student' OR 1=1 --"]);
    assert.equal(result.student.desktopBound, true);
    assert.equal(result.student.mobileBound, false);
    assert.equal(result["student' OR 1=1 --"].desktopBound, false);
    assert.deepEqual(await readDeviceStatuses(db, []), {});
  } finally { db.close(); }
});

test('status API rejects unauthorized or banned managers and validates batch size', async () => {
  const source = await readFile(new URL('../api/device-session.js', import.meta.url), 'utf8');
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const createHandler = new Function('getDatabase', 'identify', 'requireDeviceManager', 'readDeviceStatuses',
    'HttpError', 'DeviceBindingError', 'logDeviceSessionRejection',
    source.replace(/^import .*;\r?\n/gm, '').replace('export default async function', 'return async function'));
  let queries = 0;
  const makeHandler = (allowed) => createHandler(async () => ({}), async () => ({}), async () => {
    if (!allowed) throw new HttpError(403, 'forbidden');
  }, async (_, uids) => { queries += 1; return Object.fromEntries(uids.map((uid) => [uid, { mobileBound: true }])); },
  HttpError, DeviceBindingError, () => {});
  const response = () => ({ setHeader() {}, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } });
  const blocked = response();
  await makeHandler(false)({ method: 'POST', headers: {}, body: { action: 'statuses', studentUids: ['student'] } }, blocked);
  assert.equal(blocked.code, 403);
  assert.equal(queries, 0);
  for (const uids of [[], [''], Array(201).fill('student')]) {
    const invalid = response();
    await makeHandler(true)({ method: 'POST', headers: {}, body: { action: 'statuses', studentUids: uids } }, invalid);
    assert.equal(invalid.code, 400);
  }
  const success = response();
  await makeHandler(true)({ method: 'POST', headers: {}, body: { action: 'statuses', studentUids: ['student', 'student'] } }, success);
  assert.equal(success.code, 200);
  assert.deepEqual(success.body.statuses, { student: { mobileBound: true } });
});

test('both panels display server state instead of legacy Firestore device IDs', async () => {
  const admin = await readFile(new URL('../src/AdminDashboard.jsx', import.meta.url), 'utf8');
  const support = await readFile(new URL('../src/SupportAdmin.jsx', import.meta.url), 'utf8');
  const hook = await readFile(new URL('../src/hooks/useDeviceStatuses.js', import.meta.url), 'utf8');
  for (const panel of [admin, support]) {
    assert.match(panel, /useDeviceStatuses/);
    assert.match(panel, /deviceCountLabel/);
  }
  assert.doesNotMatch(admin, /getStudentDeviceIds/);
  assert.doesNotMatch(support, /student\.deviceId|selectedStudent\.deviceId/);
  assert.match(hook, /student.authUid \|\| student.id/);
  assert.match(hook, /statuses: \{\}, error: true/);
  const labels = new Function(hook.slice(hook.indexOf('export function deviceCountLabel')).replaceAll('export function', 'function')
    + '\nreturn {deviceCountLabel, deviceTypeLabel};')();
  assert.equal(labels.deviceCountLabel({ deviceStatus: { mobileBound: true } }), '1/1');
  assert.equal(labels.deviceCountLabel({ deviceStatusLabel: 'تعذر التحقق' }), 'تعذر التحقق');
  assert.equal(labels.deviceTypeLabel({ deviceStatus: { mobileBound: false, desktopBound: false } }), 'غير مسجل');
});

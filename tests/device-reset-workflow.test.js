import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { clearedDeviceFields, executeDeviceReset } from '../src/services/device-reset-workflow.js';

test('reset succeeds on the server before display cleanup and support logging', async () => {
  const calls = [];
  const result = await executeDeviceReset({
    reset: async () => calls.push('server'),
    syncDisplay: async () => calls.push('display'),
    logAction: async () => calls.push('log'),
  });
  assert.deepEqual(calls, ['server', 'display', 'log']);
  assert.deepEqual(result, { ok: true, warnings: [] });
});

test('a rejected server reset never clears display fields or logs success', async () => {
  const calls = [];
  await assert.rejects(executeDeviceReset({
    reset: async () => { throw new Error('server unavailable'); },
    syncDisplay: async () => calls.push('display'),
    logAction: async () => calls.push('log'),
  }), /server unavailable/);
  assert.deepEqual(calls, []);
});

test('display update failure reports partial success and still attempts the audit log', async () => {
  let logged = false;
  const result = await executeDeviceReset({
    reset: async () => {},
    syncDisplay: async () => { throw new Error('Firestore unavailable'); },
    logAction: async () => { logged = true; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /لا تحتاج لإعادة التصفير/);
  assert.equal(logged, true);
});

test('audit failure after reset reports partial success, not a failed reset', async () => {
  const result = await executeDeviceReset({
    reset: async () => {},
    syncDisplay: async () => {},
    logAction: async () => { throw new Error('log unavailable'); },
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /سجل الدعم/);
});

test('both post-reset failures are reported without retrying the reset', async () => {
  let resets = 0;
  const result = await executeDeviceReset({
    reset: async () => { resets += 1; },
    syncDisplay: async () => { throw new Error('unavailable'); },
    logAction: async () => { throw new Error('unavailable'); },
  });
  assert.equal(resets, 1);
  assert.equal(result.warnings.length, 2);
});

test('display cleanup contains only device metadata, not student account fields', () => {
  assert.deepEqual(Object.keys(clearedDeviceFields).sort(), [
    'deviceCount', 'deviceId', 'deviceIds', 'deviceInfo', 'deviceType', 'lastDeviceId', 'lastDeviceLinkedAt',
  ].sort());
});

test('both admin reset entry points and support use the shared reset flow', async () => {
  const admin = await readFile(new URL('../src/AdminDashboard.jsx', import.meta.url), 'utf8');
  const support = await readFile(new URL('../src/SupportAdmin.jsx', import.meta.url), 'utf8');
  const service = await readFile(new URL('../src/services/device-session.js', import.meta.url), 'utf8');
  assert.match(admin, /handleResetStudentDevices\(s.id\)/);
  assert.match(admin, /handleResetStudentDevices\(selectedStudentProfile.id\)/);
  assert.doesNotMatch(admin, /resetStudentDevicesPatch/);
  const resetHandler = support.slice(support.indexOf('const resetDevice ='), support.indexOf('const toggleBan ='));
  assert.match(resetHandler, /resetStudentDevice\(student.id/);
  assert.doesNotMatch(resetHandler, /updateDoc/);
  assert.match(service, /executeDeviceReset/);
  assert.match(service, /data.ok !== true/);
  assert.match(service, /pendingResets.has\(studentId\)/);
});

test('real browser reset service requires server confirmation and deduplicates pending requests', async () => {
  const source = await readFile(new URL('../src/services/device-session.js', import.meta.url), 'utf8');
  const createService = new Function('auth', 'db', 'doc', 'updateDoc', 'clearedDeviceFields', 'executeDeviceReset', 'fetch',
    source.replace(/^import .*;\r?\n/gm, '').replaceAll('export async function', 'async function')
      + '\nreturn resetStudentDevice;');
  const calls = [];
  let finish;
  const responseReady = new Promise((resolve) => { finish = resolve; });
  const auth = { currentUser: { getIdToken: async () => 'test-token' } };
  const service = createService(auth, {}, (_, collection, id) => ({ collection, id }),
    async (ref, patch) => calls.push({ ref, patch }), clearedDeviceFields, executeDeviceReset,
    async (url, init) => {
      calls.push({ url, init });
      return responseReady;
    });
  const first = service('student');
  const second = service('student');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].init.body), { action: 'reset', studentId: 'student' });
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
  finish({ ok: true, json: async () => ({ ok: true }) });
  assert.deepEqual(await first, { ok: true, warnings: [] });
  await second;
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].patch, clearedDeviceFields);
  for (const response of [
    { ok: false, json: async () => ({ error: 'rejected' }) },
    { ok: true, json: async () => ({}) },
  ]) {
    const rejected = createService(auth, {}, () => assert.fail(), () => assert.fail(),
      clearedDeviceFields, executeDeviceReset, async () => response);
    await assert.rejects(rejected('student'));
    await assert.rejects(rejected('student'));
  }
});

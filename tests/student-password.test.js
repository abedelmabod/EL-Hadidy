import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FieldValue } from 'firebase-admin/firestore';
import { changeStudentPassword, validateNewPassword } from '../api/_student-password.js';
import handler from '../api/student-password.js';

function fixture(options = {}) {
  const student = { authUid: 'auth-student', password: 'legacy-secret', email: 'student@example.test',
    usedCode: 'code', isSubscribed: true, deviceId: 'device', ...options.student };
  const profiles = {
    admins: options.role === 'support' || options.role === 'none' ? {} : {
      manager: { name: 'Manager', isBanned: options.bannedActor },
    },
    support_team: options.role === 'support' ? { staff: { authUid: 'manager', name: 'Support' } } : {},
    students: options.missingStudent ? {} : { student },
  };
  const updates = [], logs = [], authUpdates = [], calls = [];
  function snapshot(collection, id) {
    return { id, exists: Boolean(profiles[collection]?.[id]), data: () => profiles[collection]?.[id] };
  }
  const store = {
    collection(name) {
      assert.ok(['admins', 'support_team', 'students', 'logs'].includes(name));
      return {
        doc: (id) => ({ get: async () => snapshot(name, id), update: async (patch) => {
          if (options.cleanupError) throw new Error('cleanup');
          updates.push({ name, id, patch });
        } }),
        where: (field, operator, value) => {
          assert.equal(operator, '==');
          return { limit: () => ({ get: async () => ({ docs: Object.keys(profiles[name])
            .filter((id) => profiles[name][id][field] === value).map((id) => snapshot(name, id)) }) }) };
        },
        add: async (entry) => {
          if (options.auditError) throw new Error('audit');
          logs.push(entry);
        },
      };
    },
  };
  const auth = {
    getUser: async (uid) => {
      calls.push(uid);
      if (options.missingAuth) throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
      return { disabled: options.disabled };
    },
    projectConfigManager: () => ({ getProjectConfig: async () => {
      if (options.policyError) throw new Error('connection');
      return { passwordPolicyConfig: options.policy };
    } }),
    updateUser: async (uid, patch) => {
      if (options.updateError) throw Object.assign(new Error('sensitive details'), { code: options.updateError });
      authUpdates.push({ uid, patch });
    },
  };
  return { identity: { uid: 'manager', store }, auth, student, updates, logs, authUpdates, calls };
}

const reset = (f, password = ' NewSecret1! ') => changeStudentPassword(f.identity, f.auth, {
  studentId: 'student', password, uid: 'untrusted-browser-uid',
});

for (const role of ['admin', 'support']) {
  test(`${role} resets the server-derived Auth account without altering other data`, async () => {
    const f = fixture({ role });
    const before = { ...f.student };
    assert.deepEqual(await reset(f), { passwordChanged: true, warnings: [] });
    assert.deepEqual(f.authUpdates, [{ uid: 'auth-student', patch: { password: ' NewSecret1! ' } }]);
    assert.deepEqual(f.updates, [{ name: 'students', id: 'student', patch: { password: FieldValue.delete() } }]);
    assert.deepEqual(f.student, before);
    assert.equal(f.logs.length, 1);
    assert.equal(f.logs[0].actorUid, 'manager');
    assert.equal(f.logs[0].actorRole, role);
    assert.equal(f.logs[0].studentId, 'student');
    assert.deepEqual(f.logs[0].time, FieldValue.serverTimestamp());
    assert.doesNotMatch(JSON.stringify(f.logs), /NewSecret|legacy-secret|token/i);
  });
}

test('supports student documents named with the Authentication UID', async () => {
  const f = fixture({ student: { authUid: null } });
  await reset(f);
  assert.deepEqual(f.calls, ['student']);
  assert.equal(f.authUpdates[0].uid, 'student');
});

for (const [name, options, status] of [
  ['unauthorized user', { role: 'none' }, 403],
  ['banned manager', { bannedActor: true }, 403],
  ['banned student', { student: { isBanned: true } }, 403],
  ['disabled Authentication account', { disabled: true }, 403],
  ['missing student', { missingStudent: true }, 404],
  ['missing Authentication account', { missingAuth: true }, 404],
  ['unavailable password policy', { policyError: true }, 503],
  ['Firebase rejected password', { updateError: 'auth/password-does-not-meet-requirements' }, 400],
  ['Firebase connection failure', { updateError: 'auth/internal-error' }, 503],
]) {
  test(`rejects ${name} without cleanup, audit, or successful Auth mutation`, async () => {
    const f = fixture(options);
    await assert.rejects(reset(f), (error) => error.status === status && !error.message.includes('sensitive details'));
    assert.deepEqual(f.authUpdates, []);
    assert.deepEqual(f.updates, []);
    assert.deepEqual(f.logs, []);
  });
}

test('validates the current policy without modifying the supplied password', async () => {
  const policy = { enforcementState: 'ENFORCE', constraints: { minLength: 10, maxLength: 20,
    requireLowercase: true, requireUppercase: true, requireNumeric: true, requireNonAlphanumeric: true } };
  for (const password of ['Short1!', 'lowercase1!', 'UPPERCASE1!', 'NoNumbers!!', 'NoSymbol12 ', 'NoSymbol12ع', 'A'.repeat(21)]) {
    const f = fixture({ policy });
    await assert.rejects(reset(f, password), { status: 400 });
    assert.deepEqual(f.authUpdates, []);
  }
  const f = fixture({ policy });
  await reset(f);
  assert.equal(f.authUpdates[0].patch.password, ' NewSecret1! ');
  assert.throws(() => validateNewPassword('12345'), { status: 400 });
  assert.throws(() => validateNewPassword(null), { status: 400 });
  assert.throws(() => validateNewPassword('x'.repeat(4097)), { status: 400 });
  assert.doesNotThrow(() => validateNewPassword('abcdef', { enforcementState: 'OFF', constraints: { minLength: 20 } }));
});

for (const options of [{ auditError: true }, { cleanupError: true }, { auditError: true, cleanupError: true }]) {
  test(`reports partial success for post-update failures ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    const result = await reset(f);
    assert.equal(result.passwordChanged, true);
    assert.equal(result.warnings.length, Object.keys(options).length);
    assert.equal(f.authUpdates.length, 1);
    if (!options.auditError) assert.equal(f.logs[0].passwordFieldCleared, false);
  });
}

test('HTTP endpoint requires a token and only accepts POST', async () => {
  const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: 'GET', headers: {} }, response);
  assert.equal(response.code, 405);
  await handler({ method: 'POST', headers: {}, body: { studentId: 'student', password: 'secret' } }, response);
  assert.equal(response.code, 401);
});

test('support UI uses the API, locks repeated submissions, and never prefills or writes passwords', async () => {
  const source = await readFile(new URL('../src/SupportAdmin.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /selectedStudent\.password/);
  const handlerSource = source.slice(source.indexOf('const changePassword ='), source.indexOf('const saveSupportCase ='));
  assert.match(handlerSource, /await changeStudentPassword\(student\.id, nextPassword\)/);
  assert.doesNotMatch(handlerSource, /updateDoc|logSupportAction|\.trim\(/);
  assert.match(handlerSource, /passwordInFlightRef\.current = true/);
  assert.match(handlerSource, /setPasswordDraft\(''\)/);
  assert.match(source, /type="password"[\s\S]*?disabled=\{passwordBusy\}[\s\S]*?value=\{passwordDraft\}/);
  assert.match(source, /disabled=\{passwordBusy\}[\s\S]*?aria-busy=\{passwordBusy\}/);
});

test('browser service sends ID token, studentId and unmodified password and requires confirmed success', async () => {
  const source = await readFile(new URL('../src/services/student-password.js', import.meta.url), 'utf8');
  // Run the real service with injected browser dependencies, without initializing Firebase.
  const createService = new Function('auth', 'fetch', source.replace(/^import .*;\r?\n/, '').replace('export async function', 'return async function'));
  const requests = [];
  const auth = { currentUser: { getIdToken: async () => 'test-token' } };
  const service = createService(auth, async (url, init) => {
    requests.push({ url, init });
    return { ok: true, json: async () => ({ passwordChanged: true, warnings: [] }) };
  });
  await service('student', ' NewSecret1! ');
  assert.equal(requests[0].url, '/api/student-password');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), { studentId: 'student', password: ' NewSecret1! ' });
  const unconfirmed = createService(auth, async () => ({ ok: true, json: async () => ({}) }));
  await assert.rejects(unconfirmed('student', 'secret'));
  const offline = createService(auth, async () => { throw new Error('network'); });
  await assert.rejects(offline('student', 'secret'), /لم يمكن تأكيد/);
  await assert.rejects(createService({ currentUser: null }, async () => assert.fail())('student', 'secret'));
  const expired = createService({ currentUser: { getIdToken: async () => { throw new Error('Firebase raw error'); } } }, async () => assert.fail());
  await assert.rejects(expired('student', 'secret'), /تعذر تأكيد جلسة الدخول/);
});

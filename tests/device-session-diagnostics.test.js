import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceSessionMessage, logDeviceSessionRejection } from '../api/_device-session-diagnostics.js';

test('missing platform and missing session have distinct, actionable messages', () => {
  assert.match(deviceSessionMessage('PLATFORM_REQUIRED'), /نوع التطبيق/);
  assert.match(deviceSessionMessage('SESSION_REQUIRED'), /جلسة الدخول المطلوبة/);
  assert.notEqual(deviceSessionMessage('PLATFORM_REQUIRED'), deviceSessionMessage('DEVICE_MISMATCH'));
  assert.match(deviceSessionMessage('SESSION_ACTIVE'), /سجّل الخروج/);
  assert.match(deviceSessionMessage('DESKTOP_NOT_APPROVED'), /موافقة الدكتور/);
});

test('rejection logs contain only allowlisted metadata, not credentials or student data', () => {
  const entries = [];
  const req = {
    headers: { authorization: 'Bearer private-token', 'x-device-id': 'private-id',
      'x-device-secret': 'private-secret', 'x-student-session': 'private-session' },
    body: { studentId: 'private-student', password: 'private-password' },
  };
  logDeviceSessionRejection(req, 'bind', 'PLATFORM_REQUIRED', 400, (...args) => entries.push(args));
  assert.deepEqual(entries, [['Device session rejected', JSON.stringify({
    code: 'PLATFORM_REQUIRED', status: 400, action: 'bind', platform: 'missing',
  })]]);
  assert.doesNotMatch(JSON.stringify(entries), /private-/);
});

test('untrusted metadata cannot inject log contents', () => {
  const entries = [];
  logDeviceSessionRejection({ headers: { 'x-client-platform': 'private-platform' } },
    'private-action', 'private-code', 'private-status', (...args) => entries.push(args));
  assert.deepEqual(JSON.parse(entries[0][1]), {
    code: 'UNKNOWN_REJECTION', status: 500, action: 'unknown', platform: 'invalid',
  });
  assert.doesNotMatch(JSON.stringify(entries), /private-/);
  assert.equal(deviceSessionMessage('__proto__'), deviceSessionMessage('unknown'));
});

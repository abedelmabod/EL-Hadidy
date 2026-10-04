import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { getDatabase } from '../api/_quiz-server.js';
import handler, { processStudyPlan } from '../api/study-plan.js';

const snapshot = (id, data) => ({ id, exists: !!data, data: () => data });
const identity = (uid, revoked = false) => ({ uid, store: { collection: (name) => ({
  doc: (id) => ({ get: async () => snapshot(id,
    name === 'students' && id === uid && uid.startsWith('student')
      ? { authUid: uid, usedCodes: ['12345'] }
      : name === 'admins' && id === uid && uid === 'admin-plan'
        ? { authUid: uid }
        : name === 'lessons' && id === 'lesson-plan' ? { year: 'الفرقة الأولى', isActive: true } : null) }),
  where: (field, _operator, value) => ({ limit() { return this; }, get: async () => ({
    empty: true,
    docs: name === 'codes' && field === 'code' && value === '12345'
      ? [snapshot('code-plan', { code: '12345', year: 'الفرقة الأولى', isUsed: true, revoked })] : [],
  }) }),
}) } });

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }, setHeader() {} });
const call = async (db, who, method, body = null, query = {}) => {
  const res = response();
  await processStudyPlan({ method, body, query }, res, identity(who), db);
  return res.body;
};

test('study plan API rejects unauthenticated requests and unsupported methods', async () => {
  const missing = response();
  await handler({ method: 'GET', headers: {}, query: {} }, missing);
  assert.equal(missing.statusCode, 401);
  const unsupported = response();
  await handler({ method: 'DELETE', headers: {} }, unsupported);
  assert.equal(unsupported.statusCode, 405);
});

test('teacher priorities and student preferences, postponement, and completion persist separately', async () => {
  process.env.TURSO_DATABASE_URL = 'file::memory:';
  process.env.TURSO_AUTH_TOKEN = 'local-test-only';
  const db = await getDatabase();
  const admin = await call(db, 'admin-plan', 'POST', { action: 'admin', lessonId: 'lesson-plan', priority: 3, targetDate: '2026-10-12' });
  assert.equal(admin.ok, true);
  const prefs = await call(db, 'student-plan', 'POST', { action: 'preferences', restDays: [5, 5], remindersEnabled: true });
  assert.deepEqual(prefs.restDays, [5]);
  await call(db, 'student-plan', 'POST', { action: 'postpone', taskKey: 'video:lesson-plan', until: '2026-10-12' });
  await call(db, 'student-plan', 'POST', { action: 'completeVideo', lessonId: 'lesson-plan' });
  const plan = await call(db, 'student-plan', 'GET');
  assert.equal(plan.priorities.find((item) => item.lessonId === 'lesson-plan').priority, 3);
  assert.deepEqual(plan.preferences.restDays, [5]);
  assert.equal(plan.tasks[0].postponedUntil, '2026-10-12');
  assert.deepEqual(plan.completedLessonIds, ['lesson-plan']);
  assert.deepEqual(plan.attemptedLessonIds, []);
  const other = await call(db, 'student-other', 'GET');
  assert.equal(other.tasks.length, 0);
  assert.equal(other.completedLessonIds.length, 0);
  await call(db, 'student-plan', 'POST', { action: 'postpone', taskKey: 'video:lesson-plan', until: null });
  assert.equal((await call(db, 'student-plan', 'GET')).tasks.length, 0);
});

test('student cannot set teacher priorities or postpone a lesson without access', async () => {
  const db = await getDatabase();
  await assert.rejects(() => call(db, 'student-plan', 'POST', { action: 'admin', lessonId: 'lesson-plan', priority: 3 }), { status: 403 });
  await assert.rejects(() => call(db, 'student-plan', 'POST', { action: 'postpone', taskKey: 'video:missing', until: '2026-10-12' }), { status: 404 });
  await assert.rejects(() => call(db, 'student-plan', 'POST', { action: 'preferences', restDays: [8], remindersEnabled: false }), { status: 400 });
  await assert.rejects(() => processStudyPlan({ method: 'POST', body: { action: 'completeVideo', lessonId: 'lesson-plan' } },
    response(), identity('student-revoked', true), db), { status: 403 });
});

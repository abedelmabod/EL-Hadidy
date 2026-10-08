import test from 'node:test';
import assert from 'node:assert/strict';
import { activateStudentCode } from '../api/_desktop-student.js';

function fakeStore(profile = { authUid: 'uid', usedCodes: [], accessYears: [] }) {
  let data = { student: structuredClone(profile), code: { code: '12345678', year: 'الفرقة الأولى', isUsed: false } };
  let tail = Promise.resolve();
  const store = {
    get data() { return data; },
    collection(name) { return {
      doc: (id) => ({ name, id }),
      where: (_key, _op, value) => ({ name, value, limit() { return this; } }),
    }; },
    async runTransaction(callback) {
      const previous = tail; let done; tail = new Promise((resolve) => { done = resolve; }); await previous;
      const snapshot = structuredClone(data);
      try {
        const result = await callback({
          async get(ref) {
            if (ref.name === 'students') return { id: 'student', exists: true, data: () => snapshot.student };
            return { size: 1, docs: [{ ref: { name: 'codes' }, data: () => snapshot.code }] };
          },
          update(ref, patch) { Object.assign(ref.name === 'students' ? snapshot.student : snapshot.code, patch); },
        });
        data = snapshot; return result;
      } finally { done(); }
    },
  };
  return store;
}
test('code redemption writes access and ownership in one transaction without device changes', async () => {
  const store = fakeStore({ authUid: 'uid', deviceId: 'phone', usedCodes: [], accessYears: [] });
  await activateStudentCode(store, 'uid', 'student', '12345678');
  assert.equal(store.data.code.isUsed, true); assert.equal(store.data.code.usedById, 'student');
  assert.equal(store.data.student.deviceId, 'phone'); assert.deepEqual(store.data.student.accessYears, ['الفرقة الأولى']);
});
test('simultaneous redemptions succeed only once', async () => {
  const store = fakeStore();
  const results = await Promise.allSettled([activateStudentCode(store, 'uid', 'student', '12345678'), activateStudentCode(store, 'uid', 'student', '12345678')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});
test('mismatched owner, banned profile and malformed code do not alter data', async () => {
  for (const [profile, uid, code] of [[{ authUid: 'other' }, 'uid', '12345678'], [{ authUid: 'uid', isBanned: true }, 'uid', '12345678'], [{ authUid: 'uid' }, 'uid', 'invalid']]) {
    const store = fakeStore(profile); const before = structuredClone(store.data);
    await assert.rejects(activateStudentCode(store, uid, 'student', code)); assert.deepEqual(store.data, before);
  }
});

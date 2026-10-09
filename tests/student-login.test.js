import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { sessionSchema } from '../api/_student-session.js';
import { loginStudent } from '../api/_student-login.js';

async function fixture(overrides = {}) {
  const db = createClient({ url: 'file::memory:' });
  await db.batch(sessionSchema, 'write');
  const doc = { id: 'document', exists: true, data: () => ({ authUid: 'uid', email: 'student@gmail.com', ...overrides }) };
  const calls = [];
  return { db, calls, options: { db,
    store: { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [doc] }) }) }), doc: () => ({ get: async () => doc }) }) },
    firebaseAuth: { verifyIdToken: async () => ({ uid: 'uid' }) },
    authenticate: async (email, password) => { calls.push({ email, password }); return { localId: 'uid', idToken: 'id', refreshToken: 'refresh', expiresIn: '3600' }; },
    identifier: 'student', password: ' Secret1! ', address: 'test-ip',
  } };
}

test('Gmail username and email resolve to the same authenticated account without trimming passwords', async () => {
  const f = await fixture();
  try {
    const byName = await loginStudent(f.options);
    const byEmail = await loginStudent({ ...f.options, identifier: 'student@gmail.com' });
    assert.deepEqual(byName, byEmail);
    assert.deepEqual(f.calls, [{ email: 'student@gmail.com', password: ' Secret1! ' }, { email: 'student@gmail.com', password: ' Secret1! ' }]);
    assert.deepEqual(Object.keys(byName).sort(), ['expiresIn', 'idToken', 'localId', 'refreshToken']);
  } finally { f.db.close(); }
});

test('wrong password, mismatched identity, bans and incomplete Auth responses cannot issue credentials', async () => {
  const f = await fixture();
  try {
    await assert.rejects(loginStudent({ ...f.options, authenticate: async () => { throw Error('wrong password'); } }));
    await assert.rejects(loginStudent({ ...f.options, firebaseAuth: { verifyIdToken: async () => ({ uid: 'other' }) } }), { status: 401 });
    await assert.rejects(loginStudent({ ...f.options, authenticate: async () => ({ localId: 'uid' }) }), { status: 503 });
    await f.db.execute("INSERT INTO student_access_blocks VALUES ('uid', 1, 'ban')");
    await assert.rejects(loginStudent(f.options), { status: 403 });
  } finally { f.db.close(); }
  const banned = await fixture({ isBanned: true });
  try { await assert.rejects(loginStudent(banned.options), { status: 403 }); }
  finally { banned.db.close(); }
});

test('login rate limits are enforced in Turso without storing identifiers or passwords', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 10; i += 1) await loginStudent(f.options);
    await assert.rejects(loginStudent(f.options), { status: 429 });
    const rows = (await f.db.execute('SELECT * FROM student_login_attempts')).rows;
    assert.doesNotMatch(JSON.stringify(rows), /student|Secret|test-ip/);
  } finally { f.db.close(); }
});

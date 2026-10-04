import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSession } from '../api/admin-session.js';
import { hashAdminPassword, matchesLegacyPassword, verifyAdminPassword } from '../api/_admin-password.js';

const makeStore = () => {
  const admin = { username: 'admin', password: 'a-strong-new-password' };
  const attempts = new Map();
  const updates = [];
  const store = {
    runTransaction: async (callback) => callback({
      get: (ref) => ref.get(),
      set: (ref, data) => attempts.set(ref.id, data),
    }),
    collection(name) {
      if (name === 'admin_login_attempts') return {
        doc: (id) => ({
          id,
          get: async () => ({ exists: attempts.has(id), data: () => attempts.get(id) }),
          delete: async () => { attempts.delete(id); },
        }),
      };
      if (name === 'admins') return {
        where: () => ({ limit: () => ({ get: async () => ({ docs: [{
          id: 'legacy-admin-id',
          data: () => admin,
          ref: { update: async (patch) => {
            updates.push(patch);
            Object.assign(admin, patch);
            if ('password' in patch) delete admin.password;
          } },
        }] }) }) }),
      };
      throw new Error(`Unexpected collection: ${name}`);
    },
  };
  return { store, admin, updates };
};

test('admin password hashes verify without retaining the plain text', async () => {
  const hash = await hashAdminPassword('a-strong-new-password');
  assert.match(hash, /^scrypt:v1:/);
  assert.equal(await verifyAdminPassword(hash, 'a-strong-new-password'), true);
  assert.equal(await verifyAdminPassword(hash, 'wrong'), false);
  assert.equal(await verifyAdminPassword('broken', 'a-strong-new-password'), false);
  assert.equal(matchesLegacyPassword('a-strong-new-password', 'wrong'), false);
});

test('legacy admin login creates a token and migrates the password', async () => {
  const { store, admin, updates } = makeStore();
  const auth = { createCustomToken: async (uid) => `token-for-${uid}` };
  const first = await createAdminSession(store, auth, 'admin', 'a-strong-new-password');
  assert.equal(first.customToken, 'token-for-admin:legacy-admin-id');
  assert.equal(admin.authUid, 'admin:legacy-admin-id');
  assert.equal('password' in admin, false);
  assert.equal(await verifyAdminPassword(admin.passwordHash, 'a-strong-new-password'), true);
  assert.equal(updates.length, 1);

  const second = await createAdminSession(store, auth, 'admin', 'a-strong-new-password');
  assert.equal(second.customToken, first.customToken);
  assert.equal(updates.length, 2);
});

test('wrong password cannot create a token and is rate limited', async () => {
  const { store, updates } = makeStore();
  let issued = 0;
  const auth = { createCustomToken: async () => { issued += 1; return 'token'; } };
  for (let index = 0; index < 10; index += 1) {
    await assert.rejects(createAdminSession(store, auth, 'admin', 'wrong'), { status: 401 });
  }
  await assert.rejects(createAdminSession(store, auth, 'admin', 'a-strong-new-password'), { status: 429 });
  assert.equal(issued, 0);
  assert.equal(updates.length, 0);
});

test('a new Firestore password replaces the old hash on next login', async () => {
  const { store, admin } = makeStore();
  const auth = { createCustomToken: async () => 'token' };
  await createAdminSession(store, auth, 'admin', 'a-strong-new-password');
  admin.password = 'a-different-strong-password';
  await assert.rejects(createAdminSession(store, auth, 'admin', 'a-strong-new-password'), { status: 401 });
  await createAdminSession(store, auth, 'admin', 'a-different-strong-password');
  assert.equal('password' in admin, false);
  assert.equal(await verifyAdminPassword(admin.passwordHash, 'a-different-strong-password'), true);
  assert.equal(await verifyAdminPassword(admin.passwordHash, 'a-strong-new-password'), false);
});

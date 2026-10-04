import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseApp, HttpError } from './_quiz-server.js';
import { hashAdminPassword, matchesLegacyPassword, verifyAdminPassword } from './_admin-password.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

async function reserveAttempt(store, identifier) {
  const id = createHash('sha256').update(identifier).digest('hex');
  const ref = store.collection('admin_login_attempts').doc(id);
  await store.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : {};
    const now = Date.now();
    const startedAt = Number(data.startedAt || 0);
    const attempts = now - startedAt < WINDOW_MS ? Number(data.attempts || 0) : 0;
    if (attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'محاولات دخول كثيرة. حاول بعد 15 دقيقة.');
    transaction.set(ref, { startedAt: attempts ? startedAt : now, attempts: attempts + 1 });
  });
  return () => ref.delete().catch(() => null);
}

export async function createAdminSession(store, firebaseAuth, identifier, password) {
  if (typeof identifier !== 'string' || typeof password !== 'string'
    || !identifier || identifier.length > 100 || !password || password.length > 256) {
    throw new HttpError(400, 'بيانات الدخول غير صالحة.');
  }

  const username = identifier.trim().toLowerCase();
  const results = await store.collection('admins').where('username', '==', username).limit(1).get();
  const profile = results.docs[0];
  if (!profile) throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة.');
  const clearAttempts = await reserveAttempt(store, username);
  const data = profile?.data();
  const hasNewPlainPassword = typeof data.password === 'string' && !!data.password;
  const valid = !data.isBanned && (hasNewPlainPassword
    ? matchesLegacyPassword(data.password, password)
    : await verifyAdminPassword(data.passwordHash, password));
  if (!valid) throw new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة.');

  const uid = data.authUid || `admin:${profile.id}`;
  const customToken = await firebaseAuth.createCustomToken(uid);
  const patch = { authUid: uid };
  if (hasNewPlainPassword) patch.passwordHash = await hashAdminPassword(password);
  if (data.password !== undefined) patch.password = FieldValue.delete();
  await profile.ref.update(patch);
  await clearAttempts();
  return { customToken };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const app = firebaseApp();
    const result = await createAdminSession(getFirestore(app), getAuth(app), body.identifier, body.password);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'بيانات الطلب غير صالحة.' });
    console.error('Admin session failure:', error);
    return res.status(500).json({ error: 'تعذر تسجيل الدخول حاليًا. حاول مرة أخرى.' });
  }
}

import { createHash } from 'node:crypto';
import { HttpError } from './_quiz-server.js';

const invalid = () => new HttpError(401, 'اسم المستخدم أو كلمة المرور غير صحيحة.');
const hash = (value) => createHash('sha256').update(value).digest('hex');

export async function reserveStudentLogin(db, identifier, address) {
  const tx = await db.transaction('write');
  try {
    const now = Date.now();
    for (const [bucket, limit] of [[hash(`user:${identifier}`), 10], [hash(`ip:${address}`), 40]]) {
      const previous = (await tx.execute({ sql: 'SELECT * FROM student_login_attempts WHERE bucket = ?', args: [bucket] })).rows[0];
      const attempts = previous && now - previous.started_at < 900000 ? previous.attempts : 0;
      if (attempts >= limit) throw new HttpError(429, 'محاولات كثيرة. حاول بعد 15 دقيقة.');
      await tx.execute({ sql: `INSERT INTO student_login_attempts VALUES (?, ?, ?)
        ON CONFLICT(bucket) DO UPDATE SET started_at = excluded.started_at, attempts = excluded.attempts`,
      args: [bucket, attempts ? previous.started_at : now, attempts + 1] });
    }
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  finally { tx.close(); }
}

export async function loginStudent({ db, store, firebaseAuth, authenticate, identifier, password, address }) {
  if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 254
    || typeof password !== 'string' || !password || password.length > 4096) throw new HttpError(400, 'بيانات الدخول غير صالحة.');
  const normalized = identifier.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776)).trim().toLowerCase();
  await reserveStudentLogin(db, normalized, address);
  let profile;
  let email = normalized;
  if (!normalized.includes('@')) {
    const matches = await store.collection('students').where('username', '==', normalized).limit(2).get();
    if (matches.docs.length !== 1) throw invalid();
    profile = matches.docs[0];
    email = profile.data().email;
    if (typeof email !== 'string' || !email.includes('@')) throw invalid();
  }
  const response = await authenticate(email, password);
  if (!response || typeof response.idToken !== 'string' || typeof response.refreshToken !== 'string'
    || typeof response.localId !== 'string' || !/^\d+$/.test(String(response.expiresIn))) throw new HttpError(503, 'تعذر تأكيد تسجيل الدخول.');
  const decoded = await firebaseAuth.verifyIdToken(response.idToken, true).catch(() => { throw invalid(); });
  if (decoded.uid !== response.localId) throw invalid();
  if (!profile) {
    const direct = await store.collection('students').doc(decoded.uid).get();
    profile = direct.exists ? direct : (await store.collection('students').where('authUid', '==', decoded.uid).limit(1).get()).docs[0];
  }
  if (!profile || (profile.data().authUid || profile.id) !== decoded.uid) throw invalid();
  if (['isBanned', 'blocked', 'isBlocked', 'disabled', 'isDisabled'].some((key) => profile.data()[key])) {
    throw new HttpError(403, 'الحساب غير متاح. تواصل مع الدعم الفني.');
  }
  const blocked = (await db.execute({ sql: 'SELECT blocked FROM student_access_blocks WHERE student_uid = ?', args: [decoded.uid] })).rows[0];
  if (blocked?.blocked) throw new HttpError(403, 'الحساب غير متاح. تواصل مع الدعم الفني.');
  return { localId: decoded.uid, idToken: response.idToken, refreshToken: response.refreshToken, expiresIn: String(response.expiresIn) };
}

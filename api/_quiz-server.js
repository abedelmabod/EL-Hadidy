import { createClient } from '@libsql/client';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { activeCodeGrantsAccess } from './_quiz-domain.js';

let database;
let schemaPromise;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function firebaseApp() {
  if (getApps().length) return getApps()[0];
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new HttpError(503, 'Firebase server credentials are not configured.');
  let credentials;
  try { credentials = JSON.parse(json); }
  catch { throw new HttpError(503, 'Firebase server credentials are invalid.'); }
  return initializeApp({ credential: cert(credentials) });
}

export async function getDatabase() {
  if (!database) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url || !authToken) throw new HttpError(503, 'Turso is not configured.');
    database = createClient({ url, authToken });
  }
  if (!schemaPromise) {
    schemaPromise = database.batch([
      `CREATE TABLE IF NOT EXISTS quizzes (
        id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS quiz_questions (
        id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL, prompt TEXT NOT NULL,
        options_json TEXT NOT NULL, answer_index INTEGER NOT NULL,
        explanation TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
      )`,
      'CREATE INDEX IF NOT EXISTS quiz_questions_quiz ON quiz_questions(quiz_id, sort_order)',
      `CREATE TABLE IF NOT EXISTS quiz_attempts (
        id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL, student_uid TEXT NOT NULL,
        answers_json TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL,
        submitted_at TEXT NOT NULL, UNIQUE(quiz_id, student_uid)
      )`,
      `CREATE TABLE IF NOT EXISTS quiz_reviews (
        id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL, student_uid TEXT NOT NULL,
        question_ids_json TEXT NOT NULL, step INTEGER NOT NULL, due_at TEXT NOT NULL,
        completed_at TEXT, score INTEGER, UNIQUE(quiz_id, student_uid, step)
      )`,
      'CREATE INDEX IF NOT EXISTS quiz_reviews_student ON quiz_reviews(student_uid, due_at)',
      `CREATE TABLE IF NOT EXISTS quiz_versions (
        quiz_id TEXT NOT NULL, version INTEGER NOT NULL, questions_json TEXT NOT NULL,
        published_at TEXT NOT NULL, PRIMARY KEY (quiz_id, version)
      )`,
      `CREATE TABLE IF NOT EXISTS quiz_revision_drafts (
        quiz_id TEXT PRIMARY KEY, title TEXT NOT NULL, questions_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS quiz_attempt_versions (
        attempt_id TEXT PRIMARY KEY, version INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS quiz_attempt_students (
        attempt_id TEXT PRIMARY KEY, student_name TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS quiz_review_answers (
        review_id TEXT PRIMARY KEY, answers_json TEXT NOT NULL, wrong_ids_json TEXT NOT NULL
      )`,
    ], 'write').catch((error) => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
  return database;
}

export async function identify(req) {
  const match = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
  if (!match) throw new HttpError(401, 'سجّل الدخول أولًا.');
  const app = firebaseApp();
  const decoded = await getAuth(app).verifyIdToken(match[1], true).catch(() => { throw new HttpError(401, 'انتهت جلسة الدخول.'); });
  const store = getFirestore(app);
  return { uid: decoded.uid, store };
}

async function findProfile(store, collection, uid) {
  const direct = await store.collection(collection).doc(uid).get();
  if (direct.exists && (!direct.data().authUid || direct.data().authUid === uid)) return { id: direct.id, ...direct.data() };
  const query = await store.collection(collection).where('authUid', '==', uid).limit(1).get();
  return query.empty ? null : { id: query.docs[0].id, ...query.docs[0].data() };
}

export async function requireAdmin(identity) {
  const profile = await findProfile(identity.store, 'admins', identity.uid);
  if (!profile || profile.isBanned) throw new HttpError(403, 'ليس لديك صلاحية إدارة الاختبارات.');
  return profile;
}

export async function requireStudent(identity) {
  const profile = await findProfile(identity.store, 'students', identity.uid);
  if (!profile || profile.isBanned) throw new HttpError(403, 'الحساب غير مؤهل.');
  return profile;
}

export async function requireLessonAccess(identity, student, lessonId) {
  if (!lessonId || typeof lessonId !== 'string') throw new HttpError(400, 'المحاضرة مطلوبة.');
  const snap = await identity.store.collection('lessons').doc(lessonId).get();
  if (!snap.exists || snap.data().isActive === false) throw new HttpError(404, 'المحاضرة غير متاحة.');
  const lesson = { id: snap.id, ...snap.data() };
  if (!lesson.year) throw new HttpError(403, 'المحاضرة غير مرتبطة بمرحلة.');
  const codesByOwner = await identity.store.collection('codes').where('usedById', '==', student.id).get();
  const usedCodes = Array.isArray(student.usedCodes) ? student.usedCodes : [student.usedCode];
  const codeQueries = usedCodes.filter(Boolean).slice(0, 10).map((code) => identity.store.collection('codes').where('code', '==', String(code)).get());
  const extra = await Promise.all(codeQueries);
  const codes = new Map([...codesByOwner.docs, ...extra.flatMap((result) => result.docs)].map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));
  if (![...codes.values()].some((code) => activeCodeGrantsAccess(code, student, lesson.year))) {
    throw new HttpError(403, 'لا يوجد كود نشط لهذه المرحلة.');
  }
  return lesson;
}

export async function requireExistingLesson(identity, lessonId) {
  if (!lessonId || typeof lessonId !== 'string') throw new HttpError(400, 'المحاضرة مطلوبة.');
  const snap = await identity.store.collection('lessons').doc(lessonId).get();
  if (!snap.exists) throw new HttpError(404, 'المحاضرة غير موجودة.');
  return { id: snap.id, ...snap.data() };
}

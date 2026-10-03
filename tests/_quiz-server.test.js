import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { getDatabase } from '../api/_quiz-server.js';
import { handleAdminPost, handleGet, handleStudentPost } from '../api/quizzes.js';

const snapshot = (id, data) => ({ id, exists: !!data, data: () => data });
const makeIdentity = (uid) => ({
  uid,
  store: {
    collection(name) {
      return {
        doc(id) { return { get: async () => snapshot(id, name === 'admins' && id === 'admin-1'
          ? { authUid: id }
          : name === 'students' && ['student-1', 'student-2', 'student-3'].includes(id) ? { authUid: id, usedCodes: ['12345'], name: `Student ${id}` }
            : name === 'lessons' && id === 'lesson-1' ? { year: 'الفرقة الأولى', isActive: true }
              : null) }; },
        where(field, operator, value) {
          return { limit() { return this; }, get: async () => ({
            empty: name !== 'codes' || (field !== 'code' || value !== '12345'),
            docs: name === 'codes' && field === 'code' && value === '12345'
              ? [snapshot('code-1', { code: '12345', year: 'الفرقة الأولى', isUsed: true })] : [],
          }) };
        },
      };
    },
  },
});

test('quiz schema initializes in a local SQLite database', async () => {
  process.env.TURSO_DATABASE_URL = 'file::memory:';
  process.env.TURSO_AUTH_TOKEN = 'local-test-only';
  const database = await getDatabase();
  const result = await database.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  const names = result.rows.map((row) => row.name);
  for (const name of ['quizzes', 'quiz_questions', 'quiz_attempts', 'quiz_reviews', 'quiz_versions', 'quiz_revision_drafts', 'quiz_attempt_versions']) {
    assert.ok(names.includes(name), `${name} must exist`);
  }
});

test('teacher publishes, student submits once, and wrong answers become due reviews', async () => {
  process.env.TURSO_DATABASE_URL = 'file::memory:';
  process.env.TURSO_AUTH_TOKEN = 'local-test-only';
  const db = await getDatabase();
  const admin = makeIdentity('admin-1');
  const student = makeIdentity('student-1');
  const draft = await handleAdminPost('save', {
    lessonId: 'lesson-1', title: 'اختبار تجريبي',
    questions: [{ prompt: 'أي اختيار صحيح؟', options: ['الأول', 'الثاني', 'الثالث', 'الرابع'], answerIndex: 1, explanation: 'الثاني هو الصحيح.' }],
  }, admin, db);
  await handleAdminPost('publish', { quizId: draft.quizId }, admin, db);

  const shown = await handleGet({ query: { action: 'quiz', lessonId: 'lesson-1' } }, student, db);
  assert.equal(shown.questions.length, 1);
  assert.equal(shown.questions[0].answerIndex, undefined);
  const submitted = await handleStudentPost('submit', { lessonId: 'lesson-1', answers: [0] }, student, db);
  assert.equal(submitted.result.correct, 0);
  await assert.rejects(() => handleStudentPost('submit', { lessonId: 'lesson-1', answers: [1] }, student, db), { status: 409 });
  const due = await handleGet({ query: { action: 'reviews' } }, student, db);
  assert.equal(due.reviews.length, 3);

  const firstReview = due.reviews[0];
  await db.execute({ sql: 'UPDATE quiz_reviews SET due_at = ? WHERE id = ?', args: [new Date(0).toISOString(), firstReview.id] });
  const review = await handleGet({ query: { action: 'review', reviewId: firstReview.id } }, student, db);
  assert.equal(review.questions[0].answerIndex, undefined);
  const result = await handleStudentPost('submitReview', { reviewId: firstReview.id, answers: [1] }, student, db);
  assert.equal(result.result.correct, 1);
  const remaining = await handleGet({ query: { action: 'reviews' } }, student, db);
  assert.equal(remaining.reviews.length, 1);

  const history = await handleGet({ query: { action: 'quiz', lessonId: 'lesson-1' } }, student, db);
  assert.equal(history.history[0].answerIndex, 1);
  assert.equal(history.history[0].selectedIndex, 0);
  assert.equal(history.quiz.result.version, 1);
  const listing = await handleGet({ query: { action: 'history' } }, student, db);
  assert.equal(listing.history.length, 1);
  assert.equal(listing.history[0].score, 0);

  const summary = await handleGet({ query: { action: 'adminStats', lessonId: 'lesson-1' } }, admin, db);
  assert.equal(summary.totalAttempts, 1);
  assert.equal(summary.questions[0].errorPercent, 100);
  assert.equal(summary.attempts[0].studentName, 'Student student-1');

  const waitingStudent = makeIdentity('student-3');
  await handleStudentPost('submit', { lessonId: 'lesson-1', answers: [0] }, waitingStudent, db);

  await handleAdminPost('save', { lessonId: 'lesson-1', title: 'نسخة مصححة', questions: [
    { prompt: 'سؤال مصحح', options: ['أ', 'ب', 'ج', 'د'], answerIndex: 0, explanation: 'أ صحيح' },
  ] }, admin, db);
  const revision = await handleGet({ query: { action: 'adminQuiz', lessonId: 'lesson-1' } }, admin, db);
  assert.equal(revision.quiz.hasRevisionDraft, true);
  await handleAdminPost('publish', { quizId: draft.quizId }, admin, db);
  const originalHistory = await handleGet({ query: { action: 'quiz', lessonId: 'lesson-1' } }, student, db);
  assert.equal(originalHistory.history[0].prompt, 'أي اختيار صحيح؟');
  const oldReviews = await handleGet({ query: { action: 'reviews' } }, waitingStudent, db);
  await db.execute({ sql: 'UPDATE quiz_reviews SET due_at = ? WHERE id = ?', args: [new Date(0).toISOString(), oldReviews.reviews[0].id] });
  const oldReview = await handleGet({ query: { action: 'review', reviewId: oldReviews.reviews[0].id } }, waitingStudent, db);
  assert.equal(oldReview.questions[0].prompt, 'أي اختيار صحيح؟');
  const newStudent = makeIdentity('student-2');
  const newerQuiz = await handleGet({ query: { action: 'quiz', lessonId: 'lesson-1' } }, newStudent, db);
  assert.equal(newerQuiz.questions[0].prompt, 'سؤال مصحح');
  await handleStudentPost('submit', { lessonId: 'lesson-1', answers: [0] }, newStudent, db);
  const newHistory = await handleGet({ query: { action: 'quiz', lessonId: 'lesson-1' } }, newStudent, db);
  assert.equal(newHistory.quiz.result.version, 2);
  const latestStats = await handleGet({ query: { action: 'adminStats', lessonId: 'lesson-1' } }, admin, db);
  assert.equal(latestStats.totalAttempts, 3);

  await handleAdminPost('pause', { quizId: draft.quizId }, admin, db);
  const pausedHistory = await handleGet({ query: { action: 'quiz', lessonId: 'lesson-1' } }, student, db);
  assert.equal(pausedHistory.quiz.attempted, true);
  await handleAdminPost('resume', { quizId: draft.quizId }, admin, db);
});

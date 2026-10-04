import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { getDatabase, requireAdmin } from '../api/_quiz-server.js';
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

test('admin access accepts a linked Firebase UID and rejects a mismatched one', async () => {
  const linked = {
    uid: 'firebase-admin-1',
    store: { collection: () => ({
      doc: () => ({ get: async () => snapshot('firebase-admin-1', null) }),
      where: () => ({ limit() { return this; }, get: async () => ({
        empty: false, docs: [snapshot('legacy-admin-doc', { authUid: 'firebase-admin-1' })],
      }) }),
    }) },
  };
  assert.equal((await requireAdmin(linked)).id, 'legacy-admin-doc');

  const mismatched = {
    uid: 'firebase-admin-1',
    store: { collection: () => ({
      doc: () => ({ get: async () => snapshot('firebase-admin-1', { authUid: 'someone-else' }) }),
      where: () => ({ limit() { return this; }, get: async () => ({ empty: true, docs: [] }) }),
    }) },
  };
  await assert.rejects(() => requireAdmin(mismatched), { status: 403 });
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
  const initialStats = await handleGet({ query: { action: 'adminStats', lessonId: 'lesson-1' } }, admin, db);
  assert.equal(initialStats.needsReview[0].studentUid, 'student-1');
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
  const pendingPlanReviews = await handleGet({ query: { action: 'pendingReviews' } }, student, db);
  assert.equal(pendingPlanReviews.reviews.length, 0);

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

  await handleAdminPost('save', { lessonId: 'lesson-1', title: 'تعديل غير منشور', questions: [
    { prompt: 'سؤال جديد', options: ['أ', 'ب', 'ج', 'د'], answerIndex: 0 },
  ] }, admin, db);
  await assert.rejects(() => handleAdminPost('delete', { quizId: draft.quizId }, student, db), { status: 403 });
  await handleAdminPost('delete', { quizId: draft.quizId }, admin, db);

  for (const [table, key] of [['quizzes', 'id'], ['quiz_questions', 'quiz_id'], ['quiz_versions', 'quiz_id'], ['quiz_revision_drafts', 'quiz_id'], ['quiz_attempts', 'quiz_id'], ['quiz_reviews', 'quiz_id']]) {
    const count = await db.execute({ sql: `SELECT COUNT(*) AS total FROM ${table} WHERE ${key} = ?`, args: [draft.quizId] });
    assert.equal(Number(count.rows[0].total), 0, `${table} should be empty after deletion`);
  }
  for (const table of ['quiz_attempt_versions', 'quiz_attempt_students', 'quiz_review_answers']) {
    const count = await db.execute(`SELECT COUNT(*) AS total FROM ${table}`);
    assert.equal(Number(count.rows[0].total), 0, `${table} should have no orphaned rows`);
  }
  assert.equal((await handleGet({ query: { action: 'quiz', lessonId: 'lesson-1' } }, student, db)).quiz, null);
  assert.equal((await handleGet({ query: { action: 'reviews' } }, student, db)).reviews.length, 0);
  assert.equal((await handleGet({ query: { action: 'history' } }, student, db)).history.length, 0);
  assert.equal((await handleGet({ query: { action: 'adminList' } }, admin, db)).quizzes.length, 0);

  const replacement = await handleAdminPost('save', {
    lessonId: 'lesson-1', title: 'اختبار بديل',
    questions: [{ prompt: 'سؤال بديل', options: ['أ', 'ب', 'ج', 'د'], answerIndex: 0 }],
  }, admin, db);
  await handleAdminPost('delete', { quizId: replacement.quizId }, admin, db);
  assert.equal((await handleGet({ query: { action: 'adminList' } }, admin, db)).quizzes.length, 0);

  const pausedReplacement = await handleAdminPost('save', {
    lessonId: 'lesson-1', title: 'اختبار متوقف',
    questions: [{ prompt: 'سؤال بديل', options: ['أ', 'ب', 'ج', 'د'], answerIndex: 0 }],
  }, admin, db);
  await handleAdminPost('publish', { quizId: pausedReplacement.quizId }, admin, db);
  await handleAdminPost('pause', { quizId: pausedReplacement.quizId }, admin, db);
  await handleAdminPost('delete', { quizId: pausedReplacement.quizId }, admin, db);
  assert.equal((await handleGet({ query: { action: 'adminList' } }, admin, db)).quizzes.length, 0);
});

test('practice draws a stable question set, allows retries, reports results, and deletes cleanly', async () => {
  const db = await getDatabase();
  const admin = makeIdentity('admin-1');
  const student = makeIdentity('student-1');
  const draft = await handleAdminPost('save', { lessonId: 'lesson-1', title: 'بنك تدريب', mode: 'practice',
    drawCount: 2, shuffleOptions: true, questions: [
      { prompt: 'السؤال الأول', options: ['صحيح 1', 'خطأ 1أ', 'خطأ 1ب', 'خطأ 1ج'], answerIndex: 0 },
      { prompt: 'السؤال الثاني', options: ['صحيح 2', 'خطأ 2أ', 'خطأ 2ب', 'خطأ 2ج'], answerIndex: 0 },
      { prompt: 'السؤال الثالث', options: ['صحيح 3', 'خطأ 3أ', 'خطأ 3ب', 'خطأ 3ج'], answerIndex: 0 },
    ] }, admin, db);
  await handleAdminPost('publish', { quizId: draft.quizId }, admin, db);
  const get = () => handleGet({ query: { action: 'quiz', lessonId: 'lesson-1' } }, student, db);
  const shown = await get();
  assert.equal(shown.quiz.mode, 'practice');
  assert.equal(shown.questions.length, 2);
  assert.deepEqual((await get()).questions, shown.questions);
  assert.ok(shown.questions.every((question) => question.answerIndex === undefined));
  const correct = shown.questions.map((question) => question.options.findIndex((option) => option.startsWith('صحيح')));
  const first = await handleStudentPost('submit', { lessonId: 'lesson-1', assignmentKey: shown.quiz.assignmentKey, answers: correct }, student, db);
  assert.equal(first.result.correct, 2);
  await assert.rejects(() => handleStudentPost('submit', { lessonId: 'lesson-1', assignmentKey: shown.quiz.assignmentKey, answers: correct }, student, db), { status: 409 });
  assert.equal((await get()).quiz.lastPractice.correct, 2);
  const retry = await get();
  const retryAnswers = retry.questions.map((question) => question.options.findIndex((option) => option.startsWith('صحيح')));
  await handleStudentPost('submit', { lessonId: 'lesson-1', assignmentKey: retry.quiz.assignmentKey, answers: retryAnswers }, student, db);
  const stats = await handleGet({ query: { action: 'adminStats', lessonId: 'lesson-1' } }, admin, db);
  assert.equal(stats.totalAttempts, 2);
  assert.equal(stats.completedStudents, 1);
  assert.equal(stats.completionPercent, 100);
  assert.equal(stats.questions.length, new Set([...shown.questions, ...retry.questions].map((q) => q.id)).size);
  const exportData = await handleGet({ query: { action: 'adminExport', lessonId: 'lesson-1' } }, admin, db);
  assert.equal(exportData.attempts.length, 2);
  assert.equal(exportData.attempts[0].mode, 'practice');
  await handleAdminPost('delete', { quizId: draft.quizId }, admin, db);
  for (const table of ['quiz_settings', 'quiz_revision_settings', 'quiz_assignments', 'quiz_practice_attempts', 'quiz_attempt_presentations']) {
    assert.equal(Number((await db.execute({ sql: `SELECT COUNT(*) AS count FROM ${table}` })).rows[0].count), 0, table);
  }
});

test('exam grades the assigned options and preserves an in-progress version after edits', async () => {
  const db = await getDatabase();
  const admin = makeIdentity('admin-1');
  const student = makeIdentity('student-2');
  const questions = [1, 2, 3].map((number) => ({ prompt: `سؤال ${number}`,
    options: [`صحيح ${number}`, `خطأ أ ${number}`, `خطأ ب ${number}`, `خطأ ج ${number}`], answerIndex: 0 }));
  const saved = await handleAdminPost('save', { lessonId: 'lesson-1', title: 'امتحان البنك', mode: 'exam',
    drawCount: 2, shuffleOptions: true, questions }, admin, db);
  await handleAdminPost('publish', { quizId: saved.quizId }, admin, db);
  const get = () => handleGet({ query: { action: 'quiz', lessonId: 'lesson-1' } }, student, db);
  const assigned = await get();
  assert.equal(assigned.questions.length, 2);
  assert.equal((await handleGet({ query: { action: 'adminStats', lessonId: 'lesson-1' } }, admin, db)).inProgressStudents, 1);
  await handleAdminPost('save', { lessonId: 'lesson-1', title: 'نسخة جديدة', mode: 'practice',
    drawCount: 1, shuffleOptions: false, questions }, admin, db);
  await handleAdminPost('publish', { quizId: saved.quizId }, admin, db);
  assert.deepEqual((await get()).questions, assigned.questions);
  const answers = assigned.questions.map((question) => question.options.findIndex((option) => option.startsWith('صحيح')));
  assert.equal((await handleStudentPost('submit', { lessonId: 'lesson-1', assignmentKey: assigned.quiz.assignmentKey, answers }, student, db)).result.correct, 2);
  const after = await get();
  assert.equal(after.quiz.mode, 'practice');
  assert.equal(after.quiz.result, null);
  const report = await handleGet({ query: { action: 'adminStats', lessonId: 'lesson-1' } }, admin, db);
  assert.equal(report.totalAttempts, 1);
  assert.equal(report.questions.length, 2);
  assert.equal(report.questions.every((question) => question.errorPercent === 0), true);
  await handleAdminPost('delete', { quizId: saved.quizId }, admin, db);
});

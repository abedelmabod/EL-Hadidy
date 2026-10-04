import { randomInt, randomUUID } from 'node:crypto';
import { gradeAnswers, publicQuestions, reviewSchedule, validateQuizInput } from './_quiz-domain.js';
import { getDatabase, HttpError, identify, requireAdmin, requireExistingLesson, requireLessonAccess, requireStudent } from './_quiz-server.js';

const json = (res, status, body) => res.status(status).json(body);
const run = (db, sql, args = []) => db.execute({ sql, args });
const rows = async (db, sql, args = []) => (await run(db, sql, args)).rows;
const first = async (db, sql, args = []) => (await rows(db, sql, args))[0] || null;
const cleanId = (value) => String(value || '').trim().slice(0, 128);
const defaultSettings = { mode: 'exam', draw_count: 0, shuffle_options: 0 };

async function getSettings(db, quizId, revision = false) {
  const table = revision ? 'quiz_revision_settings' : 'quiz_settings';
  return (await first(db, `SELECT mode, draw_count, shuffle_options FROM ${table} WHERE quiz_id = ?`, [quizId])) || defaultSettings;
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function createPresentation(questions, settings) {
  const count = Number(settings.draw_count) || questions.length;
  const selected = count < questions.length ? shuffle(questions).slice(0, count) : [...questions];
  return selected.map((question) => {
    if (!settings.shuffle_options) return question;
    const options = JSON.parse(question.options_json);
    const order = shuffle([0, 1, 2, 3]);
    return { ...question, options_json: JSON.stringify(order.map((index) => options[index])),
      answer_index: order.indexOf(Number(question.answer_index)) };
  });
}

async function getAssignment(db, quiz, uid) {
  const existing = await first(db, 'SELECT * FROM quiz_assignments WHERE quiz_id = ? AND student_uid = ?', [quiz.id, uid]);
  if (existing) return existing;
  const settings = await getSettings(db, quiz.id);
  const version = await currentVersion(db, quiz.id);
  const questions = createPresentation(await getQuestions(db, quiz.id), settings);
  await run(db, `INSERT OR IGNORE INTO quiz_assignments (id, quiz_id, student_uid, mode, version, questions_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [randomUUID(), quiz.id, uid, settings.mode, version, serializeQuestions(questions), new Date().toISOString()]);
  return first(db, 'SELECT * FROM quiz_assignments WHERE quiz_id = ? AND student_uid = ?', [quiz.id, uid]);
}

async function getQuiz(db, lessonId) {
  return first(db, 'SELECT * FROM quizzes WHERE lesson_id = ?', [lessonId]);
}

async function getQuestions(db, quizId) {
  return rows(db, 'SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order', [quizId]);
}

const serializeQuestions = (questions) => JSON.stringify(questions.map((item) => ({
  id: item.id, prompt: item.prompt, options_json: item.options_json,
  answer_index: item.answer_index, explanation: item.explanation, sort_order: item.sort_order,
})));
const deserializeQuestions = (value) => JSON.parse(value);

async function currentVersion(db, quizId) {
  const row = await first(db, 'SELECT MAX(version) AS version FROM quiz_versions WHERE quiz_id = ?', [quizId]);
  return Number(row?.version || 1);
}

async function questionsForVersion(db, quizId, version) {
  const snapshot = await first(db, 'SELECT questions_json FROM quiz_versions WHERE quiz_id = ? AND version = ?', [quizId, version]);
  return snapshot ? deserializeQuestions(snapshot.questions_json) : getQuestions(db, quizId);
}

async function questionsForAttempt(db, attempt) {
  const presentation = await first(db, 'SELECT questions_json FROM quiz_attempt_presentations WHERE attempt_id = ?', [attempt.id]);
  return presentation ? deserializeQuestions(presentation.questions_json) : questionsForVersion(db, attempt.quiz_id, Number(attempt.version || 1));
}

async function studentAttempt(db, quizId, uid) {
  return first(db, `SELECT a.*, COALESCE(v.version, 1) AS version FROM quiz_attempts a
    LEFT JOIN quiz_attempt_versions v ON v.attempt_id = a.id
    WHERE a.quiz_id = ? AND a.student_uid = ?`, [quizId, uid]);
}

function correctionsFor(questions, answers) {
  return questions.map((question, index) => ({
    id: question.id, prompt: question.prompt, options: JSON.parse(question.options_json),
    selectedIndex: answers[index], answerIndex: question.answer_index, explanation: question.explanation,
  }));
}

async function checkReviewAccess(identity, student, db, reviewId) {
  const review = await first(db, 'SELECT * FROM quiz_reviews WHERE id = ? AND student_uid = ?', [reviewId, identity.uid]);
  if (!review) throw new HttpError(404, 'المراجعة غير موجودة.');
  const quiz = await first(db, 'SELECT * FROM quizzes WHERE id = ?', [review.quiz_id]);
  if (!quiz || !['published', 'paused'].includes(quiz.status)) throw new HttpError(404, 'الاختبار غير متاح.');
  await requireLessonAccess(identity, student, quiz.lesson_id);
  return { review, quiz };
}

async function reportAttempts(db, quizId, limit) {
  return rows(db, `SELECT * FROM (
    SELECT a.id, a.student_uid, COALESCE(s.student_name, a.student_uid) AS student_name,
      a.answers_json, a.score, a.total, a.submitted_at, COALESCE(v.version, 1) AS version,
      p.questions_json, 'exam' AS mode
    FROM quiz_attempts a LEFT JOIN quiz_attempt_students s ON s.attempt_id = a.id
      LEFT JOIN quiz_attempt_versions v ON v.attempt_id = a.id
      LEFT JOIN quiz_attempt_presentations p ON p.attempt_id = a.id WHERE a.quiz_id = ?
    UNION ALL
    SELECT id, student_uid, student_name, answers_json, score, total, submitted_at,
      version, questions_json, 'practice' AS mode FROM quiz_practice_attempts WHERE quiz_id = ?
  ) ORDER BY submitted_at DESC LIMIT ?`, [quizId, quizId, limit]);
}

export async function handleGet(req, identity, db) {
  const action = String(req.query.action || 'quiz');
  if (action === 'adminList') {
    await requireAdmin(identity);
    return { quizzes: await rows(db, `SELECT q.*, (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) AS question_count,
      (SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = q.id) AS attempt_count,
      (SELECT ROUND(AVG(100.0 * score / NULLIF(total, 0)), 1) FROM quiz_attempts WHERE quiz_id = q.id) AS average_percent,
      (SELECT COUNT(*) FROM quiz_revision_drafts WHERE quiz_id = q.id) AS has_revision_draft
      FROM quizzes q ORDER BY q.updated_at DESC LIMIT 300`) };
  }
  if (action === 'adminQuiz') {
    await requireAdmin(identity);
    const quiz = await getQuiz(db, cleanId(req.query.lessonId));
    if (!quiz) return { quiz: null, questions: [] };
    const revision = await first(db, 'SELECT * FROM quiz_revision_drafts WHERE quiz_id = ?', [quiz.id]);
    const questions = revision ? deserializeQuestions(revision.questions_json) : await getQuestions(db, quiz.id);
    const settings = await getSettings(db, quiz.id, !!revision);
    return { quiz: { ...quiz, ...settings, hasRevisionDraft: !!revision }, draftTitle: revision?.title || null, questions: questions.map((question) => ({
      id: question.id, prompt: question.prompt, options: JSON.parse(question.options_json),
      answerIndex: question.answer_index, explanation: question.explanation,
    })) };
  }
  if (action === 'adminStats') {
    await requireAdmin(identity);
    const quiz = await getQuiz(db, cleanId(req.query.lessonId));
    if (!quiz) throw new HttpError(404, 'الاختبار غير موجود.');
    const totals = await first(db, `SELECT COUNT(*) AS count, COUNT(DISTINCT student_uid) AS students,
      ROUND(AVG(100.0 * score / NULLIF(total, 0))) AS average_percent FROM (
      SELECT student_uid, score, total FROM quiz_attempts WHERE quiz_id = ?
      UNION ALL SELECT student_uid, score, total FROM quiz_practice_attempts WHERE quiz_id = ?)`, [quiz.id, quiz.id]);
    const open = await first(db, `SELECT COUNT(*) AS count FROM quiz_assignments x WHERE quiz_id = ? AND NOT EXISTS (
      SELECT 1 FROM quiz_attempts a WHERE a.quiz_id = x.quiz_id AND a.student_uid = x.student_uid
      UNION SELECT 1 FROM quiz_practice_attempts p WHERE p.quiz_id = x.quiz_id AND p.student_uid = x.student_uid)`, [quiz.id]);
    const attempts = await reportAttempts(db, quiz.id, 500);
    const versions = await rows(db, 'SELECT version, questions_json FROM quiz_versions WHERE quiz_id = ?', [quiz.id]);
    const snapshotByVersion = new Map(versions.map((row) => [Number(row.version), deserializeQuestions(row.questions_json)]));
    const fallback = await getQuestions(db, quiz.id);
    const questions = new Map();
    for (const attempt of attempts) {
      const version = Number(attempt.version);
      const items = attempt.questions_json ? deserializeQuestions(attempt.questions_json) : snapshotByVersion.get(version) || fallback;
      const answers = JSON.parse(attempt.answers_json);
      items.forEach((item, index) => {
        const key = `${version}:${item.id}`;
        const stat = questions.get(key) || { id: item.id, version, prompt: item.prompt, correct: 0, total: 0 };
        stat.total += 1;
        if (answers[index] === item.answer_index) stat.correct += 1;
        questions.set(key, stat);
      });
    }
    const latestByStudent = new Map();
    for (const item of attempts) if (!latestByStudent.has(item.student_uid)) latestByStudent.set(item.student_uid, item);
    const needsReview = [...latestByStudent.values()].filter((item) => item.total && item.score / item.total < 0.6)
      .sort((a, b) => a.score / a.total - b.score / b.total).slice(0, 30)
      .map((item) => ({ studentUid: item.student_uid, studentName: item.student_name, score: item.score, total: item.total }));
    return { quiz: { id: quiz.id, title: quiz.title }, totalAttempts: Number(totals.count),
      completedStudents: Number(totals.students), inProgressStudents: Number(open.count),
      completionPercent: Number(totals.students) + Number(open.count) ? Math.round(100 * Number(totals.students) / (Number(totals.students) + Number(open.count))) : null,
      averagePercent: totals.average_percent == null ? null : Number(totals.average_percent), analyzedAttempts: attempts.length,
      needsReview,
      attempts: attempts.map((item) => ({ studentUid: item.student_uid, studentName: item.student_name || item.student_uid, score: item.score, total: item.total, submittedAt: item.submitted_at, version: Number(item.version), mode: item.mode })),
      questions: [...questions.values()].map((item) => ({ ...item, errorPercent: Math.round(100 * (item.total - item.correct) / item.total) })).sort((a, b) => b.errorPercent - a.errorPercent) };
  }
  if (action === 'adminExport') {
    await requireAdmin(identity);
    const quiz = await getQuiz(db, cleanId(req.query.lessonId));
    if (!quiz) throw new HttpError(404, 'الاختبار غير موجود.');
    const attempts = await reportAttempts(db, quiz.id, 10000);
    return { title: quiz.title, truncated: attempts.length === 10000,
      attempts: attempts.map((item) => ({ studentName: item.student_name, studentUid: item.student_uid,
        mode: item.mode, score: Number(item.score), total: Number(item.total), submittedAt: item.submitted_at,
        version: Number(item.version) })) };
  }

  const student = await requireStudent(identity);
  if (action === 'publishedIds') {
    const lessonIds = String(req.query.lessonIds || '').split(',').map(cleanId).filter(Boolean).slice(0, 100);
    if (!lessonIds.length) return { lessonIds: [] };
    const placeholders = lessonIds.map(() => '?').join(',');
    const published = await rows(db, `SELECT lesson_id FROM quizzes q WHERE (status = 'published' OR
      (status = 'paused' AND (EXISTS (SELECT 1 FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.student_uid = ?)
        OR EXISTS (SELECT 1 FROM quiz_practice_attempts p WHERE p.quiz_id = q.id AND p.student_uid = ?))))
      AND lesson_id IN (${placeholders})`, [identity.uid, identity.uid, ...lessonIds]);
    return { lessonIds: published.map((item) => item.lesson_id) };
  }
  if (action === 'reviews' || action === 'pendingReviews') {
    const candidates = await rows(db, `SELECT r.id, r.quiz_id, r.step, r.due_at, r.completed_at, q.title, q.lesson_id
      FROM quiz_reviews r JOIN quizzes q ON q.id = r.quiz_id
      WHERE r.student_uid = ? ${action === 'pendingReviews' ? 'AND r.completed_at IS NULL' : ''}
      AND q.status IN ('published', 'paused') ORDER BY r.due_at LIMIT 100`, [identity.uid]);
    const accessible = [];
    const lessonAccess = new Map();
    for (const item of candidates) {
      try {
        if (!lessonAccess.has(item.lesson_id)) lessonAccess.set(item.lesson_id, await requireLessonAccess(identity, student, item.lesson_id));
        accessible.push(item);
      } catch (error) {
        if (!(error instanceof HttpError && [403, 404].includes(error.status))) throw error;
      }
    }
    return { reviews: accessible };
  }
  if (action === 'history') {
    const candidates = await rows(db, `SELECT * FROM (
      SELECT a.score, a.total, a.submitted_at, q.title, q.lesson_id, 'exam' AS mode
      FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id WHERE a.student_uid = ?
      UNION ALL SELECT p.score, p.total, p.submitted_at, q.title, q.lesson_id, 'practice' AS mode
      FROM quiz_practice_attempts p JOIN quizzes q ON q.id = p.quiz_id WHERE p.student_uid = ?
    ) ORDER BY submitted_at DESC LIMIT 100`, [identity.uid, identity.uid]);
    const history = [];
    const lessonAccess = new Map();
    for (const item of candidates) {
      try {
        if (!lessonAccess.has(item.lesson_id)) lessonAccess.set(item.lesson_id, await requireLessonAccess(identity, student, item.lesson_id));
        history.push(item);
      } catch (error) {
        if (!(error instanceof HttpError && [403, 404].includes(error.status))) throw error;
      }
    }
    return { history };
  }
  if (action === 'review') {
    const { review, quiz } = await checkReviewAccess(identity, student, db, cleanId(req.query.reviewId));
    if (review.completed_at) throw new HttpError(409, 'أنهيت هذه المراجعة بالفعل.');
    if (Date.parse(review.due_at) > Date.now()) throw new HttpError(403, 'موعد المراجعة لم يحن بعد.');
    const ids = JSON.parse(review.question_ids_json);
    const attempt = await studentAttempt(db, quiz.id, identity.uid);
    const questions = (await questionsForAttempt(db, attempt)).filter((question) => ids.includes(question.id));
    return { review: { id: review.id, step: review.step, dueAt: review.due_at }, quiz: { id: quiz.id, title: quiz.title }, questions: publicQuestions(questions) };
  }
  if (action !== 'quiz') throw new HttpError(400, 'طلب غير معروف.');
  const lessonId = cleanId(req.query.lessonId);
  await requireLessonAccess(identity, student, lessonId);
  const quiz = await getQuiz(db, lessonId);
  if (!quiz || (quiz.status !== 'published' && quiz.status !== 'paused')) return { quiz: null };
  const settings = await getSettings(db, quiz.id);
  const attempt = await studentAttempt(db, quiz.id, identity.uid);
  const lastPractice = settings.mode === 'practice' ? await first(db, `SELECT score, total, submitted_at FROM quiz_practice_attempts
    WHERE quiz_id = ? AND student_uid = ? ORDER BY submitted_at DESC LIMIT 1`, [quiz.id, identity.uid]) : null;
  if (quiz.status === 'paused' && !attempt && !lastPractice) return { quiz: null };
  const isExam = settings.mode !== 'practice';
  const assignment = quiz.status === 'published' && (!isExam || !attempt) ? await getAssignment(db, quiz, identity.uid) : null;
  const attemptQuestions = attempt && isExam ? await questionsForAttempt(db, attempt) : null;
  return {
    quiz: { id: quiz.id, lessonId, title: quiz.title, mode: assignment?.mode || settings.mode,
      assignmentKey: assignment?.id || null, attempted: isExam && !!attempt,
      result: isExam && attempt ? { correct: attempt.score, total: attempt.total, submittedAt: attempt.submitted_at, version: Number(attempt.version) } : null,
      lastPractice: lastPractice ? { correct: lastPractice.score, total: lastPractice.total, submittedAt: lastPractice.submitted_at } : null },
    questions: assignment ? publicQuestions(deserializeQuestions(assignment.questions_json)) : [],
    history: attemptQuestions ? correctionsFor(attemptQuestions, JSON.parse(attempt.answers_json)) : null,
  };
}

export async function handleAdminPost(action, body, identity, db) {
  await requireAdmin(identity);
  if (action === 'save') {
    const lessonId = cleanId(body.lessonId);
    await requireExistingLesson(identity, lessonId);
    let input;
    try { input = validateQuizInput(body); }
    catch (error) { throw new HttpError(400, error.message); }
    const existing = await getQuiz(db, lessonId);
    if (existing && existing.status !== 'draft') {
      await db.batch([{ sql: `INSERT INTO quiz_revision_drafts (quiz_id, title, questions_json, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(quiz_id) DO UPDATE SET title = excluded.title, questions_json = excluded.questions_json, updated_at = excluded.updated_at`, args:
      [existing.id, input.title, JSON.stringify(input.questions.map((question, index) => ({
        id: randomUUID(), prompt: question.prompt, options_json: JSON.stringify(question.options),
        answer_index: question.answerIndex, explanation: question.explanation, sort_order: index,
      }))), new Date().toISOString()] }, { sql: `INSERT INTO quiz_revision_settings (quiz_id, mode, draw_count, shuffle_options) VALUES (?, ?, ?, ?)
        ON CONFLICT(quiz_id) DO UPDATE SET mode = excluded.mode, draw_count = excluded.draw_count, shuffle_options = excluded.shuffle_options`,
      args: [existing.id, input.mode, input.drawCount, Number(input.shuffleOptions)] }], 'write');
      return { quizId: existing.id, revisionDraft: true };
    }
    const id = existing?.id || randomUUID();
    const now = new Date().toISOString();
    const statements = existing
      ? [ { sql: 'UPDATE quizzes SET title = ?, updated_at = ? WHERE id = ?', args: [input.title, now, id] }, { sql: 'DELETE FROM quiz_questions WHERE quiz_id = ?', args: [id] } ]
      : [ { sql: 'INSERT INTO quizzes (id, lesson_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', args: [id, lessonId, input.title, 'draft', now, now] } ];
    input.questions.forEach((question, index) => statements.push({
      sql: 'INSERT INTO quiz_questions (id, quiz_id, prompt, options_json, answer_index, explanation, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [randomUUID(), id, question.prompt, JSON.stringify(question.options), question.answerIndex, question.explanation, index],
    }));
    statements.push({ sql: `INSERT INTO quiz_settings (quiz_id, mode, draw_count, shuffle_options) VALUES (?, ?, ?, ?)
      ON CONFLICT(quiz_id) DO UPDATE SET mode = excluded.mode, draw_count = excluded.draw_count, shuffle_options = excluded.shuffle_options`,
    args: [id, input.mode, input.drawCount, Number(input.shuffleOptions)] });
    await db.batch(statements, 'write');
    return { quizId: id };
  }
  const quizId = cleanId(body.quizId);
  const quiz = await first(db, 'SELECT * FROM quizzes WHERE id = ?', [quizId]);
  if (!quiz) throw new HttpError(404, 'الاختبار غير موجود.');
  if (action === 'publish') {
    const revision = await first(db, 'SELECT * FROM quiz_revision_drafts WHERE quiz_id = ?', [quizId]);
    if (quiz.status !== 'draft' && !revision) throw new HttpError(409, 'احفظ نسخة معدلة قبل نشرها.');
    const questions = revision ? deserializeQuestions(revision.questions_json) : await getQuestions(db, quizId);
    if (!questions.length) throw new HttpError(400, 'أضف سؤالًا قبل النشر.');
    const version = quiz.status === 'draft' ? 1 : (await currentVersion(db, quizId)) + 1;
    const now = new Date().toISOString();
    const statements = [];
    if (revision) {
      const oldQuestions = await getQuestions(db, quizId);
      statements.push({ sql: 'INSERT OR IGNORE INTO quiz_versions (quiz_id, version, questions_json, published_at) VALUES (?, 1, ?, ?)',
        args: [quizId, serializeQuestions(oldQuestions), quiz.created_at] });
      statements.push({ sql: 'DELETE FROM quiz_questions WHERE quiz_id = ?', args: [quizId] });
      questions.forEach((question) => statements.push({ sql: 'INSERT INTO quiz_questions (id, quiz_id, prompt, options_json, answer_index, explanation, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [question.id, quizId, question.prompt, question.options_json, question.answer_index, question.explanation, question.sort_order] }));
      statements.push({ sql: 'DELETE FROM quiz_revision_drafts WHERE quiz_id = ?', args: [quizId] });
      const settings = await getSettings(db, quizId, true);
      statements.push({ sql: 'UPDATE quiz_settings SET mode = ?, draw_count = ?, shuffle_options = ? WHERE quiz_id = ?',
        args: [settings.mode, settings.draw_count, settings.shuffle_options, quizId] });
      statements.push({ sql: 'DELETE FROM quiz_revision_settings WHERE quiz_id = ?', args: [quizId] });
    }
    statements.push({ sql: 'INSERT INTO quiz_versions (quiz_id, version, questions_json, published_at) VALUES (?, ?, ?, ?)', args: [quizId, version, serializeQuestions(questions), now] });
    statements.push({ sql: "UPDATE quizzes SET title = ?, status = 'published', updated_at = ? WHERE id = ?", args: [revision?.title || quiz.title, now, quizId] });
    await db.batch(statements, 'write');
    return { published: true, version };
  }
  if (action === 'pause' || action === 'resume') {
    if (quiz.status === 'draft') throw new HttpError(409, 'انشر الاختبار أولًا.');
    await run(db, 'UPDATE quizzes SET status = ?, updated_at = ? WHERE id = ?', [action === 'pause' ? 'paused' : 'published', new Date().toISOString(), quizId]);
    return { status: action === 'pause' ? 'paused' : 'published' };
  }
  if (action === 'discardRevision') {
    await db.batch([{ sql: 'DELETE FROM quiz_revision_drafts WHERE quiz_id = ?', args: [quizId] },
      { sql: 'DELETE FROM quiz_revision_settings WHERE quiz_id = ?', args: [quizId] }], 'write');
    return { discarded: true };
  }
  if (action === 'delete') {
    await db.batch([
      { sql: 'DELETE FROM quiz_review_answers WHERE review_id IN (SELECT id FROM quiz_reviews WHERE quiz_id = ?)', args: [quizId] },
      { sql: 'DELETE FROM quiz_reviews WHERE quiz_id = ?', args: [quizId] },
      { sql: 'DELETE FROM quiz_attempt_presentations WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE quiz_id = ?)', args: [quizId] },
      { sql: 'DELETE FROM quiz_attempt_students WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE quiz_id = ?)', args: [quizId] },
      { sql: 'DELETE FROM quiz_attempt_versions WHERE attempt_id IN (SELECT id FROM quiz_attempts WHERE quiz_id = ?)', args: [quizId] },
      { sql: 'DELETE FROM quiz_attempts WHERE quiz_id = ?', args: [quizId] },
      { sql: 'DELETE FROM quiz_revision_drafts WHERE quiz_id = ?', args: [quizId] },
      { sql: 'DELETE FROM quiz_revision_settings WHERE quiz_id = ?', args: [quizId] },
      { sql: 'DELETE FROM quiz_assignments WHERE quiz_id = ?', args: [quizId] },
      { sql: 'DELETE FROM quiz_practice_attempts WHERE quiz_id = ?', args: [quizId] },
      { sql: 'DELETE FROM quiz_settings WHERE quiz_id = ?', args: [quizId] },
      { sql: 'DELETE FROM quiz_versions WHERE quiz_id = ?', args: [quizId] },
      { sql: 'DELETE FROM quiz_questions WHERE quiz_id = ?', args: [quizId] },
      { sql: 'DELETE FROM quizzes WHERE id = ?', args: [quizId] },
    ], 'write');
    return { deleted: true };
  }
  throw new HttpError(400, 'طلب غير معروف.');
}

export async function handleStudentPost(action, body, identity, db) {
  const student = await requireStudent(identity);
  if (action === 'submit') {
    const lessonId = cleanId(body.lessonId);
    await requireLessonAccess(identity, student, lessonId);
    const quiz = await getQuiz(db, lessonId);
    if (!quiz || quiz.status !== 'published') throw new HttpError(404, 'الاختبار غير متاح.');
    const assigned = await first(db, 'SELECT * FROM quiz_assignments WHERE quiz_id = ? AND student_uid = ?', [quiz.id, identity.uid]);
    if (body.assignmentKey && body.assignmentKey !== assigned?.id) throw new HttpError(409, 'انتهت هذه المحاولة. حدّث الاختبار قبل التسليم.');
    const assignment = assigned || await getAssignment(db, quiz, identity.uid);
    const questions = deserializeQuestions(assignment.questions_json);
    let result;
    try { result = gradeAnswers(questions, body.answers); }
    catch (error) { throw new HttpError(400, error.message); }
    const now = Date.now();
    const attemptId = randomUUID();
    const version = Number(assignment.version);
    if (assignment.mode === 'practice') {
      try {
        await db.batch([{ sql: `INSERT INTO quiz_practice_attempts
          (id, quiz_id, student_uid, student_name, version, assignment_key, questions_json, answers_json, score, total, submitted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [attemptId, quiz.id, identity.uid,
          String(student.name || student.username || identity.uid).slice(0, 140), version,
          assignment.id, assignment.questions_json,
          JSON.stringify(body.answers), result.correct, result.total, new Date(now).toISOString()] },
        { sql: 'DELETE FROM quiz_assignments WHERE quiz_id = ? AND student_uid = ?', args: [quiz.id, identity.uid] }], 'write');
      } catch (error) {
        if (String(error.message).includes('UNIQUE')) throw new HttpError(409, 'أرسلت هذه المحاولة بالفعل. افتح محاولة جديدة.');
        throw error;
      }
      return { result, version, reviewsDueAt: [], corrections: correctionsFor(questions, body.answers), mode: 'practice' };
    }
    const statements = [{ sql: 'INSERT INTO quiz_attempts (id, quiz_id, student_uid, answers_json, score, total, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [attemptId, quiz.id, identity.uid, JSON.stringify(body.answers), result.correct, result.total, new Date(now).toISOString()] },
    { sql: 'INSERT INTO quiz_attempt_versions (attempt_id, version) VALUES (?, ?)', args: [attemptId, version] },
    { sql: 'INSERT INTO quiz_attempt_presentations (attempt_id, questions_json) VALUES (?, ?)', args: [attemptId, assignment.questions_json] },
    { sql: 'DELETE FROM quiz_assignments WHERE quiz_id = ? AND student_uid = ?', args: [quiz.id, identity.uid] },
    { sql: 'INSERT INTO quiz_attempt_students (attempt_id, student_name) VALUES (?, ?)', args: [attemptId, String(student.name || student.username || identity.uid).slice(0, 140)] }];
    if (result.wrongIds.length) reviewSchedule(now).forEach((dueAt, index) => statements.push({
      sql: 'INSERT INTO quiz_reviews (id, quiz_id, student_uid, question_ids_json, step, due_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [randomUUID(), quiz.id, identity.uid, JSON.stringify(result.wrongIds), index + 1, dueAt],
    }));
    try { await db.batch(statements, 'write'); }
    catch (error) { if (String(error.message).includes('UNIQUE')) throw new HttpError(409, 'أرسلت هذا الاختبار من قبل.'); throw error; }
    return { result, version, reviewsDueAt: result.wrongIds.length ? reviewSchedule(now) : [],
      corrections: correctionsFor(questions, body.answers) };
  }
  if (action === 'submitReview') {
    const { review, quiz } = await checkReviewAccess(identity, student, db, cleanId(body.reviewId));
    if (review.completed_at) throw new HttpError(409, 'أنهيت هذه المراجعة بالفعل.');
    if (Date.parse(review.due_at) > Date.now()) throw new HttpError(403, 'موعد المراجعة لم يحن بعد.');
    const ids = JSON.parse(review.question_ids_json);
    const attempt = await studentAttempt(db, quiz.id, identity.uid);
    const questions = (await questionsForAttempt(db, attempt)).filter((question) => ids.includes(question.id));
    let result;
    try { result = gradeAnswers(questions, body.answers); }
    catch (error) { throw new HttpError(400, error.message); }
    const now = new Date().toISOString();
    const nextReviews = await rows(db, 'SELECT id FROM quiz_reviews WHERE quiz_id = ? AND student_uid = ? AND step > ? AND completed_at IS NULL', [quiz.id, identity.uid, review.step]);
    const statements = [{ sql: 'UPDATE quiz_reviews SET completed_at = ?, score = ? WHERE id = ? AND student_uid = ? AND completed_at IS NULL', args: [now, result.correct, review.id, identity.uid] },
      { sql: 'INSERT INTO quiz_review_answers (review_id, answers_json, wrong_ids_json) VALUES (?, ?, ?)', args: [review.id, JSON.stringify(body.answers), JSON.stringify(result.wrongIds)] }];
    for (const next of nextReviews) {
      if (result.wrongIds.length) statements.push({ sql: 'UPDATE quiz_reviews SET question_ids_json = ? WHERE id = ?', args: [JSON.stringify(result.wrongIds), next.id] });
      else statements.push({ sql: 'DELETE FROM quiz_reviews WHERE id = ?', args: [next.id] });
    }
    await db.batch(statements, 'write');
    return { result, corrections: correctionsFor(questions, body.answers), remainingReviews: result.wrongIds.length ? nextReviews.length : 0 };
  }
  throw new HttpError(400, 'طلب غير معروف.');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
  try {
    const identity = await identify(req);
    const db = await getDatabase();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const action = String(body.action || '');
    if (req.method === 'GET') return json(res, 200, await handleGet(req, identity, db));
    const result = ['save', 'publish', 'delete', 'pause', 'resume', 'discardRevision'].includes(action)
      ? await handleAdminPost(action, body, identity, db)
      : await handleStudentPost(action, body, identity, db);
    return json(res, 200, result);
  } catch (error) {
    if (error instanceof HttpError) return json(res, error.status, { error: error.message });
    if (error instanceof SyntaxError) return json(res, 400, { error: 'بيانات الطلب غير صالحة.' });
    console.error('Quiz API failure:', error);
    return json(res, 500, { error: 'تعذر إكمال العملية. حاول مرة أخرى.' });
  }
}

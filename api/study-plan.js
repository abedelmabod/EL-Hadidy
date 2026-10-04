import { getDatabase, HttpError, identify, requireAdmin, requireExistingLesson, requireLessonAccess, requireStudent } from './_quiz-server.js';

const json = (res, status, body) => res.status(status).json(body);
const rows = async (db, sql, args = []) => (await db.execute({ sql, args })).rows;
const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const validDays = (value) => Array.isArray(value) && value.length <= 6
  && value.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);

export async function processStudyPlan(req, res, identity, db) {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const action = String(body.action || req.query?.action || 'student');

    if (action === 'admin') {
      await requireAdmin(identity);
      if (req.method === 'GET') return json(res, 200, { priorities: await rows(db,
        'SELECT lesson_id AS lessonId, priority, target_date AS targetDate FROM study_plan_priorities') });
      const lessonId = String(body.lessonId || '').trim();
      if (!lessonId || lessonId.length > 128) throw new HttpError(400, 'اختر محاضرة صالحة.');
      await requireExistingLesson(identity, lessonId);
      const priority = Number(body.priority);
      if (!Number.isInteger(priority) || priority < 0 || priority > 3) throw new HttpError(400, 'الأولوية غير صالحة.');
      const targetDate = body.targetDate ? String(body.targetDate) : null;
      if (targetDate && !validDate(targetDate)) throw new HttpError(400, 'التاريخ غير صالح.');
      await db.execute({ sql: `INSERT INTO study_plan_priorities (lesson_id, priority, target_date, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(lesson_id) DO UPDATE SET priority = excluded.priority,
        target_date = excluded.target_date, updated_at = excluded.updated_at`,
      args: [lessonId, priority, targetDate, new Date().toISOString()] });
      return json(res, 200, { ok: true });
    }

    const student = await requireStudent(identity);
    if (req.method === 'GET') {
      const [preferences, tasks, priorities, completions, attempts] = await Promise.all([
        rows(db, 'SELECT rest_days_json AS restDaysJson, reminders_enabled AS remindersEnabled FROM study_plan_preferences WHERE student_uid = ?', [identity.uid]),
        rows(db, 'SELECT task_key AS taskKey, postponed_until AS postponedUntil FROM study_plan_tasks WHERE student_uid = ?', [identity.uid]),
        rows(db, 'SELECT lesson_id AS lessonId, priority, target_date AS targetDate FROM study_plan_priorities'),
        rows(db, 'SELECT lesson_id AS lessonId FROM study_plan_completions WHERE student_uid = ?', [identity.uid]),
        rows(db, `SELECT DISTINCT q.lesson_id AS lessonId FROM quizzes q WHERE EXISTS (
          SELECT 1 FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.student_uid = ?)
          OR EXISTS (SELECT 1 FROM quiz_practice_attempts p WHERE p.quiz_id = q.id AND p.student_uid = ?)`,
        [identity.uid, identity.uid]),
      ]);
      return json(res, 200, {
        preferences: { restDays: JSON.parse(preferences[0]?.restDaysJson || '[]'), remindersEnabled: !!preferences[0]?.remindersEnabled },
        tasks, priorities, completedLessonIds: completions.map((row) => row.lessonId),
        attemptedLessonIds: attempts.map((row) => row.lessonId),
      });
    }
    if (action === 'preferences') {
      if (!validDays(body.restDays)) throw new HttpError(400, 'أيام الراحة غير صالحة.');
      if (typeof body.remindersEnabled !== 'boolean') throw new HttpError(400, 'إعداد التذكير غير صالح.');
      const days = [...new Set(body.restDays)].sort();
      await db.execute({ sql: `INSERT INTO study_plan_preferences (student_uid, rest_days_json, reminders_enabled, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(student_uid) DO UPDATE SET rest_days_json = excluded.rest_days_json,
        reminders_enabled = excluded.reminders_enabled, updated_at = excluded.updated_at`,
      args: [identity.uid, JSON.stringify(days), body.remindersEnabled ? 1 : 0, new Date().toISOString()] });
      return json(res, 200, { restDays: days, remindersEnabled: !!body.remindersEnabled });
    }
    if (action === 'postpone') {
      const taskKey = String(body.taskKey || '').trim();
      const match = /^(video|quiz|review):([a-zA-Z0-9_-]{1,128})$/.exec(taskKey);
      if (!match) throw new HttpError(400, 'المهمة غير صالحة.');
      if (match[1] === 'review') {
        const review = await rows(db, 'SELECT q.lesson_id AS lessonId FROM quiz_reviews r JOIN quizzes q ON q.id = r.quiz_id WHERE r.id = ? AND r.student_uid = ?', [match[2], identity.uid]);
        if (!review.length) throw new HttpError(404, 'المراجعة غير متاحة.');
        await requireLessonAccess(identity, student, review[0].lessonId);
      } else await requireLessonAccess(identity, student, match[2]);
      const date = body.until ? String(body.until) : null;
      if (date && (!validDate(date) || date < new Date().toISOString().slice(0, 10))) throw new HttpError(400, 'موعد التأجيل غير صالح.');
      if (!date) await db.execute({ sql: 'DELETE FROM study_plan_tasks WHERE student_uid = ? AND task_key = ?', args: [identity.uid, taskKey] });
      else await db.execute({ sql: `INSERT INTO study_plan_tasks (student_uid, task_key, postponed_until, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(student_uid, task_key) DO UPDATE SET postponed_until = excluded.postponed_until,
        updated_at = excluded.updated_at`, args: [identity.uid, taskKey, date, new Date().toISOString()] });
      return json(res, 200, { ok: true });
    }
    if (action === 'completeVideo') {
      const lessonId = String(body.lessonId || '').trim();
      await requireLessonAccess(identity, student, lessonId);
      await db.execute({ sql: 'INSERT OR IGNORE INTO study_plan_completions (student_uid, lesson_id, completed_at) VALUES (?, ?, ?)',
        args: [identity.uid, lessonId, new Date().toISOString()] });
      return json(res, 200, { ok: true });
    }
    throw new HttpError(400, 'طلب غير معروف.');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
  try {
    const identity = await identify(req);
    const db = await getDatabase();
    return await processStudyPlan(req, res, identity, db);
  } catch (error) {
    if (error instanceof HttpError) return json(res, error.status, { error: error.message });
    if (error instanceof SyntaxError) return json(res, 400, { error: 'بيانات الطلب غير صالحة.' });
    console.error('Study plan API failure:', error);
    return json(res, 500, { error: 'تعذر تحميل خطة المذاكرة. حاول مرة أخرى.' });
  }
}

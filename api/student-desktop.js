import { getDatabase, HttpError, identify, requireStudent } from './_quiz-server.js';
import { activateStudentCode } from './_desktop-student.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const identity = await identify(req);
    const profile = await requireStudent(identity);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (body.action !== 'activateCode') throw new HttpError(400, 'طلب غير صالح.');
    const result = await activateStudentCode(identity.store, identity.uid, profile.id, body.code);
    // Refresh the session snapshot after a successful atomic redemption.
    const updated = await identity.store.collection('students').doc(profile.id).get();
    const db = await getDatabase();
    const { publicProfile } = await import('./_student-session.js');
    await db.execute({ sql: 'UPDATE student_active_sessions SET profile_json = ? WHERE student_uid = ?',
      args: [JSON.stringify(publicProfile({ id: updated.id, ...updated.data() })), identity.uid] });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'طلب غير صالح.' });
    console.error('Desktop operation failure', error.name);
    return res.status(503).json({ error: 'تعذر إتمام الطلب. أعد تحميل الحساب للتحقق من النتيجة قبل المحاولة.' });
  }
}

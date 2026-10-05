import { getAuth } from 'firebase-admin/auth';
import { firebaseApp, HttpError, identify } from './_quiz-server.js';
import { changeStudentPassword, passwordServiceError } from './_student-password.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const identity = await identify(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const result = await changeStudentPassword(identity, getAuth(firebaseApp()), body);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'بيانات الطلب غير صالحة.' });
    const failure = error instanceof HttpError ? error : passwordServiceError(error);
    if (failure.status === 503 && failure.message.startsWith('Firebase server credentials')) {
      return res.status(503).json({ error: 'إعدادات خدمة Firebase على السيرفر غير مكتملة. تواصل مع مسئول النظام.' });
    }
    return res.status(failure.status).json({ error: failure.message });
  }
}

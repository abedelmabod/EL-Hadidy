import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { firebaseApp, getDatabase, HttpError } from './_quiz-server.js';
import { loginStudent } from './_student-login.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const app = firebaseApp();
    const authenticate = async (email, password) => {
      // Public Firebase web API key, not an Admin credential.
      const key = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyC0adM1TaTOek1iJLgHUxFprfO4nEImjvw';
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new HttpError(response.status >= 500 ? 503 : response.status === 429 ? 429 : 401,
        response.status >= 500 ? 'تعذر الاتصال بخدمة الدخول.' : response.status === 429 ? 'محاولات كثيرة. حاول لاحقًا.' : 'اسم المستخدم أو كلمة المرور غير صحيحة.');
      return response.json();
    };
    const result = await loginStudent({ db: await getDatabase(), store: getFirestore(app), firebaseAuth: getAuth(app), authenticate,
      identifier: body.identifier, password: body.password, address: String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown').slice(0, 128) });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'بيانات الطلب غير صالحة.' });
    return res.status(503).json({ error: 'تعذر الاتصال بخدمة الدخول. حاول مرة أخرى.' });
  }
}

import { auth } from '../firebase';

export async function changeStudentPassword(studentId, password) {
  let token;
  try { token = await auth.currentUser?.getIdToken(); }
  catch { throw new Error('تعذر تأكيد جلسة الدخول. تحقق من الاتصال وسجّل الدخول مرة أخرى.'); }
  if (!token) throw new Error('سجّل الدخول بحساب المدير أو الدعم الفني مرة أخرى.');
  let response;
  try {
    response = await fetch('/api/student-password', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, password }),
    });
  } catch {
    throw new Error('انقطع الاتصال ولم يمكن تأكيد النتيجة. تحقق من الاتصال قبل إعادة المحاولة.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'تعذر تغيير كلمة المرور.');
  if (result.passwordChanged !== true) throw new Error('لم يمكن تأكيد تغيير كلمة المرور.');
  return result;
}

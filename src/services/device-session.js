import { auth } from '../firebase';

export async function resetStudentDevice(studentId) {
  return manageStudentSession(studentId, 'reset');
}

export async function endStudentSession(studentId) {
  return manageStudentSession(studentId, 'endSession');
}
export async function allowStudentDesktop(studentId, enabled) {
  return manageStudentSession(studentId, 'allowDesktop', { enabled });
}

async function manageStudentSession(studentId, action, extra = {}) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('سجّل الدخول بحساب الإدارة مرة أخرى.');
  const response = await fetch('/api/device-session', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, studentId, ...extra }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'تعذر تصفير الجهاز.');
}

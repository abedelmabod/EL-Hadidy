import { auth } from '../firebase';

export async function resetStudentDevice(studentId) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('سجّل الدخول بحساب الإدارة مرة أخرى.');
  const response = await fetch('/api/device-session', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset', studentId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'تعذر تصفير الجهاز.');
}

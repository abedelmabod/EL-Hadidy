import { auth, db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { clearedDeviceFields, executeDeviceReset } from './device-reset-workflow';

const pendingResets = new Map();

export async function resetStudentDevice(studentId, { logAction } = {}) {
  if (pendingResets.has(studentId)) return pendingResets.get(studentId);
  const operation = executeDeviceReset({
    reset: () => manageStudentSession(studentId, 'reset'),
    syncDisplay: () => updateDoc(doc(db, 'students', studentId), clearedDeviceFields),
    logAction,
  });
  pendingResets.set(studentId, operation);
  try {
    return await operation;
  } finally {
    pendingResets.delete(studentId);
  }
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
  if (!response.ok || data.ok !== true) throw new Error(data.error || 'تعذر تأكيد تنفيذ الإجراء على السيرفر.');
}

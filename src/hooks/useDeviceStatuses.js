import { useEffect, useMemo, useState } from 'react';
import { getStudentDeviceStatuses } from '../services/device-session';

export function useDeviceStatuses(students, enabled = true) {
  const key = JSON.stringify([...new Set(students.map((student) => student.authUid || student.id).filter(Boolean))].sort());
  const [result, setResult] = useState({ key: '', statuses: {}, error: false });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let busy = false;
    const uids = JSON.parse(key);
    const refresh = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const statuses = {};
        for (let i = 0; i < uids.length; i += 200) {
          Object.assign(statuses, await getStudentDeviceStatuses(uids.slice(i, i + 200)));
        }
        if (!cancelled) setResult({ key, statuses, error: false });
      } catch {
        if (!cancelled) setResult({ key, statuses: {}, error: true });
      } finally { busy = false; }
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('student-device-status-changed', refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('student-device-status-changed', refresh);
    };
  }, [key, enabled]);
  return useMemo(() => students.map((student) => ({ ...student,
    deviceStatus: enabled && result.key === key ? result.statuses[student.authUid || student.id] : undefined,
    deviceStatusLabel: enabled && result.key === key && result.error ? 'تعذر التحقق' : 'جارٍ التحقق',
  })), [students, enabled, result, key]);
}

export function deviceCountLabel(student) {
  return student.deviceStatus ? `${student.deviceStatus.mobileBound ? 1 : 0}/1` : student.deviceStatusLabel;
}

export function deviceTypeLabel(student) {
  if (!student.deviceStatus) return student.deviceStatusLabel;
  return [student.deviceStatus.mobileBound && 'هاتف', student.deviceStatus.desktopBound && 'Windows'].filter(Boolean).join(' + ') || 'غير مسجل';
}

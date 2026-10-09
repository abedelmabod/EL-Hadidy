import { randomUUID } from 'node:crypto';

export async function setDesktopPermission(db, uid, enabled) {
  await db.batch([
    { sql: 'INSERT INTO student_desktop_permissions VALUES (?, ?) ON CONFLICT(student_uid) DO UPDATE SET enabled = excluded.enabled', args: [uid, enabled ? 1 : 0] },
    { sql: 'DELETE FROM student_active_sessions WHERE student_uid = ?', args: [uid] },
  ], 'write');
}

export async function setStudentBan(db, studentRef, uid, banned) {
  const operation = randomUUID();
  // Fail closed across stores: block access before attempting the Firestore update.
  await db.batch([
    { sql: `INSERT INTO student_access_blocks VALUES (?, 1, ?)
      ON CONFLICT(student_uid) DO UPDATE SET blocked = 1, operation_id = excluded.operation_id`, args: [uid, operation] },
    { sql: 'DELETE FROM student_active_sessions WHERE student_uid = ?', args: [uid] },
  ], 'write');
  try {
    await studentRef.update({ isBanned: banned, banReason: banned ? 'حظر يدوي بواسطة الإدارة' : '' });
  } catch {
    return { ok: true, accessBlocked: true, warnings: ['تم إيقاف الوصول وإنهاء الجلسة، لكن تعذر تحديث حالة الحظر المعروضة. أعد تنفيذ الإجراء لإكمال المزامنة.'] };
  }
  if (!banned) {
    try {
      const result = await db.execute({ sql: 'UPDATE student_access_blocks SET blocked = 0 WHERE student_uid = ? AND operation_id = ?', args: [uid, operation] });
      if (!result.rowsAffected) return { ok: true, accessBlocked: true, warnings: ['تغيرت حالة الحساب بإجراء أحدث. حدّث الصفحة وتحقق من الحالة.'] };
    } catch {
      return { ok: true, accessBlocked: true, warnings: ['لم يكتمل فك الحظر؛ الوصول ما زال موقوفًا. أعد تنفيذ فك الحظر.'] };
    }
  }
  return { ok: true, accessBlocked: banned, warnings: [] };
}

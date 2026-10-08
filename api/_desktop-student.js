import { HttpError } from './_quiz-server.js';

export async function activateStudentCode(store, uid, studentId, rawCode) {
  if (typeof rawCode !== 'string' || !/^\d{4,32}$/.test(rawCode)) throw new HttpError(400, 'اكتب رمز تسجيل صحيح.');
  const studentRef = store.collection('students').doc(studentId);
  return store.runTransaction(async (tx) => {
    const student = await tx.get(studentRef);
    if (!student.exists || (student.data().authUid || student.id) !== uid || student.data().isBanned) throw new HttpError(403, 'الحساب غير مؤهل.');
    const matches = await tx.get(store.collection('codes').where('code', '==', rawCode).limit(2));
    if (matches.size !== 1) throw new HttpError(400, 'رمز التسجيل غير صحيح أو غير متاح.');
    const codeDoc = matches.docs[0];
    const code = codeDoc.data();
    if (code.isUsed || code.used || code.isActive === false || ['disabled', 'revoked', 'isStopped', 'stopped'].some((key) => code[key])) throw new HttpError(409, 'رمز التسجيل مستخدم أو موقوف.');
    const year = code.year || code.accessYear || code.codeYear || code.grade;
    if (!year) throw new HttpError(400, 'الكود غير مرتبط بمرحلة دراسية.');
    const profile = student.data();
    tx.update(studentRef, { isSubscribed: true, usedCode: rawCode,
      usedCodes: [...new Set([...(profile.usedCodes || []), rawCode])],
      accessYears: [...new Set([...(profile.accessYears || []), year])] });
    tx.update(codeDoc.ref, { isUsed: true, usedById: student.id, usedBy: student.id, usedAt: new Date().toISOString() });
    return { ok: true };
  });
}

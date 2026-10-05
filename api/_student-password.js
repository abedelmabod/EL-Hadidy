import { FieldValue } from 'firebase-admin/firestore';
import { HttpError } from './_quiz-server.js';

export async function requirePasswordManager(identity) {
  for (const [collection, role] of [['admins', 'admin'], ['support_team', 'support']]) {
    const direct = await identity.store.collection(collection).doc(identity.uid).get();
    let profile = direct.exists && (!direct.data().authUid || direct.data().authUid === identity.uid) ? direct : null;
    if (!profile) {
      const matches = await identity.store.collection(collection).where('authUid', '==', identity.uid).limit(1).get();
      profile = matches.docs[0];
    }
    if (profile) {
      if (profile.data().isBanned) throw new HttpError(403, 'الحساب الإداري محظور.');
      return { id: profile.id, role, name: profile.data().name || profile.data().username || role };
    }
  }
  throw new HttpError(403, 'ليس لديك صلاحية تغيير كلمة مرور الطلاب.');
}

export function validateNewPassword(password, policy) {
  if (typeof password !== 'string' || !password.length || password.length > 4096) {
    throw new HttpError(400, 'كلمة المرور مطلوبة ولا يمكن أن تتجاوز 4096 حرفًا.');
  }
  const rules = policy?.enforcementState === 'OFF' ? {} : policy?.constraints || {};
  const failures = [];
  if (password.length < (rules.minLength ?? 6)) failures.push(`على الأقل ${rules.minLength ?? 6} أحرف`);
  if (rules.maxLength && password.length > rules.maxLength) failures.push(`بحد أقصى ${rules.maxLength} حرفًا`);
  if (rules.requireLowercase && !/[a-z]/.test(password)) failures.push('حرف إنجليزي صغير');
  if (rules.requireUppercase && !/[A-Z]/.test(password)) failures.push('حرف إنجليزي كبير');
  if (rules.requireNumeric && !/[0-9]/.test(password)) failures.push('رقم إنجليزي');
  // Firebase accepts this specific set, not whitespace or arbitrary Unicode characters.
  const symbols = '^$*.[]{}()?"!@#%&/\\,><\':;|_~';
  if (rules.requireNonAlphanumeric && ![...password].some((character) => symbols.includes(character))) failures.push('رمز خاص');
  if (failures.length) throw new HttpError(400, `كلمة المرور لا تطابق سياسة Firebase: ${failures.join('، ')}.`);
}

export function passwordServiceError(error) {
  if (error instanceof HttpError) return error;
  if (error.code === 'auth/user-not-found') return new HttpError(404, 'لا يوجد حساب Authentication مرتبط بهذا الطالب.');
  if (['auth/invalid-password', 'auth/password-does-not-meet-requirements', 'auth/weak-password'].includes(error.code)) {
    return new HttpError(400, 'كلمة المرور لا تطابق سياسة Firebase. اختر كلمة مرور أقوى.');
  }
  if (['auth/insufficient-permission', 'auth/invalid-credential'].includes(error.code)) {
    return new HttpError(503, 'صلاحيات خدمة Firebase غير كافية. تواصل مع مسئول النظام.');
  }
  return new HttpError(503, 'تعذر الاتصال بخدمة تغيير كلمة المرور. حاول مرة أخرى.');
}

export async function changeStudentPassword(identity, firebaseAuth, body) {
  const actor = await requirePasswordManager(identity);
  const { studentId, password } = body || {};
  if (typeof studentId !== 'string' || !studentId || studentId.length > 128 || studentId.includes('/')) {
    throw new HttpError(400, 'اختر طالبًا صحيحًا.');
  }
  if (typeof password !== 'string' || !password.length || password.length > 4096) validateNewPassword(password);
  const ref = identity.store.collection('students').doc(studentId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpError(404, 'الطالب غير موجود.');
  const student = snapshot.data();
  if (student.isBanned) throw new HttpError(403, 'لا يمكن تغيير كلمة مرور حساب طالب محظور.');
  const uid = student.authUid || snapshot.id;
  if (typeof uid !== 'string' || !uid.length || uid.length > 128) {
    throw new HttpError(404, 'بيانات ربط حساب Authentication غير صالحة.');
  }
  try {
    const account = await firebaseAuth.getUser(uid);
    if (account.disabled) throw new HttpError(403, 'حساب الطالب معطل في Authentication.');
    const config = await firebaseAuth.projectConfigManager().getProjectConfig();
    validateNewPassword(password, config.passwordPolicyConfig);
    await firebaseAuth.updateUser(uid, { password });
  } catch (error) { throw passwordServiceError(error); }

  // The password is already changed. Cleanup/audit failures must not be reported as a failed reset.
  const warnings = [];
  try { await ref.update({ password: FieldValue.delete() }); }
  catch { warnings.push('تم تغيير الباسورد، لكن تعذر حذف حقل الباسورد القديم من بيانات الطالب.'); }
  try {
    await identity.store.collection('logs').add({
      studentId: snapshot.id, studentName: student.name || student.username || 'طالب',
      action: 'إعادة تعيين كلمة مرور الطالب في Firebase Authentication',
      alertType: 'support', seen: true, supportActor: actor.name,
      actorUid: identity.uid, actorId: actor.id, actorRole: actor.role,
      time: FieldValue.serverTimestamp(), passwordFieldCleared: warnings.length === 0,
    });
  } catch { warnings.push('تم تغيير الباسورد، لكن تعذر تسجيل الإجراء في سجل الدعم.'); }
  return { passwordChanged: true, warnings };
}

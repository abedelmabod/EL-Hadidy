export const clearedDeviceFields = {
  deviceId: null,
  deviceIds: [],
  deviceCount: 0,
  deviceType: null,
  deviceInfo: null,
  lastDeviceId: '',
  lastDeviceLinkedAt: null,
};

export async function executeDeviceReset({ reset, syncDisplay, logAction }) {
  await reset();
  const warnings = [];
  try {
    await syncDisplay();
  } catch {
    warnings.push('تم التصفير على السيرفر، لكن تعذر تحديث بيانات الأجهزة المعروضة. لا تحتاج لإعادة التصفير.');
  }
  if (logAction) {
    try {
      await logAction();
    } catch {
      warnings.push('تم التصفير، لكن تعذر تسجيل الإجراء في سجل الدعم.');
    }
  }
  return { ok: true, warnings };
}

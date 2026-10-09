const messages = {
  ACCOUNT_BANNED: 'الحساب محظور أو الوصول موقوف. تواصل مع الدعم الفني.',
  PLATFORM_REQUIRED: 'تعذر تحديد نوع التطبيق. بيانات المنصة المطلوبة لم تصل إلى السيرفر. تواصل مع الدعم الفني.',
  DEVICE_PROOF_REQUIRED: 'بيانات التحقق من الجهاز ناقصة أو غير صالحة. تواصل مع الدعم الفني.',
  DEVICE_MISMATCH: 'بيانات الجهاز لا تطابق الجهاز المرتبط بالحساب أو تم إلغاء ربط هذا الجهاز. تواصل مع الدعم الفني.',
  SESSION_REQUIRED: 'لم تصل جلسة الدخول المطلوبة إلى السيرفر. سجّل الدخول مرة أخرى أو تواصل مع الدعم الفني.',
  SESSION_REVOKED: 'جلسة الدخول غير صالحة أو تم إنهاؤها. سجّل الدخول مرة أخرى.',
  SESSION_EXPIRED: 'انتهت مدة جلسة الدخول. سجّل الدخول مرة أخرى.',
  SESSION_ACTIVE: 'سجّل الخروج من الهاتف أو الكمبيوتر أولًا قبل استخدام الجهاز الآخر. لو الجلسة عالقة تواصل مع الدعم الفني.',
  DESKTOP_NOT_APPROVED: 'نسخة الكمبيوتر تحتاج موافقة الدكتور أو الدعم الفني أولًا.',
};

export function deviceSessionMessage(code) {
  return Object.hasOwn(messages, code) ? messages[code] : 'تعذر التحقق من جلسة الجهاز. تواصل مع الدعم الفني.';
}

export function logDeviceSessionRejection(req, action, code, status, warn = console.warn) {
  const platform = req.headers?.['x-client-platform'];
  // Only allowlisted metadata reaches logs; never log headers, bodies, or error objects.
  warn('Device session rejected', JSON.stringify({
    code: Object.hasOwn(messages, code) || ['HTTP_REJECTED', 'INVALID_REQUEST', 'SERVER_UNAVAILABLE'].includes(code)
      ? code : 'UNKNOWN_REJECTION',
    status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500,
    action: ['bind', 'verify', 'logout', 'reset', 'endSession', 'allowDesktop', 'setBan', 'statuses'].includes(action) ? action : 'unknown',
    platform: ['mobile', 'windows'].includes(platform) ? platform : platform == null ? 'missing' : 'invalid',
  }));
}

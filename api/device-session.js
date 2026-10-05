import { bindDevice, deviceProof, verifyDevice, resetDevice, DeviceBindingError } from './_device-binding.js';
import { getDatabase, HttpError, identify, requireDeviceManager } from './_quiz-server.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const identity = await identify(req);
    const database = await getDatabase();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (body.action === 'reset') {
      await requireDeviceManager(identity);
      if (typeof body.studentId !== 'string' || !body.studentId || body.studentId.length > 128) {
        throw new HttpError(400, 'الطالب مطلوب.');
      }
      const student = await identity.store.collection('students').doc(body.studentId).get();
      if (!student.exists) throw new HttpError(404, 'الطالب غير موجود.');
      await resetDevice(database, student.data().authUid || student.id);
    } else if (body.action === 'bind') {
      const direct = await identity.store.collection('students').doc(identity.uid).get();
      const results = direct.exists ? [direct] : (await identity.store.collection('students')
        .where('authUid', '==', identity.uid).limit(1).get()).docs;
      const profile = results[0]?.data();
      if (!profile || profile.isBanned || (profile.authUid && profile.authUid !== identity.uid)) {
        throw new HttpError(403, 'الحساب غير مؤهل.');
      }
      const legacy = [...new Set([profile.deviceId, ...(Array.isArray(profile.deviceIds) ? profile.deviceIds : [])].filter(Boolean))];
      await bindDevice(database, identity.uid, deviceProof(req.headers), legacy);
    } else if (body.action === 'verify') {
      await verifyDevice(database, identity.uid, deviceProof(req.headers));
    } else { throw new HttpError(400, 'طلب غير صالح.'); }
    return res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof DeviceBindingError) return res.status(error.status).json({
      code: error.code, error: 'هذا الحساب مرتبط بجهاز آخر. تواصل مع الدكتور لتصفير الجهاز.',
    });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'طلب غير صالح.' });
    console.error('Device session failure', error.name);
    return res.status(503).json({ error: 'تعذر التحقق من الجهاز. حاول مرة أخرى.' });
  }
}

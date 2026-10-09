import { deviceProof, DeviceBindingError } from './_device-binding.js';
import { getDatabase, HttpError, identify, requireDeviceManager } from './_quiz-server.js';
import { claimSession, clientPlatform, releaseSession, resetStudentDevices, verifySession, verifyLegacyMobileSession } from './_student-session.js';
import { deviceSessionMessage, logDeviceSessionRejection } from './_device-session-diagnostics.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  let action;
  try {
    const database = await getDatabase();
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    action = body.action;
    if (['verify', 'logout'].includes(body.action) && req.headers['x-student-session']) {
      const session = await verifySession(database, req.headers, deviceProof(req.headers), { allowExpired: body.action === 'logout' });
      if (body.action === 'logout') await releaseSession(database, session);
      return res.status(200).json({ ok: true });
    }
    // Session claims and administrative actions always require a Firebase identity.
    const identity = await identify({ ...req, headers: { ...req.headers, 'x-student-session': undefined } });
    if (body.action === 'reset') {
      await requireDeviceManager(identity);
      if (typeof body.studentId !== 'string' || !body.studentId || body.studentId.length > 128) {
        throw new HttpError(400, 'الطالب مطلوب.');
      }
      const student = await identity.store.collection('students').doc(body.studentId).get();
      if (!student.exists) throw new HttpError(404, 'الطالب غير موجود.');
      await resetStudentDevices(database, student.data().authUid || student.id);
    } else if (['endSession', 'allowDesktop'].includes(body.action)) {
      await requireDeviceManager(identity);
      if (typeof body.studentId !== 'string' || !body.studentId || body.studentId.length > 128) throw new HttpError(400, 'الطالب مطلوب.');
      const student = await identity.store.collection('students').doc(body.studentId).get();
      if (!student.exists) throw new HttpError(404, 'الطالب غير موجود.');
      const uid = student.data().authUid || student.id;
      if (body.action === 'allowDesktop') {
        if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'إعداد غير صالح.');
        await database.execute({ sql: 'INSERT INTO student_desktop_permissions VALUES (?, ?) ON CONFLICT(student_uid) DO UPDATE SET enabled = excluded.enabled', args: [uid, body.enabled ? 1 : 0] });
      }
      await database.execute({ sql: 'DELETE FROM student_active_sessions WHERE student_uid = ?', args: [uid] });
    } else if (body.action === 'bind') {
      const direct = await identity.store.collection('students').doc(identity.uid).get();
      const results = direct.exists ? [direct] : (await identity.store.collection('students')
        .where('authUid', '==', identity.uid).limit(1).get()).docs;
      const profile = results[0]?.data();
      if (!profile || ['isBanned', 'blocked', 'isBlocked', 'disabled', 'isDisabled'].some((key) => profile[key]) || (profile.authUid && profile.authUid !== identity.uid)) {
        throw new HttpError(403, 'الحساب غير مؤهل.');
      }
      const legacy = [...new Set([profile.deviceId, ...(Array.isArray(profile.deviceIds) ? profile.deviceIds : [])].filter(Boolean))];
      const proof = deviceProof(req.headers);
      const platform = clientPlatform(req.headers);
      return res.status(200).json({ ok: true, ...await claimSession(database, identity.uid, proof, platform,
        { id: results[0].id, ...profile }, { legacyIds: legacy }) });
    } else if (['verify', 'logout'].includes(body.action)) {
      const session = await verifyLegacyMobileSession(database, identity.uid, req.headers, deviceProof(req.headers), {
        allowExpired: body.action === 'logout',
      });
      if (body.action === 'logout') await releaseSession(database, session);
    } else { throw new HttpError(400, 'طلب غير صالح.'); }
    return res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof DeviceBindingError) {
      logDeviceSessionRejection(req, action, error.code, error.status);
      return res.status(error.status).json({ code: error.code, error: deviceSessionMessage(error.code) });
    }
    if (error instanceof HttpError) {
      logDeviceSessionRejection(req, action, 'HTTP_REJECTED', error.status);
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof SyntaxError) {
      logDeviceSessionRejection(req, action, 'INVALID_REQUEST', 400);
      return res.status(400).json({ error: 'طلب غير صالح.' });
    }
    logDeviceSessionRejection(req, action, 'SERVER_UNAVAILABLE', 503);
    return res.status(503).json({ error: 'تعذر التحقق من الجهاز. حاول مرة أخرى.' });
  }
}

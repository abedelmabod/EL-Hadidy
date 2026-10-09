export async function readDeviceStatuses(db, uids) {
  if (!uids.length) return {};
  const rows = (await db.execute({
    sql: `SELECT u.student_uid, m.linked_at AS mobile_linked_at, d.linked_at AS desktop_linked_at,
      s.platform AS session_platform FROM (${uids.map(() => 'SELECT ? AS student_uid').join(' UNION ALL ')}) u
      LEFT JOIN student_device_bindings m ON m.student_uid = u.student_uid
      LEFT JOIN student_desktop_bindings d ON d.student_uid = u.student_uid
      LEFT JOIN student_active_sessions s ON s.student_uid = u.student_uid`,
    args: uids,
  })).rows;
  return Object.fromEntries(rows.map((row) => [row.student_uid, {
    mobileBound: !!row.mobile_linked_at,
    desktopBound: !!row.desktop_linked_at,
    mobileLinkedAt: row.mobile_linked_at || null,
    desktopLinkedAt: row.desktop_linked_at || null,
    sessionPlatform: row.session_platform || null,
  }]));
}

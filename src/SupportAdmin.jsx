import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db } from './firebase';
import ThemeToggle from './ThemeToggle';

const YEAR_TABS = ['الكل', 'الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة'];

const STATUS_FILTERS = [
  { id: 'all', label: 'كل الحالات' },
  { id: 'active', label: 'نشط' },
  { id: 'banned', label: 'محظور' },
  { id: 'subscribed', label: 'مشترك' },
  { id: 'unsubscribed', label: 'غير مشترك' },
];

const DEVICE_FILTERS = [
  { id: 'all', label: 'كل الأجهزة' },
  { id: 'registered', label: 'جهاز مسجل' },
  { id: 'unregistered', label: 'بدون جهاز' },
];

const ISSUE_TYPES = ['متابعة عامة', 'مشكلة كود', 'تصفير جهاز', 'مشكلة فيديو', 'كلمة المرور', 'اشتراك'];
const PRIORITIES = ['عادية', 'متوسطة', 'عاجلة'];
const CASE_STATUSES = ['جديد', 'قيد المتابعة', 'تم الحل'];

function SupportAdmin({ setUser, theme, themeMode, toggleTheme, supportRequests = [] }) {
  const [students, setStudents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [activeYear, setActiveYear] = useState('الكل');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [supportNote, setSupportNote] = useState('');
  const [issueType, setIssueType] = useState(ISSUE_TYPES[0]);
  const [priority, setPriority] = useState(PRIORITIES[0]);
  const [caseStatus, setCaseStatus] = useState(CASE_STATUSES[0]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const studentsQuery = query(collection(db, 'students'), orderBy('name'));
    const unsubscribe = onSnapshot(studentsQuery, (snapshot) => {
      setStudents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const logsQuery = query(collection(db, 'logs'), orderBy('time', 'desc'));
    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      setLogs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });

    return () => unsubscribe();
  }, []);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) || null,
    [selectedStudentId, students]
  );

  useEffect(() => {
    if (!selectedStudent) return;
    setPasswordDraft(selectedStudent.password || '');
    setSupportNote(selectedStudent.supportNote || '');
    setIssueType(selectedStudent.supportIssueType || ISSUE_TYPES[0]);
    setPriority(selectedStudent.supportPriority || PRIORITIES[0]);
    setCaseStatus(selectedStudent.supportStatus || CASE_STATUSES[0]);
  }, [selectedStudent]);

  const filteredStudents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return students.filter((student) => {
      const searchable = [student.name, student.username, student.phone, student.usedCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      const matchesYear = activeYear === 'الكل' || student.year === activeYear || student.codeYear === activeYear;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && !student.isBanned) ||
        (statusFilter === 'banned' && student.isBanned) ||
        (statusFilter === 'subscribed' && student.isSubscribed) ||
        (statusFilter === 'unsubscribed' && !student.isSubscribed);
      const matchesDevice =
        deviceFilter === 'all' ||
        (deviceFilter === 'registered' && student.deviceId) ||
        (deviceFilter === 'unregistered' && !student.deviceId);

      return matchesSearch && matchesYear && matchesStatus && matchesDevice;
    });
  }, [students, search, activeYear, statusFilter, deviceFilter]);

  const selectedStudentLogs = useMemo(() => {
    if (!selectedStudent) return [];
    return logs
      .filter((log) => log.studentId === selectedStudent.id || log.studentName === selectedStudent.name)
      .slice(0, 8);
  }, [logs, selectedStudent]);

  const pendingSupportRequests = useMemo(
    () => supportRequests.filter((request) => (request.status || 'pending') === 'pending'),
    [supportRequests]
  );

  const selectedStudentRequests = useMemo(() => {
    if (!selectedStudent) return [];
    return supportRequests
      .filter((request) => request.studentId === selectedStudent.id || request.studentName === selectedStudent.name)
      .slice(0, 6);
  }, [selectedStudent, supportRequests]);

  const stats = useMemo(
    () => [
      { label: 'إجمالي الطلاب', value: students.length, icon: 'fa-users', color: theme.accent },
      { label: 'نشط', value: students.filter((student) => !student.isBanned).length, icon: 'fa-user-check', color: theme.success },
      { label: 'محظور', value: students.filter((student) => student.isBanned).length, icon: 'fa-user-slash', color: theme.danger },
      { label: 'بدون جهاز', value: students.filter((student) => !student.deviceId).length, icon: 'fa-mobile-screen', color: theme.info },
      { label: 'طلبات معلقة', value: pendingSupportRequests.length, icon: 'fa-headset', color: theme.accent },
    ],
    [pendingSupportRequests.length, students, theme]
  );

  const formatDate = (value) => {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    if (!date || Number.isNaN(date.getTime())) return 'غير محدد';
    return date.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const showToast = (title, icon = 'success') => {
    Swal.fire({
      icon,
      title,
      background: theme.surface,
      color: theme.text,
      timer: 1400,
      showConfirmButton: false,
    });
  };

  const confirmAction = async (title, text, actionCallback, isDanger = false) => {
    const result = await Swal.fire({
      title,
      text,
      icon: isDanger ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: 'نعم، تنفيذ',
      cancelButtonText: 'إلغاء',
      confirmButtonColor: isDanger ? theme.danger : theme.accent,
      cancelButtonColor: theme.muted,
      background: theme.surface,
      color: theme.text,
    });

    if (result.isConfirmed) {
      await actionCallback();
    }
  };

  const logSupportAction = async (student, action, extra = {}) => {
    await addDoc(collection(db, 'logs'), {
      studentId: student.id,
      studentName: student.name || student.username || 'طالب',
      action,
      alertType: 'support',
      seen: true,
      deviceType: 'Support Panel',
      supportActor: 'مسئول الدعم الفني',
      time: serverTimestamp(),
      ...extra,
    });
  };

  const resetDevice = async (student) => {
    await confirmAction('تصفير جهاز الطالب؟', 'سيتم السماح للطالب بتسجيل الدخول من جهاز جديد.', async () => {
      await updateDoc(doc(db, 'students', student.id), {
        deviceId: null,
        deviceType: null,
        deviceInfo: null,
      });
      await logSupportAction(student, 'تصفير جهاز الطالب من لوحة الدعم');
      showToast('تم تصفير الجهاز');
    });
  };

  const toggleBan = async (student) => {
    const willBan = !student.isBanned;
    await confirmAction(
      willBan ? 'حظر الطالب؟' : 'إلغاء حظر الطالب؟',
      willBan ? 'لن يستطيع الطالب استخدام المنصة حتى يتم إلغاء الحظر.' : 'سيتم السماح للطالب باستخدام المنصة مرة أخرى.',
      async () => {
        await updateDoc(doc(db, 'students', student.id), {
          isBanned: willBan,
          banReason: willBan ? 'حظر يدوي من الدعم الفني' : '',
        });
        await logSupportAction(student, willBan ? 'حظر الطالب من لوحة الدعم' : 'إلغاء حظر الطالب من لوحة الدعم');
        showToast(willBan ? 'تم حظر الطالب' : 'تم إلغاء الحظر');
      },
      willBan
    );
  };

  const changePassword = async (student) => {
    const nextPassword = passwordDraft.trim();

    if (!nextPassword) {
      Swal.fire({
        icon: 'warning',
        title: 'أدخل كلمة المرور الجديدة',
        background: theme.surface,
        color: theme.text,
        confirmButtonColor: theme.accent,
      });
      return;
    }

    await confirmAction('تغيير كلمة المرور؟', 'سيتم تحديث كلمة مرور الطالب داخل بيانات المنصة.', async () => {
      await updateDoc(doc(db, 'students', student.id), { password: nextPassword });
      await logSupportAction(student, 'تغيير كلمة مرور الطالب من لوحة الدعم');
      showToast('تم تحديث كلمة المرور');
    });
  };

  const saveSupportCase = async (student) => {
    await updateDoc(doc(db, 'students', student.id), {
      supportNote: supportNote.trim(),
      supportIssueType: issueType,
      supportPriority: priority,
      supportStatus: caseStatus,
      supportUpdatedAt: serverTimestamp(),
    });
    await logSupportAction(student, `تحديث متابعة الدعم: ${issueType} - ${caseStatus}`, { supportPriority: priority });
    showToast('تم حفظ متابعة الدعم');
  };

  const updateSupportRequestStatus = async (request, status) => {
    await updateDoc(doc(db, 'supportRequests', request.id), {
      status,
      reviewedAt: serverTimestamp(),
      reviewedBy: 'support',
    });
    showToast('تم تحديث حالة الطلب');
  };

  const openRequestStudent = (request) => {
    setSelectedStudentId(request.studentId || null);
    setSearch(request.studentName || request.username || '');
  };

  const copyText = async (text, label) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast(`تم نسخ ${label}`);
    } catch {
      Swal.fire({
        icon: 'info',
        title: 'انسخ النص يدويًا',
        text,
        background: theme.surface,
        color: theme.text,
        confirmButtonColor: theme.accent,
      });
    }
  };

  const normalizePhoneForWhatsApp = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('20')) return digits;
    if (digits.startsWith('0')) return `20${digits.slice(1)}`;
    return digits;
  };

  const openWhatsApp = (student) => {
    const phone = normalizePhoneForWhatsApp(student.phone);
    if (!phone) {
      showToast('لا يوجد رقم هاتف للطالب', 'warning');
      return;
    }
    const message = `أهلاً ${student.name || student.username}، معك الدعم الفني لمنصة الحديدي. نتابع طلبك الآن.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const pillStyle = (active, color = theme.accent) => ({
    background: active ? color : theme.surfaceAlt,
    color: active ? theme.buttonText : theme.text,
    border: active ? `1px solid ${color}` : `1px solid ${theme.borderSoft}`,
    borderRadius: '999px',
    padding: '10px 15px',
    cursor: 'pointer',
    fontWeight: '800',
    fontFamily: 'inherit',
  });

  const cardStyle = {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: '24px',
    boxShadow: theme.mode === 'light' ? '0 18px 40px rgba(15,23,42,0.08)' : '0 18px 40px rgba(0,0,0,0.22)',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.bg,
        color: theme.text,
        direction: 'rtl',
        fontFamily: 'Cairo, sans-serif',
        padding: isMobile ? '16px' : '30px',
      }}
    >
      <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gap: '20px' }}>
        <section
          style={{
            background: theme.panelGradient,
            border: `1px solid ${theme.border}`,
            borderRadius: '28px',
            padding: isMobile ? '18px' : '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '20px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexDirection: 'row-reverse' }}>
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="El Hadidy"
              style={{
                width: '72px',
                height: '72px',
                objectFit: 'cover',
                borderRadius: '22px',
                border: `1px solid ${theme.border}`,
                boxShadow: '0 12px 28px rgba(0,0,0,0.24)',
              }}
            />
            <div style={{ textAlign: 'right' }}>
              <h1 style={{ margin: '0 0 6px', color: theme.accent, fontSize: isMobile ? '24px' : '30px' }}>
                لوحة الدعم الفني
              </h1>
              <p style={{ margin: 0, color: theme.subText, maxWidth: '680px', lineHeight: 1.8 }}>
                متابعة الطلاب، تصفير الأجهزة، إدارة الحالات، وتسجيل كل إجراء يتم من مسئول الدعم.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <ThemeToggle mode={themeMode} onToggle={toggleTheme} theme={theme} />
            <button
              onClick={() => setUser(null)}
              style={{
                background: `${theme.danger}11`,
                color: theme.danger,
                border: `1px solid ${theme.danger}55`,
                borderRadius: '14px',
                padding: '12px 18px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontFamily: 'inherit',
              }}
            >
              <i className="fas fa-sign-out-alt" style={{ marginLeft: '8px' }}></i>
              خروج
            </button>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          {stats.map((item) => (
            <div key={item.label} style={{ ...cardStyle, padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <i className={`fas ${item.icon}`} style={{ color: item.color, fontSize: '22px' }}></i>
                <span style={{ color: theme.subText, fontSize: '13px', fontWeight: '800' }}>{item.label}</span>
              </div>
              <div style={{ color: item.color, fontSize: '30px', fontWeight: '900', marginTop: '10px' }}>{item.value}</div>
            </div>
          ))}
        </section>

        <section style={{ ...cardStyle, padding: '18px', display: 'grid', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', color: theme.text }}>طلبات الدعم الواردة</h2>
              <p style={{ margin: '5px 0 0', color: theme.subText, fontSize: '13px' }}>طلبات الطلاب المرسلة من التطبيق تظهر هنا مباشرة.</p>
            </div>
            <span style={{ color: theme.accent, fontWeight: '900' }}>{pendingSupportRequests.length} معلق</span>
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            {supportRequests.slice(0, 8).map((request) => (
              <div
                key={request.id}
                style={{
                  background: theme.surfaceAlt,
                  border: `1px solid ${theme.borderSoft}`,
                  borderRadius: '16px',
                  padding: '14px',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ color: theme.text }}>{request.studentName || request.username || 'طالب'}</strong>
                    <div style={{ color: theme.accent, fontSize: '12px', fontWeight: '900', marginTop: '3px' }}>{request.typeLabel || request.type || 'طلب دعم'} • {request.status || 'pending'}</div>
                    <div style={{ color: theme.subText, fontSize: '13px', marginTop: '5px', lineHeight: 1.7 }}>{request.message || 'لا توجد رسالة إضافية.'}</div>
                  </div>
                  <div style={{ color: theme.muted, fontSize: '12px' }}>{formatDate(request.createdAt)}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => openRequestStudent(request)} style={outlineButton(theme.info)}>فتح الطالب</button>
                  <button onClick={() => updateSupportRequestStatus(request, 'in_progress')} style={outlineButton(theme.accent)}>قيد المتابعة</button>
                  <button onClick={() => updateSupportRequestStatus(request, 'resolved')} style={outlineButton(theme.success)}>تم الحل</button>
                </div>
              </div>
            ))}
            {!supportRequests.length && (
              <div style={{ color: theme.muted, textAlign: 'center', padding: '24px 10px' }}>لا توجد طلبات دعم مرسلة من التطبيق حتى الآن.</div>
            )}
          </div>
        </section>

        <section style={{ ...cardStyle, padding: '18px', display: 'grid', gap: '16px' }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث باسم الطالب أو اسم المستخدم أو رقم الهاتف أو الكود"
            style={{
              background: theme.surfaceAlt,
              color: theme.text,
              border: `1px solid ${theme.borderSoft}`,
              borderRadius: '16px',
              padding: '15px 16px',
              outline: 'none',
              fontFamily: 'inherit',
              textAlign: 'right',
            }}
          />

          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {YEAR_TABS.map((year) => (
                <button key={year} onClick={() => setActiveYear(year)} style={pillStyle(activeYear === year)}>
                  {year}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {STATUS_FILTERS.map((item) => (
                <button key={item.id} onClick={() => setStatusFilter(item.id)} style={pillStyle(statusFilter === item.id, theme.info)}>
                  {item.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {DEVICE_FILTERS.map((item) => (
                <button key={item.id} onClick={() => setDeviceFilter(item.id)} style={pillStyle(deviceFilter === item.id, theme.success)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.1fr) minmax(380px, 0.9fr)',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          <div style={{ ...cardStyle, padding: '18px', maxHeight: isMobile ? 'none' : '72vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>قائمة الطلاب</h2>
              <span style={{ color: theme.subText, fontWeight: '800' }}>{filteredStudents.length} طالب</span>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              {filteredStudents.map((student) => (
                <button
                  key={student.id}
                  onClick={() => setSelectedStudentId(student.id)}
                  style={{
                    background: selectedStudentId === student.id ? theme.surfaceAlt : theme.surface,
                    border: `1px solid ${student.isBanned ? `${theme.danger}66` : theme.borderSoft}`,
                    borderRadius: '18px',
                    padding: '16px',
                    textAlign: 'right',
                    color: theme.text,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <span
                      style={{
                        color: student.isBanned ? theme.danger : theme.success,
                        background: student.isBanned ? `${theme.danger}11` : `${theme.success}11`,
                        border: `1px solid ${student.isBanned ? `${theme.danger}44` : `${theme.success}44`}`,
                        borderRadius: '999px',
                        padding: '6px 10px',
                        fontSize: '12px',
                        fontWeight: '900',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {student.isBanned ? 'محظور' : 'نشط'}
                    </span>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: '900', marginBottom: '4px', fontSize: '16px' }}>
                        {student.name || 'طالب بدون اسم'}
                      </div>
                      <div style={{ color: theme.subText, fontSize: '13px' }}>
                        @{student.username || 'بدون اسم مستخدم'} • {student.year || 'بدون فرقة'}
                      </div>
                      <div style={{ color: theme.subText, fontSize: '12px', marginTop: '4px' }}>
                        {student.phone || 'لا يوجد رقم هاتف'} • {student.deviceId ? 'جهاز مسجل' : 'بدون جهاز'}
                      </div>
                    </div>
                  </div>
                </button>
              ))}

              {!filteredStudents.length && (
                <div style={{ color: theme.muted, textAlign: 'center', padding: '42px 10px', lineHeight: 1.8 }}>
                  لا توجد نتائج مطابقة للفلاتر الحالية.
                </div>
              )}
            </div>
          </div>

          <div style={{ ...cardStyle, padding: '22px', minHeight: '520px' }}>
            {selectedStudent ? (
              <div style={{ display: 'grid', gap: '18px' }}>
                <div
                  style={{
                    background: theme.surfaceAlt,
                    border: `1px solid ${theme.borderSoft}`,
                    borderRadius: '22px',
                    padding: '20px',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '78px',
                      height: '78px',
                      margin: '0 auto 12px',
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      color: theme.buttonText,
                      fontWeight: '900',
                      fontSize: '30px',
                      background: theme.gradient,
                    }}
                  >
                    {selectedStudent.name?.[0]?.toUpperCase() || 'S'}
                  </div>
                  <div style={{ fontWeight: '900', fontSize: '23px' }}>{selectedStudent.name || 'طالب'}</div>
                  <div style={{ color: theme.accent, marginTop: '4px', fontWeight: '800' }}>
                    @{selectedStudent.username || 'بدون اسم مستخدم'}
                  </div>
                  <div style={{ color: theme.subText, marginTop: '8px', fontSize: '13px' }}>{selectedStudent.year || 'غير محدد'}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                  {[
                    ['الهاتف', selectedStudent.phone || 'غير مسجل'],
                    ['الاشتراك', selectedStudent.isSubscribed ? 'مشترك' : 'غير مشترك'],
                    ['الكود', selectedStudent.usedCode || 'لا يوجد'],
                    ['الجهاز', selectedStudent.deviceType || 'غير مسجل'],
                    ['الحالة', selectedStudent.isBanned ? 'محظور' : 'نشط'],
                    ['آخر تحديث دعم', formatDate(selectedStudent.supportUpdatedAt)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        background: theme.surfaceAlt,
                        border: `1px solid ${theme.borderSoft}`,
                        borderRadius: '16px',
                        padding: '12px',
                      }}
                    >
                      <div style={{ color: theme.subText, fontSize: '12px', marginBottom: '6px' }}>{label}</div>
                      <div style={{ color: theme.text, fontWeight: '900', fontSize: '13px', overflowWrap: 'anywhere' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                  <button onClick={() => openWhatsApp(selectedStudent)} style={actionButton(theme.success)}>
                    <i className="fab fa-whatsapp"></i> واتساب
                  </button>
                  <a href={selectedStudent.phone ? `tel:${selectedStudent.phone}` : undefined} style={{ ...actionButton(theme.info), textDecoration: 'none', textAlign: 'center' }}>
                    <i className="fas fa-phone"></i> اتصال
                  </a>
                  <button onClick={() => copyText(selectedStudent.username, 'اسم المستخدم')} style={actionButton(theme.accent)}>
                    <i className="fas fa-copy"></i> نسخ المستخدم
                  </button>
                  <button onClick={() => copyText(selectedStudent.phone, 'رقم الهاتف')} style={actionButton(theme.accentAlt || theme.accent)}>
                    <i className="fas fa-hashtag"></i> نسخ الهاتف
                  </button>
                </div>

                <div style={{ display: 'grid', gap: '10px' }}>
                  <div style={{ color: theme.accent, fontWeight: '900' }}>متابعة حالة الدعم</div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                    <select value={issueType} onChange={(event) => setIssueType(event.target.value)} style={inputStyle(theme)}>
                      {ISSUE_TYPES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <select value={priority} onChange={(event) => setPriority(event.target.value)} style={inputStyle(theme)}>
                      {PRIORITIES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <select value={caseStatus} onChange={(event) => setCaseStatus(event.target.value)} style={inputStyle(theme)}>
                      {CASE_STATUSES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </div>
                  <textarea
                    value={supportNote}
                    onChange={(event) => setSupportNote(event.target.value)}
                    placeholder="اكتب ملاحظة داخلية لمسئول الدعم عن حالة الطالب..."
                    rows={4}
                    style={{ ...inputStyle(theme), resize: 'vertical', lineHeight: 1.8 }}
                  />
                  <button onClick={() => saveSupportCase(selectedStudent)} style={primaryButton(theme)}>
                    حفظ متابعة الدعم
                  </button>
                </div>

                <div style={{ display: 'grid', gap: '10px' }}>
                  <div style={{ color: theme.accent, fontWeight: '900' }}>إجراءات الحساب</div>
                  <button onClick={() => resetDevice(selectedStudent)} style={outlineButton(theme.info)}>
                    <i className="fas fa-sync-alt"></i> تصفير الجهاز
                  </button>
                  <button onClick={() => toggleBan(selectedStudent)} style={outlineButton(selectedStudent.isBanned ? theme.success : theme.danger)}>
                    <i className={`fas ${selectedStudent.isBanned ? 'fa-unlock' : 'fa-ban'}`}></i>
                    {selectedStudent.isBanned ? 'إلغاء الحظر' : 'حظر الطالب'}
                  </button>
                </div>

                <div style={{ display: 'grid', gap: '10px' }}>
                  <div style={{ color: theme.accent, fontWeight: '900' }}>تغيير كلمة المرور</div>
                  <input
                    value={passwordDraft}
                    onChange={(event) => setPasswordDraft(event.target.value)}
                    placeholder="كلمة المرور الجديدة"
                    style={inputStyle(theme)}
                  />
                  <p style={{ margin: 0, color: theme.muted, fontSize: '12px', lineHeight: 1.7 }}>
                    ملاحظة: هذا يحدث كلمة المرور المخزنة في بيانات المنصة. لو تم الاعتماد بالكامل على Firebase Auth لاحقًا، ستحتاج هذه العملية لخدمة Backend آمنة.
                  </p>
                  <button onClick={() => changePassword(selectedStudent)} style={primaryButton(theme)}>
                    حفظ كلمة المرور
                  </button>
                </div>

                <div style={{ display: 'grid', gap: '10px' }}>
                  <div style={{ color: theme.accent, fontWeight: '900' }}>آخر إجراءات الطالب</div>
                  {selectedStudentRequests.length ? (
                    selectedStudentRequests.map((request) => (
                      <div
                        key={request.id}
                        style={{
                          background: theme.surfaceAlt,
                          border: `1px solid ${theme.borderSoft}`,
                          borderRadius: '14px',
                          padding: '12px',
                          display: 'grid',
                          gap: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <strong style={{ color: theme.text }}>{request.typeLabel || request.type || 'طلب دعم'}</strong>
                        <div style={{ color: theme.subText, fontSize: '13px', lineHeight: 1.7 }}>{request.message || 'لا توجد رسالة إضافية.'}</div>
                        <div style={{ color: theme.muted, fontSize: '12px' }}>{request.status || 'pending'} • {formatDate(request.createdAt)}</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button onClick={() => updateSupportRequestStatus(request, 'in_progress')} style={outlineButton(theme.accent)}>قيد المتابعة</button>
                          <button onClick={() => updateSupportRequestStatus(request, 'resolved')} style={outlineButton(theme.success)}>تم الحل</button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: theme.muted, fontSize: '13px', marginBottom: '8px' }}>لا توجد طلبات دعم لهذا الطالب حتى الآن.</div>
                  )}

                  {selectedStudentLogs.length ? (
                    selectedStudentLogs.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          background: theme.surfaceAlt,
                          border: `1px solid ${theme.borderSoft}`,
                          borderRadius: '14px',
                          padding: '12px',
                          color: theme.subText,
                          fontSize: '13px',
                          lineHeight: 1.7,
                        }}
                      >
                        <strong style={{ color: theme.text }}>{log.action || 'إجراء'}</strong>
                        <div>{formatDate(log.time)}</div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: theme.muted, fontSize: '13px' }}>لا يوجد سجل إجراءات لهذا الطالب حتى الآن.</div>
                  )}
                </div>
              </div>
            ) : (
              <div
                style={{
                  minHeight: '480px',
                  display: 'grid',
                  placeItems: 'center',
                  color: theme.muted,
                  textAlign: 'center',
                  lineHeight: 1.8,
                }}
              >
                <div>
                  <i className="fas fa-headset" style={{ fontSize: '44px', color: theme.accent, marginBottom: '14px' }}></i>
                  <div style={{ fontWeight: '900', color: theme.text, fontSize: '20px', marginBottom: '8px' }}>اختر طالبًا من القائمة</div>
                  <div>ستظهر بيانات الحساب، إجراءات الدعم، ومتابعة الحالة هنا.</div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function inputStyle(theme) {
  return {
    background: theme.surfaceAlt,
    color: theme.text,
    border: `1px solid ${theme.borderSoft}`,
    borderRadius: '14px',
    padding: '13px 14px',
    outline: 'none',
    fontFamily: 'inherit',
    textAlign: 'right',
  };
}

function primaryButton(theme) {
  return {
    background: theme.gradient,
    color: theme.buttonText,
    border: 'none',
    borderRadius: '14px',
    padding: '14px',
    cursor: 'pointer',
    fontWeight: '900',
    fontFamily: 'inherit',
  };
}

function outlineButton(color) {
  return {
    background: `${color}11`,
    color,
    border: `1px solid ${color}55`,
    borderRadius: '14px',
    padding: '14px',
    cursor: 'pointer',
    fontWeight: '900',
    fontFamily: 'inherit',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
  };
}

function actionButton(color) {
  return {
    background: `${color}11`,
    color,
    border: `1px solid ${color}55`,
    borderRadius: '14px',
    padding: '12px',
    cursor: 'pointer',
    fontWeight: '900',
    fontFamily: 'inherit',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
  };
}

export default SupportAdmin;

import React, { useEffect, useMemo, useState } from 'react';
import { auth } from './firebase';

async function request(body) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('سجّل الدخول بحساب المدير المرتبط بـ Firebase Auth.');
  const response = await fetch('/api/study-plan?action=admin', {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify({ action: 'admin', ...body }) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'تعذر حفظ خطة المذاكرة.');
  return result;
}

export default function StudyPlanAdmin({ lessons = [], theme }) {
  const [priorities, setPriorities] = useState({});
  const [year, setYear] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    request().then((data) => {
      if (active) setPriorities(Object.fromEntries((data.priorities || []).map((item) => [item.lessonId, item])));
    }).catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const years = useMemo(() => [...new Set(lessons.map((lesson) => lesson.year).filter(Boolean))], [lessons]);
  const visible = useMemo(() => lessons.filter((lesson) => lesson.url && lesson.isActive !== false
    && (!year || lesson.year === year)
    && `${lesson.title || lesson.name || ''} ${lesson.subject || ''} ${lesson.chapterName || ''}`.toLocaleLowerCase('ar')
      .includes(search.trim().toLocaleLowerCase('ar'))), [lessons, search, year]);

  const update = (lessonId, patch) => setPriorities((current) => ({ ...current,
    [lessonId]: { lessonId, priority: 0, targetDate: '', ...current[lessonId], ...patch },
  }));
  const save = async (lessonId) => {
    setBusyId(lessonId); setError(''); setNotice('');
    try {
      const item = priorities[lessonId] || {};
      await request({ lessonId, priority: Number(item.priority || 0), targetDate: item.targetDate || null });
      setNotice('تم حفظ أولوية المحاضرة في خطة الطلاب.');
    } catch (cause) { setError(cause.message); }
    finally { setBusyId(''); }
  };

  const field = { background: theme?.card || '#1C2028', color: theme?.text || '#fff',
    border: `1px solid ${theme?.border || '#444'}`, borderRadius: 8, padding: '10px 12px', minWidth: 0 };
  return <section dir="rtl" style={{ display: 'grid', gap: 16, color: theme?.text || '#fff' }}>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <select value={year} onChange={(event) => setYear(event.target.value)} style={field} aria-label="المرحلة أو الفرقة">
        <option value="">كل الفرق والصفوف</option>
        {years.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن محاضرة" style={{ ...field, flex: 1 }} />
    </div>
    {!!error && <p role="alert" style={{ color: '#F87171' }}>{error}</p>}
    {!!notice && <p role="status" style={{ color: '#4ADE80' }}>{notice}</p>}
    {loading ? <p>جار تحميل الإعدادات...</p> : !visible.length ? <p>لا توجد محاضرات مطابقة.</p>
      : visible.map((lesson) => <div key={lesson.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
        flexWrap: 'wrap', padding: 14, border: `1px solid ${theme?.border || '#444'}`, borderRadius: 8 }}>
        <div style={{ flex: '1 1 220px' }}><strong>{lesson.title || lesson.name}</strong><div style={{ opacity: 0.7, fontSize: 12 }}>
          {[lesson.year, lesson.subject, lesson.chapterName].filter(Boolean).join(' / ')}
        </div></div>
        <select value={priorities[lesson.id]?.priority || 0} onChange={(event) => update(lesson.id, { priority: Number(event.target.value) })}
          style={field} aria-label={`أولوية ${lesson.title || lesson.name}`}>
          <option value={0}>عادية</option><option value={1}>مهمة</option><option value={2}>عاجلة</option><option value={3}>الأولى اليوم</option>
        </select>
        <input type="date" value={priorities[lesson.id]?.targetDate || ''}
          onChange={(event) => update(lesson.id, { targetDate: event.target.value })} style={field}
          aria-label={`الموعد المستهدف ${lesson.title || lesson.name}`} />
        <button type="button" disabled={busyId === lesson.id} onClick={() => save(lesson.id)}
          style={{ ...field, cursor: 'pointer', background: theme?.accent || '#D4A84B', color: theme?.buttonText || '#111' }}>
          {busyId === lesson.id ? 'جار الحفظ...' : 'حفظ'}
        </button>
      </div>)}
  </section>;
}

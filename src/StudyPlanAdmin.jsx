import React, { useEffect, useMemo, useState } from 'react';
import { auth } from './firebase';
import { getQuizSubjects, getQuizVideos } from './quiz-content';

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

export default function StudyPlanAdmin({ lessons = [], subjects = [], chapters = {}, stageGroups = [], isSameYear, theme }) {
  const [priorities, setPriorities] = useState({});
  const [stageKey, setStageKey] = useState('');
  const [year, setYear] = useState('');
  const [subjectId, setSubjectId] = useState('');
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

  const selectedStage = stageGroups.find((group) => group.key === stageKey);
  const selectedYear = selectedStage?.options.includes(year) ? year : '';
  const availableSubjects = useMemo(() => selectedYear
    ? getQuizSubjects(subjects, chapters, lessons, selectedYear, isSameYear) : [],
  [subjects, chapters, lessons, selectedYear, isSameYear]);
  const selectedSubject = availableSubjects.find((subject) => subject.id === subjectId);
  const visible = useMemo(() => getQuizVideos(lessons, selectedYear, selectedSubject, isSameYear)
    .filter((lesson) => lesson.url && lesson.isActive !== false
    && `${lesson.title || lesson.name || ''} ${lesson.subject || ''} ${lesson.chapterName || ''}`.toLocaleLowerCase('ar')
      .includes(search.trim().toLocaleLowerCase('ar'))), [lessons, search, selectedYear, selectedSubject, isSameYear]);

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

  const field = { background: theme?.surface || '#1C2028', color: theme?.text || '#fff',
    border: `1px solid ${theme?.border || '#444'}`, borderRadius: 8, padding: '10px 12px', minWidth: 0 };
  const pickerLabel = { display: 'grid', gap: 8, flex: '1 1 220px', minWidth: 0 };
  return <section dir="rtl" style={{ display: 'grid', gap: 16, color: theme?.text || '#fff' }}>
    <div role="group" aria-label="المرحلة" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {stageGroups.map((group) => <button key={group.key} type="button" aria-pressed={stageKey === group.key}
        onClick={() => { setStageKey(group.key); setYear(''); setSubjectId(''); setSearch(''); setNotice(''); }}
        style={{ ...field, flex: '1 1 220px', minHeight: 76, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 12, cursor: 'pointer', fontWeight: 700,
          borderColor: stageKey === group.key ? theme?.accent || '#D4A84B' : theme?.border || '#444' }}>
        <i aria-hidden="true" className={`fas ${group.key === 'college' ? 'fa-graduation-cap' : 'fa-school'}`}
          style={{ color: theme?.accent || '#D4A84B', fontSize: 22 }} />
        {group.key === 'secondary' ? 'المرحلة الثانوية' : group.label}
      </button>)}
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <label style={pickerLabel}>السنة الدراسية
        <select value={selectedYear} disabled={!selectedStage} onChange={(event) => {
          setYear(event.target.value); setSubjectId(''); setSearch(''); setNotice('');
        }} style={field}>
          <option value="">اختر السنة الدراسية</option>
          {(selectedStage?.options || []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label style={pickerLabel}>المادة
        <select value={selectedSubject?.id || ''} disabled={!selectedYear} onChange={(event) => {
          setSubjectId(event.target.value); setSearch(''); setNotice('');
        }} style={field}>
          <option value="">{selectedYear && !availableSubjects.length ? 'لا توجد مواد لهذه السنة' : 'اختر المادة'}</option>
          {availableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
      </label>
      <label style={pickerLabel}>بحث المحاضرات
        <input value={search} disabled={!selectedSubject} onChange={(event) => setSearch(event.target.value)}
          placeholder="ابحث عن محاضرة" style={field} />
      </label>
    </div>
    {!!error && <p role="alert" style={{ color: '#F87171' }}>{error}</p>}
    {!!notice && <p role="status" style={{ color: '#4ADE80' }}>{notice}</p>}
    {!selectedStage ? <p>اختر المرحلة.</p> : !selectedYear ? <p>اختر السنة الدراسية.</p>
      : !selectedSubject ? <p>اختر المادة.</p>
      : loading ? <p>جار تحميل الإعدادات...</p> : !visible.length ? <p>لا توجد محاضرات مطابقة في هذه المادة.</p>
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

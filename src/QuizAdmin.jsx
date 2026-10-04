import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from './firebase';
import { getQuizChapters, getQuizSubjects, getQuizVideos } from './quiz-content';
import './QuizAdmin.css';

const emptyQuestion = () => ({ prompt: '', options: ['', '', '', ''], answerIndex: 0, explanation: '' });

async function quizRequest(path, body) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('حساب المدير الحالي يحتاج ربطًا بـFirebase Auth. سجّل الخروج وادخل مجددًا ثم افتح الاختبارات.');
  const response = await fetch(`/api/quizzes${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'تعذر الاتصال بخدمة الاختبارات.');
  return data;
}

export default function QuizAdmin({ lessons = [], subjects = [], chapters = {}, stageGroups = [], isSameYear, authError, theme }) {
  const [quizzes, setQuizzes] = useState([]);
  const [stageKey, setStageKey] = useState('');
  const [year, setYear] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [filter, setFilter] = useState('');
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [mode, setMode] = useState('exam');
  const [drawCount, setDrawCount] = useState(0);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [editingRevision, setEditingRevision] = useState(false);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const data = await quizRequest('?action=adminList');
    setQuizzes(data.quizzes || []);
  }, []);

  useEffect(() => {
    let active = true;
    refresh().catch((cause) => { if (active) setError(authError || cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh, authError]);

  useEffect(() => {
    if (!lessonId) { setSelectedQuiz(null); setTitle(''); setQuestions([emptyQuestion()]); setMode('exam'); setDrawCount(0); setShuffleOptions(false); setStats(null); return; }
    let active = true;
    setLoading(true);
    setError('');
    quizRequest(`?action=adminQuiz&lessonId=${encodeURIComponent(lessonId)}`)
      .then((data) => {
        if (!active) return;
        setSelectedQuiz(data.quiz);
        setEditingRevision(!!data.quiz?.hasRevisionDraft);
        setTitle(data.draftTitle || data.quiz?.title || `اختبار ${lessons.find((lesson) => lesson.id === lessonId)?.title || 'المحاضرة'}`);
        setQuestions(data.questions?.length ? data.questions : [emptyQuestion()]);
        setMode(data.quiz?.mode || 'exam');
        setDrawCount(Number(data.quiz?.draw_count || 0));
        setShuffleOptions(!!data.quiz?.shuffle_options);
        if (data.quiz) quizRequest(`?action=adminStats&lessonId=${encodeURIComponent(lessonId)}`)
          .then((summary) => { if (active) setStats(summary); }).catch(() => { if (active) setStats(null); });
        else setStats(null);
      })
      .catch((cause) => { if (active) setError(authError || cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [lessonId, lessons, authError]);

  const selectedStage = stageGroups.find((group) => group.key === stageKey);
  const availableSubjects = useMemo(() => year
    ? getQuizSubjects(subjects, chapters, lessons, year, isSameYear) : [],
  [subjects, chapters, lessons, year, isSameYear]);
  const selectedSubject = availableSubjects.find((subject) => subject.id === subjectId);
  const subjectVideos = useMemo(() => getQuizVideos(lessons, year, selectedSubject, isSameYear),
    [lessons, year, selectedSubject, isSameYear]);
  const availableChapters = useMemo(() => getQuizChapters(chapters, selectedSubject, year, subjectVideos, isSameYear),
    [chapters, selectedSubject, year, subjectVideos, isSameYear]);
  const selectedChapter = availableChapters.find((chapter) => chapter.id === chapterId);
  const availableLessons = useMemo(() => subjectVideos.filter((lesson) => selectedChapter?.lessonIds.includes(lesson.id)
    && String(lesson.title || '').toLocaleLowerCase('ar').includes(filter.trim().toLocaleLowerCase('ar'))),
  [subjectVideos, selectedChapter, filter]);
  const quizByLessonId = useMemo(() => new Map(quizzes.map((quiz) => [quiz.lesson_id, quiz])), [quizzes]);
  const selectedLesson = lessons.find((lesson) => lesson.id === lessonId);
  const locked = !!selectedQuiz && selectedQuiz.status !== 'draft' && !editingRevision;

  const updateQuestion = (index, patch) => setQuestions((current) => current.map((question, i) => i === index ? { ...question, ...patch } : question));
  const updateOption = (index, optionIndex, value) => setQuestions((current) => current.map((question, i) => i === index
    ? { ...question, options: question.options.map((option, j) => j === optionIndex ? value : option) }
    : question));

  const perform = async (body, success) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await quizRequest('', body);
      await refresh();
      if (body.action === 'delete') {
        setSelectedQuiz(null);
        setEditingRevision(false);
        setTitle('');
        setQuestions([emptyQuestion()]);
        setMode('exam'); setDrawCount(0); setShuffleOptions(false);
        setStats(null);
        setNotice(success);
        return;
      }
      const detail = await quizRequest(`?action=adminQuiz&lessonId=${encodeURIComponent(lessonId)}`);
      setSelectedQuiz(detail.quiz);
      setEditingRevision(!!detail.quiz?.hasRevisionDraft);
      setTitle(detail.draftTitle || detail.quiz?.title || title);
      setQuestions(detail.questions?.length ? detail.questions : [emptyQuestion()]);
      setMode(detail.quiz?.mode || 'exam');
      setDrawCount(Number(detail.quiz?.draw_count || 0));
      setShuffleOptions(!!detail.quiz?.shuffle_options);
      const summary = await quizRequest(`?action=adminStats&lessonId=${encodeURIComponent(lessonId)}`);
      setStats(summary);
      setNotice(success);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  const save = () => perform({ action: 'save', lessonId, title, questions, mode,
    drawCount: drawCount > questions.length ? 0 : drawCount, shuffleOptions }, 'تم حفظ المسودة.');
  const exportResults = async () => {
    setBusy(true); setError('');
    try {
      const report = await quizRequest(`?action=adminExport&lessonId=${encodeURIComponent(lessonId)}`);
      const safeCell = (value) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
      const lines = [['الطالب', 'معرّف الطالب', 'الوضع', 'الدرجة', 'إجمالي الأسئلة', 'وقت التسليم', 'النسخة'],
        ...report.attempts.map((item) => [item.studentName, item.studentUid, item.mode === 'practice' ? 'تدريب' : 'امتحان', item.score, item.total, item.submittedAt, item.version])];
      const blob = new Blob(['\ufeff', lines.map((row) => row.map(safeCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `quiz-results-${lessonId}.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (report.truncated) setNotice('الملف يحتوي آخر 10000 محاولة فقط.');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const publish = () => {
    if (!selectedQuiz || !window.confirm(selectedQuiz.status === 'draft' ? 'نشر الاختبار للطلاب؟' : 'نشر نسخة مصححة؟ ستبقى النتائج القديمة مرتبطة بالنسخة السابقة.')) return;
    perform({ action: 'publish', quizId: selectedQuiz.id }, 'الاختبار متاح للطلاب الآن.');
  };
  const remove = () => {
    if (!selectedQuiz) return;
    const isDraft = selectedQuiz.status === 'draft';
    const message = isDraft
      ? 'حذف مسودة الاختبار نهائيًا؟'
      : `حذف الاختبار المنشور نهائيًا؟ سيتم حذف الأسئلة وكل نتائج الطلاب ومحاولاتهم ومراجعاتهم المرتبطة به (${selectedQuiz.attempt_count || 0} محاولة). لا يمكن التراجع عن هذا الإجراء.`;
    if (!window.confirm(message)) return;
    perform({ action: 'delete', quizId: selectedQuiz.id }, 'تم حذف الاختبار نهائيًا.');
  };

  return (
    <section className="qa-shell" style={{ '--qa-surface': theme.surface, '--qa-border': theme.borderSoft, '--qa-text': theme.text, '--qa-muted': theme.subText, '--qa-accent': theme.accent }} dir="rtl">
      <header className="qa-heading">
        <div><h2>اختبارات المحاضرات</h2><p>أنشئ بنك أسئلة للفيديو، ثم حدد طريقة العرض للطلاب.</p></div>
        <span>{quizzes.length} اختبار</span>
      </header>
      <div className="qa-layout">
        <aside className="qa-lessons" aria-label="اختيار فيديو الاختبار">
          <div className="qa-step"><span>1</span><strong>المرحلة</strong></div>
          <div className="qa-choice-row">
            {stageGroups.map((group) => <button type="button" key={group.key} className={stageKey === group.key ? 'selected' : ''} onClick={() => {
              setStageKey(group.key); setYear(''); setSubjectId(''); setChapterId(''); setLessonId(''); setFilter('');
            }}>{group.label}</button>)}
          </div>
          <div className="qa-step"><span>2</span><strong>الفرقة أو الصف</strong></div>
          <label className="qa-select-label">اختر الفرقة أو الصف
            <select value={year} disabled={!selectedStage} onChange={(event) => {
              setYear(event.target.value); setSubjectId(''); setChapterId(''); setLessonId(''); setFilter('');
            }}>
              <option value="">اختر الفرقة أو الصف</option>
              {selectedStage?.options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <div className="qa-step"><span>3</span><strong>المادة</strong></div>
          <label className="qa-select-label">اختر المادة
            <select value={subjectId} disabled={!year} onChange={(event) => {
              setSubjectId(event.target.value); setChapterId(''); setLessonId(''); setFilter('');
            }}>
              <option value="">اختر المادة</option>
              {availableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
          {year && !availableSubjects.length && <p className="qa-muted">لا توجد مواد لهذه الفرقة أو الصف.</p>}
          <div className="qa-step"><span>4</span><strong>الشابتر</strong></div>
          <label className="qa-select-label">اختر الشابتر
            <select value={chapterId} disabled={!selectedSubject} onChange={(event) => {
              setChapterId(event.target.value); setLessonId(''); setFilter('');
            }}>
              <option value="">اختر الشابتر</option>
              {availableChapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name} ({chapter.lessonIds.length})</option>)}
            </select>
          </label>
          {selectedSubject && !availableChapters.length && <p className="qa-muted">لا توجد شابترات في هذه المادة.</p>}
          <div className="qa-step"><span>5</span><strong>الفيديو</strong></div>
          <label className="qa-select-label">ابحث عن فيديو
            <input value={filter} disabled={!selectedChapter} onChange={(event) => setFilter(event.target.value)} placeholder="اسم الفيديو" />
          </label>
          <div className="qa-lesson-list">
            {availableLessons.map((lesson) => {
              const quiz = quizByLessonId.get(lesson.id);
              return <button type="button" key={lesson.id} className={lessonId === lesson.id ? 'selected' : ''} onClick={() => setLessonId(lesson.id)}>
                <strong>{lesson.title}</strong><small>{quiz ? `${quiz.status === 'published' ? 'منشور' : quiz.status === 'paused' ? 'متوقف' : 'مسودة'} · ${quiz.question_count} سؤال · ${quiz.attempt_count} محاولة` : 'بدون اختبار'}</small>
              </button>;
            })}
            {selectedChapter && !availableLessons.length && <p className="qa-muted">لا توجد فيديوهات مطابقة في هذا الشابتر.</p>}
          </div>
        </aside>
        <div className="qa-editor">
          {!lessonId ? <div className="qa-empty">اختر المرحلة والمادة والشابتر ثم الفيديو لإنشاء اختباره.</div> : loading ? <div className="qa-empty">جاري تحميل الاختبار...</div> : <>
            <div className="qa-editor-head"><div><div className="qa-path">{selectedStage?.label} <span>›</span> {year} <span>›</span> {selectedSubject?.name} <span>›</span> {selectedChapter?.name}</div><h3>{selectedLesson?.title}</h3><p>{editingRevision ? 'نسخة معدلة' : selectedQuiz?.status === 'paused' ? 'متوقف' : selectedQuiz?.status === 'published' ? 'منشور' : selectedQuiz ? 'مسودة' : 'اختبار جديد'}</p></div></div>
            {!!stats && <div className="qa-stats"><div><strong>{stats.totalAttempts}</strong><span>إجمالي المحاولات</span></div><div><strong>{stats.completedStudents}</strong><span>طلاب أكملوا</span></div><div><strong>{stats.completionPercent == null ? '—' : `${stats.completionPercent}%`}</strong><span>الإكمال ممن بدأوا</span></div><div><strong>{stats.averagePercent == null ? '—' : `${stats.averagePercent}%`}</strong><span>متوسط النتيجة</span></div></div>}
            {!!stats && <details className="qa-report">
              <summary>تحليل الأسئلة وأداء الطلاب</summary>
              <div className="qa-report-toolbar"><span>{stats.inProgressStudents} لم يكملوا بعد</span><button type="button" onClick={exportResults} disabled={busy}>تصدير النتائج CSV</button></div>
              <h4>الأسئلة الأكثر خطأً{stats.totalAttempts > stats.analyzedAttempts ? ` (آخر ${stats.analyzedAttempts} محاولة)` : ''}</h4>
              {stats.questions.length ? stats.questions.map((item) => <p key={`${item.version}:${item.id}`}><span>نسخة {item.version} · {item.prompt}</span><strong>{item.errorPercent}% أخطأوا</strong></p>) : <p>لا توجد إجابات بعد.</p>}
              <h4>طلاب يحتاجون مراجعة (أقل من 60%)</h4>
              {stats.needsReview?.length ? stats.needsReview.map((item) => <p key={item.studentUid}><span>{item.studentName}</span><strong>{item.score}/{item.total}</strong></p>) : <p>لا يوجد حاليًا.</p>}
              <h4>آخر المحاولات</h4>
              {stats.attempts.map((item, index) => <p key={`${item.studentUid}:${index}`}><span>{item.studentName} · {item.mode === 'practice' ? 'تدريب' : 'امتحان'} · نسخة {item.version} · {new Date(item.submittedAt).toLocaleDateString('ar-EG')}</span><strong>{item.score}/{item.total}</strong></p>)}
            </details>}
            <label>عنوان الاختبار<input value={title} maxLength={140} disabled={locked || busy} onChange={(event) => setTitle(event.target.value)} /></label>
            <div className="qa-settings">
              <label>نوع الاختبار<select value={mode} disabled={locked || busy} onChange={(event) => setMode(event.target.value)}><option value="exam">امتحان: محاولة واحدة</option><option value="practice">تدريب: إعادة المحاولة متاحة</option></select></label>
              <label>أسئلة كل محاولة<select value={drawCount > questions.length ? 0 : drawCount} disabled={locked || busy} onChange={(event) => setDrawCount(Number(event.target.value))}><option value={0}>كل الأسئلة ({questions.length})</option>{Array.from({ length: Math.max(questions.length - 1, 0) }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} من {questions.length}</option>)}</select></label>
              <label className="qa-checkbox"><input type="checkbox" checked={shuffleOptions} disabled={locked || busy} onChange={(event) => setShuffleOptions(event.target.checked)} /> خلط ترتيب الاختيارات لكل طالب</label>
            </div>
            {questions.map((question, index) => <div className="qa-question" key={question.id || index}>
              <div className="qa-question-head"><strong>سؤال {index + 1}</strong>{!locked && questions.length > 1 && <button type="button" onClick={() => setQuestions((current) => current.filter((_, i) => i !== index))}>حذف</button>}</div>
              <textarea value={question.prompt} disabled={locked || busy} maxLength={1000} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} placeholder="نص السؤال" rows={2} />
              <div className="qa-options">{question.options.map((option, optionIndex) => <label key={optionIndex}><span>{optionIndex + 1}</span><input value={option} disabled={locked || busy} maxLength={400} onChange={(event) => updateOption(index, optionIndex, event.target.value)} placeholder={`الخيار ${optionIndex + 1}`} /></label>)}</div>
              <label>الإجابة الصحيحة<select value={question.answerIndex} disabled={locked || busy} onChange={(event) => updateQuestion(index, { answerIndex: Number(event.target.value) })}>{question.options.map((_, optionIndex) => <option key={optionIndex} value={optionIndex}>الخيار {optionIndex + 1}</option>)}</select></label>
              <label>توضيح بعد الحل (اختياري)<textarea value={question.explanation} disabled={locked || busy} maxLength={1000} onChange={(event) => updateQuestion(index, { explanation: event.target.value })} rows={2} /></label>
            </div>)}
            <div className="qa-actions">
              {!locked && <><button type="button" onClick={() => setQuestions((current) => [...current, emptyQuestion()])} disabled={busy || questions.length >= 100}>+ سؤال</button><button type="button" className="primary" onClick={save} disabled={busy}>حفظ المسودة</button>{selectedQuiz?.status === 'draft' && <button type="button" className="primary" onClick={publish} disabled={busy}>نشر</button>}{selectedQuiz?.hasRevisionDraft && <button type="button" className="primary" onClick={publish} disabled={busy}>نشر النسخة المعدلة</button>}</>}
              {selectedQuiz && selectedQuiz.status !== 'draft' && !editingRevision && <button type="button" onClick={() => setEditingRevision(true)} disabled={busy}>تعديل نسخة جديدة</button>}
              {selectedQuiz?.hasRevisionDraft && <button type="button" className="danger" onClick={() => { if (window.confirm('التخلي عن التعديلات غير المنشورة؟')) perform({ action: 'discardRevision', quizId: selectedQuiz.id }, 'تم تجاهل النسخة المعدلة.'); }} disabled={busy}>تجاهل التعديل</button>}
              {selectedQuiz?.status === 'published' && <button type="button" className="danger" onClick={() => { if (window.confirm('إيقاف الاختبار للطلاب الجدد؟ ستبقى النتائج القديمة.')) perform({ action: 'pause', quizId: selectedQuiz.id }, 'تم إيقاف الاختبار.'); }} disabled={busy}>إيقاف مؤقت</button>}
              {selectedQuiz?.status === 'paused' && <button type="button" className="primary" onClick={() => perform({ action: 'resume', quizId: selectedQuiz.id }, 'تم إعادة إتاحة الاختبار.')} disabled={busy}>إعادة الإتاحة</button>}
              {selectedQuiz && <button type="button" className="danger" onClick={remove} disabled={busy}>{selectedQuiz.status === 'draft' ? 'حذف المسودة' : 'حذف الاختبار'}</button>}
            </div>
          </>}
          {!!error && <p className="qa-message error" role="alert">{error}</p>}
          {!!notice && <p className="qa-message" role="status">{notice}</p>}
        </div>
      </div>
    </section>
  );
}

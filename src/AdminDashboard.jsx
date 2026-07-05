import React, { useState, useEffect } from 'react';
import { db } from './firebase'; 
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, getDocs, query, where, serverTimestamp, onSnapshot } from "firebase/firestore";
import Swal from 'sweetalert2'; 
import ThemeToggle from './ThemeToggle';
import { keepEnglishDigitsOnly } from './services/auth-service';

const AdminDashboard = ({ 
  activeTab, setActiveTab, studentsDB = [], lessons = [], codesDB = [], logsDB = [], supportRequests = [],
  setUser, newLesson, setNewLesson, subjects = [], theme, themeMode, toggleTheme
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState('الكل');
  const [codesYearFilter, setCodesYearFilter] = useState('الكل');
  const [codeQty, setCodeQty] = useState(1);
  const [isUploading, setIsUploading] = useState({ video: false, pdf: false });
  const [lessonTitle, setLessonTitle] = useState(newLesson?.title || "");
  const [newSubject, setNewSubject] = useState("");
  const [newSubjectImage, setNewSubjectImage] = useState("");
  const [playingVideoId, setPlayingVideoId] = useState(null);
  const [chapters, setChapters] = useState({});
  const [expandedSubject, setExpandedSubject] = useState(null);
  const [showAddChapterFor, setShowAddChapterFor] = useState(null);
  const [newChapter, setNewChapter] = useState({ name: "", notes: "", year: "الفرقة الأولى" });
  const [editingSubject, setEditingSubject] = useState(null);
  const [editingChapter, setEditingChapter] = useState(null);
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [showAddLessonForm, setShowAddLessonForm] = useState(false);
  const [selectedContentYear, setSelectedContentYear] = useState("الفرقة الأولى");
  const [isContentYearOpen, setIsContentYearOpen] = useState(false);
  const [selectedContentSubject, setSelectedContentSubject] = useState(null);
  const [selectedContentChapter, setSelectedContentChapter] = useState(null);
  const [courseYearFilter, setCourseYearFilter] = useState("الكل");
  const [lessonYearFilter, setLessonYearFilter] = useState("الكل");
  const [lessonSubjectFilterId, setLessonSubjectFilterId] = useState(null);
  const [studentYearFilter, setStudentYearFilter] = useState("الكل");
  const [chapterFilterId, setChapterFilterId] = useState(null);
  const [statsLesson, setStatsLesson] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [globalSearch, setGlobalSearch] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState("all");
  const [studentDeviceFilter, setStudentDeviceFilter] = useState("all");
  const [logTypeFilter, setLogTypeFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const [selectedCodeIds, setSelectedCodeIds] = useState([]);
  const [showCodes, setShowCodes] = useState(false);
  const [previewLesson, setPreviewLesson] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [showResolvedSupportRequests, setShowResolvedSupportRequests] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState([
    {
      role: "assistant",
      text: "أهلاً بك في مساعد الأدمن. اسألني عن إضافة محاضرة، الأكواد، الطلاب، الحظر، الرقابة، أو تنظيم المواد والشابترات.",
    },
  ]);

  const yearOptions = ["الفرقة الأولى", "الفرقة الثانية", "الفرقة الثالثة", "الفرقة الرابعة"];
  const yearFilters = ["الكل", ...yearOptions];
  const isLightTheme = theme?.mode === 'light';
  const visibleBorder = isLightTheme ? '#CBD5E1' : theme.borderSoft;
  const strongBorder = isLightTheme ? '#B6C2D2' : theme.borderSoft;

  useEffect(() => { setLessonTitle(newLesson?.title || ""); }, [newLesson?.title]);

  const BUNNY_CONFIG = {
    streamLibraryId: '675556',
    streamAccessKey:
      import.meta.env.VITE_BUNNY_STREAM_ACCESS_KEY ||
      import.meta.env.EXPO_PUBLIC_BUNNY_STREAM_ACCESS_KEY ||
      '34f7edd4-5965-4170-8d17af47509f-f96c-467a',
    streamBaseEndpoint: 'https://video.bunnycdn.com/library/675556/videos',
    streamEmbedBaseUrl: 'https://iframe.mediadelivery.net/embed/675556',
    streamPlaybackDomain: 'vz-5db52be9-935.b-cdn.net',
    streamTokenSecurityKey: 'afe36c3e-2b1b-426f-9cbb-2966bf0fbdb3',
    storageName: 'el-hadidy-files',
    storageAccessKey: 'a9869cf5-e131-4930-8b9e87e4901f-b514-4817',
    storageRegionEndpoint: 'uk.storage.bunnycdn.com',
    storagePullZoneUrl: 'https://elhadidy-streaming.b-cdn.net',
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "chapters"), (snapshot) => {
      const grouped = {};
      snapshot.docs.forEach((chapterDoc) => {
        const chapter = { id: chapterDoc.id, ...chapterDoc.data() };
        if (!grouped[chapter.subjectId]) grouped[chapter.subjectId] = [];
        grouped[chapter.subjectId].push(chapter);
      });
      Object.keys(grouped).forEach((subjectId) => {
        grouped[subjectId].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      });
      setChapters(grouped);
    });
    return unsubscribe;
  }, []);

  const confirmAction = async (title, text, actionCallback, isDanger = false) => {
    const result = await Swal.fire({
      title: title, text: text, icon: isDanger ? 'warning' : 'question', showCancelButton: true,
      confirmButtonColor: isDanger ? theme.danger : theme.accent, cancelButtonColor: theme.muted,
      confirmButtonText: 'نعم، متأكد', cancelButtonText: 'إلغاء', background: theme.surface, color: theme.text, customClass: { popup: 'gold-border' }
    });
    if (result.isConfirmed) actionCallback();
  };

  const getDeviceIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'windows': return <i className="fab fa-windows" style={{color: theme.info, fontSize:'16px'}} title="Windows"></i>;
      case 'android': return <i className="fab fa-android" style={{color: theme.success, fontSize:'16px'}} title="Android"></i>;
      case 'ios':
      case 'macos': return <i className="fab fa-apple" style={{color: theme.text, fontSize:'16px'}} title="Apple"></i>;
      default: return <i className="fas fa-laptop" style={{color: theme.muted, fontSize:'16px'}} title="Unknown"></i>;
    }
  };

  const handleAddSubject = async () => {
    if (!newSubject.trim()) return;
    try {
      await addDoc(collection(db, "subjects"), { name: newSubject.trim(), image: newSubjectImage.trim(), createdAt: new Date() });
      setNewSubject("");
      setNewSubjectImage("");
      Swal.fire({ icon: 'success', title: 'تمت إضافة المادة', background: theme.surface, color: theme.text, timer: 1500, showConfirmButton: false });
    } catch (e) { Swal.fire('خطأ في الإضافة'); }
  };

  const handleRenameSubject = async () => {
    if (!editingSubject?.name?.trim()) return;
    await updateDoc(doc(db, "subjects", editingSubject.id), {
      name: editingSubject.name.trim(),
      image: editingSubject.image?.trim() || "",
    });
    setEditingSubject(null);
  };

  const handleDeleteSubject = (subject) => {
    confirmAction('حذف الكورس؟', 'سيتم حذف الكورس وفصوله ومحاضراته المرتبطة به.', async () => {
      const batch = writeBatch(db);
      batch.delete(doc(db, "subjects", subject.id));
      (chapters[subject.id] || []).forEach((chapter) => batch.delete(doc(db, "chapters", chapter.id)));
      const lessonsSnapshot = await getDocs(query(collection(db, "lessons"), where("subjectId", "==", subject.id)));
      lessonsSnapshot.forEach((lessonDoc) => batch.delete(doc(db, "lessons", lessonDoc.id)));
      await batch.commit();
      Swal.fire({ icon: 'success', title: 'تم حذف الكورس', background: theme.surface, color: theme.text });
    }, true);
  };

  const handleAddChapter = async (subject) => {
    if (!newChapter.name.trim()) return Swal.fire({ icon: 'warning', title: 'اكتب اسم الفصل', background: theme.surface, color: theme.text });
    const subjectChapters = chapters[subject.id] || [];
    await addDoc(collection(db, "chapters"), {
      name: newChapter.name.trim(),
      notes: newChapter.notes.trim(),
      year: newChapter.year,
      subjectId: subject.id,
      subjectName: subject.name,
      order: subjectChapters.length,
      createdAt: serverTimestamp(),
    });
    setNewChapter({ name: "", notes: "", year: "الفرقة الأولى" });
    setShowAddChapterFor(null);
  };

  const handleRenameChapter = async () => {
    if (!editingChapter?.name?.trim()) return;
    await updateDoc(doc(db, "chapters", editingChapter.id), {
      name: editingChapter.name.trim(),
      notes: editingChapter.notes?.trim() || "",
      year: editingChapter.year || "الفرقة الأولى",
    });
    setEditingChapter(null);
  };

  const handleDeleteChapter = (chapter) => {
    confirmAction('حذف الفصل؟', 'سيتم حذف الفصل والمحاضرات المرتبطة به.', async () => {
      const batch = writeBatch(db);
      batch.delete(doc(db, "chapters", chapter.id));
      const lessonsSnapshot = await getDocs(query(collection(db, "lessons"), where("chapterId", "==", chapter.id)));
      lessonsSnapshot.forEach((lessonDoc) => batch.delete(doc(db, "lessons", lessonDoc.id)));
      await batch.commit();
    }, true);
  };

  const handleMoveChapter = async (subjectId, chapterId, direction) => {
    const subjectChapters = [...(chapters[subjectId] || [])];
    const index = subjectChapters.findIndex((chapter) => chapter.id === chapterId);
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= subjectChapters.length) return;
    const current = subjectChapters[index];
    const target = subjectChapters[nextIndex];
    await Promise.all([
      updateDoc(doc(db, "chapters", current.id), { order: target.order ?? nextIndex }),
      updateDoc(doc(db, "chapters", target.id), { order: current.order ?? index }),
    ]);
  };

  const handleLogout = () => {
    confirmAction('تسجيل الخروج', 'هل تريد الخروج من لوحة التحكم؟', () => {
      setUser(null); localStorage.removeItem('user');
    });
  };

  // --- دالة محاكاة إرسال الإشعارات (Push Notifications FCM) ---
  const sendPushNotification = async (title, body) => {
    if (window?.Notification && Notification.permission === 'granted') {
      new Notification(title, { body });
      return;
    }
    if (window?.Notification && Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission().catch(() => 'default');
      if (permission === 'granted') {
        new Notification(title, { body });
        return;
      }
    }
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'info',
      title,
      text: body,
      timer: 2600,
      showConfirmButton: false,
      background: theme.surface,
      color: theme.text,
    });
  };

  const buildRevokedStudentAccess = (student = {}, revokedYear = "", revokedCode = "") => {
    const nextAccessYears = Array.isArray(student.accessYears)
      ? student.accessYears.filter((year) => year !== revokedYear)
      : [];
    const nextUsedCodes = Array.isArray(student.usedCodes)
      ? student.usedCodes.filter((code) => code !== revokedCode)
      : [];
    const hasAccess = nextAccessYears.length > 0;

    return {
      isSubscribed: hasAccess,
      accessYears: nextAccessYears,
      usedCodes: nextUsedCodes,
      accessYear: hasAccess ? nextAccessYears[0] : "",
      codeYear: hasAccess ? nextAccessYears[0] : "",
      usedCode: nextUsedCodes[0] || "",
      codeReviewStatus: hasAccess ? "approved" : "",
    };
  };

  const isCodePaused = (code = {}) =>
    code.isActive === false || code.disabled === true || code.revoked === true || code.isStopped === true;

  const getCodeStatus = (code = {}) => {
    if (isCodePaused(code)) return "paused";
    if (code.isUsed) return "used";
    return "available";
  };

  const updateSingleCodePaused = async (code, shouldPause) => {
    await updateDoc(doc(db, "codes", code.id), {
      isActive: !shouldPause,
      pausedAt: shouldPause ? serverTimestamp() : null,
      pausedBy: shouldPause ? "admin" : "",
    });
    Swal.fire({ icon: 'success', title: shouldPause ? 'تم إيقاف الكود مؤقتاً' : 'تم تفعيل الكود', background: theme.surface, color: theme.text });
  };

  const handleDeleteSingleCode = async (codeId, usedById) => {
    confirmAction('حذف الكود؟', 'سيتم إلغاء تفعيل الطالب المرتبط بهذا الكود فوراً.', async () => {
      const batch = writeBatch(db);
      const codeData = codesDB.find((code) => code.id === codeId) || {};
      const linkedStudent = usedById ? studentsDB.find((student) => student.id === usedById) : null;
      batch.delete(doc(db, "codes", codeId));
      if (usedById) {
        batch.update(
          doc(db, "students", usedById),
          buildRevokedStudentAccess(linkedStudent || {}, codeData.year || "", codeData.code || "")
        );
      }
      await batch.commit();
      Swal.fire({ icon: 'success', title: 'تم الحذف والإلغاء', background: theme.surface, color: theme.text });
    }, true);
  };

  const deleteAllCodes = async () => {
    confirmAction('تطهير شامل للنظام؟', 'سيتم حذف كافة الأكواد نهائياً وإلغاء تفعيل اشتراك جميع الطلاب.', async () => {
        try {
          const batch = writeBatch(db);
          const codesSnapshot = await getDocs(collection(db, "codes"));
          codesSnapshot.forEach((d) => batch.delete(doc(db, "codes", d.id)));
          const studentsSnapshot = await getDocs(collection(db, "students"));
          studentsSnapshot.forEach((s) => {
            batch.update(doc(db, "students", s.id), {
              isSubscribed: false,
              usedCode: "",
              usedCodes: [],
              codeYear: "",
              accessYear: "",
              accessYears: [],
              codeReviewStatus: "",
            });
          });
          await batch.commit();
          Swal.fire({ icon: 'success', title: 'تم التطهير بنجاح!', background: theme.surface, color: theme.text });
        } catch (e) { Swal.fire({ icon: 'error', title: 'فشلت العملية', background: theme.surface, color: theme.text }); }
      }, true);
  };

  const toggleLessonVisibility = async (lessonId, currentStatus) => {
    try { await updateDoc(doc(db, "lessons", lessonId), { isActive: !currentStatus }); } catch (e) { Swal.fire('خطأ في التعديل'); }
  };

  const sanitizeBunnyTitle = (fileName = 'video') => {
    const withoutExtension = fileName.replace(/\.[^/.]+$/, '');
    return withoutExtension
      .replace(/[^\p{L}\p{N}\s._-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || `video-${Date.now()}`;
  };

  const getBunnyErrorMessage = async (response, fallback) => {
    const rawText = await response.text().catch(() => "");
    if (!rawText) return fallback;
    try {
      const parsed = JSON.parse(rawText);
      return parsed?.message || parsed?.Message || parsed?.error || fallback;
    } catch {
      return rawText.slice(0, 180) || fallback;
    }
  };

  const uploadVideoToBunnyStream = async (file) => {
    if (!file?.type?.startsWith('video/')) {
      throw new Error('اختر ملف فيديو صالح.');
    }

    if (!BUNNY_CONFIG.streamAccessKey) {
      throw new Error('مفتاح Bunny Stream غير موجود.');
    }

    const title = sanitizeBunnyTitle(file.name);

    const createResponse = await fetch(BUNNY_CONFIG.streamBaseEndpoint, {
      method: 'POST',
      headers: {
        AccessKey: BUNNY_CONFIG.streamAccessKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    });

    if (!createResponse.ok) {
      throw new Error(await getBunnyErrorMessage(createResponse, 'فشل إنشاء الفيديو على Bunny Stream.'));
    }

    const createdVideo = await createResponse.json();
    const videoId = createdVideo?.guid;
    if (!videoId) throw new Error('Bunny لم يرجع Video ID.');

    const uploadResponse = await fetch(`${BUNNY_CONFIG.streamBaseEndpoint}/${videoId}`, {
      method: 'PUT',
      headers: {
        AccessKey: BUNNY_CONFIG.streamAccessKey,
        'Content-Type': 'application/octet-stream',
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(await getBunnyErrorMessage(uploadResponse, 'فشل رفع ملف الفيديو إلى Bunny Stream.'));
    }

    return {
      videoId,
      title,
      embedUrl: `${BUNNY_CONFIG.streamEmbedBaseUrl}/${videoId}`,
    };
  };

  const uploadFileToBunny = async (file, type) => {
    if (!file) return;
    setIsUploading(prev => ({ ...prev, [type]: true }));

    try {
      if (type === 'video') {
        const uploadedVideo = await uploadVideoToBunnyStream(file);
        setNewLesson(prev => ({ ...prev, url: uploadedVideo.embedUrl, videoKind: 'bunny' }));
      } else {
        const folder = 'lectures_pdf';
        const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const fileUrl = `${BUNNY_CONFIG.storagePullZoneUrl}/${folder}/${fileName}`;
        const uploadResponse = await fetch(`https://${BUNNY_CONFIG.storageRegionEndpoint}/${BUNNY_CONFIG.storageName}/${folder}/${fileName}`, {
          method: 'PUT',
          headers: { 'AccessKey': BUNNY_CONFIG.storageAccessKey, 'Content-Type': 'application/octet-stream' },
          body: file,
        });
        if (!uploadResponse.ok) throw new Error('فشل رفع ملف PDF إلى Bunny Storage.');
        setNewLesson(prev => ({ ...prev, pdfUrl: fileUrl }));
      }
      Swal.fire({ icon: 'success', title: 'تم الرفع بنجاح', background: theme.surface, color: theme.text, timer: 1500, showConfirmButton: false });
    } catch (e) { Swal.fire({ icon: 'error', title: 'فشل الرفع', text: e.message || 'حاول مرة أخرى.', background: theme.surface, color: theme.text });
    } finally { setIsUploading(prev => ({ ...prev, [type]: false })); }
  };

  const isBunnyEmbedUrl = (url = '') => /(?:iframe|player)\.mediadelivery\.net\/embed\//i.test(String(url || ''));

  const resetLessonForm = () => {
    setNewLesson({
      title: "",
      description: "",
      url: "",
      pdfUrl: "",
      subject: "",
      subjectId: "",
      chapterId: "",
      chapterName: "",
      year: "الفرقة الأولى",
      semester: "الأول",
      videoKind: "bunny",
      isActive: true,
    });
    setLessonTitle("");
    setEditingLessonId(null);
    setShowAddLessonForm(false);
  };

  const selectLessonSubject = (subject) => {
    setNewLesson((prev) => ({
      ...prev,
      subject: subject.name,
      subjectId: subject.id,
      chapterId: "",
      chapterName: "",
    }));
  };

  const saveLesson = () => {
    const selectedSubject = subjects.find((subject) => subject.id === newLesson?.subjectId || subject.name === newLesson?.subject);
    const selectedChapter = (chapters[selectedSubject?.id] || []).find((chapter) => chapter.id === newLesson?.chapterId);
    const payload = {
      ...newLesson,
      title: (newLesson?.title || lessonTitle || "").trim(),
      description: newLesson?.description || "",
      subject: selectedSubject?.name || newLesson?.subject || "",
      subjectId: selectedSubject?.id || newLesson?.subjectId || "",
      chapterId: selectedChapter?.id || newLesson?.chapterId || "",
      chapterName: selectedChapter?.name || newLesson?.chapterName || "",
      videoKind: 'bunny',
      isActive: newLesson?.isActive !== false,
    };

    if (!payload.title || !payload.url || !payload.subject || !payload.year || !payload.semester) {
      return Swal.fire({ icon: "warning", title: "أكمل بيانات المحاضرة", background: theme.surface, color: theme.text });
    }
    confirmAction(editingLessonId ? 'تعديل المحاضرة؟' : 'نشر المحاضرة؟', 'سيتم حفظ التغييرات أو نشر المحتوى الآن.', async () => {
      if (editingLessonId) {
        await updateDoc(doc(db, "lessons", editingLessonId), { ...payload, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, "lessons"), { ...payload, views: 0, createdAt: serverTimestamp() });
        await sendPushNotification("محاضرة جديدة", `تم رفع محاضرة: ${payload.title}`);
      }
      resetLessonForm();
      Swal.fire({ icon: "success", title: editingLessonId ? "تم تعديل المحاضرة" : "تم نشر المحاضرة", background: theme.surface, color: theme.text });
    });
  };

  const handleEditLesson = (lesson) => {
    setEditingLessonId(lesson.id);
    setLessonTitle(lesson.title || "");
    setNewLesson({
      title: lesson.title || "",
      description: lesson.description || "",
      url: lesson.url || "",
      pdfUrl: lesson.pdfUrl || "",
      subject: lesson.subject || "",
      subjectId: lesson.subjectId || "",
      chapterId: lesson.chapterId || "",
      chapterName: lesson.chapterName || "",
      year: lesson.year || "الفرقة الأولى",
      semester: lesson.semester || "الأول",
      videoKind: lesson.videoKind || 'bunny',
      isActive: lesson.isActive !== false,
    });
    setShowAddLessonForm(true);
    setActiveTab("content");
    if (lesson.year) {
      setSelectedContentYear(lesson.year);
      setLessonYearFilter(lesson.year);
    }
    const lessonSubject = subjects.find((subject) => subject.id === lesson.subjectId || subject.name === lesson.subject);
    if (lessonSubject) setSelectedContentSubject(lessonSubject);
    setSelectedContentChapter(lesson.chapterId ? { id: lesson.chapterId, name: lesson.chapterName, year: lesson.year } : null);
    setIsContentYearOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openYearContent = (year) => {
    setSelectedContentYear(year);
    setCourseYearFilter(year);
    setLessonYearFilter(year);
    setLessonSubjectFilterId(null);
    setChapterFilterId(null);
    setSelectedContentSubject(null);
    setSelectedContentChapter(null);
    setShowAddLessonForm(false);
    setIsContentYearOpen(true);
  };

  const openSubjectContent = (subject) => {
    setSelectedContentSubject(subject);
    setSelectedContentChapter(null);
    setShowAddChapterFor(null);
    setEditingChapter(null);
    setShowAddLessonForm(false);
    setLessonSubjectFilterId(subject.id);
    setLessonYearFilter(selectedContentYear);
    setChapterFilterId(null);
  };

  const openChapterContent = (chapter) => {
    setSelectedContentChapter(chapter);
    setShowAddLessonForm(false);
    setEditingChapter(null);
    setChapterFilterId(chapter?.id || null);
  };

  const backToContentYears = () => {
    setIsContentYearOpen(false);
    setSelectedContentSubject(null);
    setSelectedContentChapter(null);
    setShowAddChapterFor(null);
    setShowAddLessonForm(false);
  };

  const backToContentSubjects = () => {
    setSelectedContentSubject(null);
    setSelectedContentChapter(null);
    setShowAddChapterFor(null);
    setShowAddLessonForm(false);
  };

  const backToContentChapters = () => {
    setSelectedContentChapter(null);
    setShowAddLessonForm(false);
    setEditingChapter(null);
  };

  const closeSubjectContent = () => {
    setIsContentYearOpen(false);
    setSelectedContentSubject(null);
    setSelectedContentChapter(null);
    setShowAddChapterFor(null);
    setEditingChapter(null);
    setShowAddLessonForm(false);
    setEditingLessonId(null);
  };

  const prepareLessonForChapter = (subject, chapter = null) => {
    setEditingLessonId(null);
    setLessonTitle("");
    setNewLesson({
      title: "",
      description: "",
      url: "",
      pdfUrl: "",
      subject: subject.name,
      subjectId: subject.id,
      chapterId: chapter?.id || "",
      chapterName: chapter?.name || "",
      year: chapter?.year || selectedContentYear,
      semester: newLesson?.semester || "الأول",
      videoKind: "bunny",
      isActive: true,
    });
    if (chapter) setSelectedContentChapter(chapter);
    setShowAddLessonForm(true);
  };

  const handleToggleChapterFilter = (lesson) => {
    if (!lesson.chapterId) return Swal.fire({ icon: "info", title: "المحاضرة غير مرتبطة بفصل", background: theme.surface, color: theme.text });
    setLessonSubjectFilterId(lesson.subjectId || null);
    if (lesson.year) setLessonYearFilter(lesson.year);
    setChapterFilterId((current) => (current === lesson.chapterId ? null : lesson.chapterId));
  };

  const handleLessonYearFilter = (year) => {
    setLessonYearFilter(year);
    setLessonSubjectFilterId(null);
    setChapterFilterId(null);
  };

  const handleLessonSubjectFilter = (subjectId) => {
    setLessonSubjectFilterId((current) => {
      const nextSubjectId = current === subjectId ? null : subjectId;
      setChapterFilterId(null);
      return nextSubjectId;
    });
  };

  const handleLessonChapterFilter = (chapterId) => {
    setChapterFilterId((current) => (current === chapterId ? null : chapterId));
  };

  const generateCodes = () => {
    if (selectedYear === 'الكل') return Swal.fire({ background: theme.surface, color: theme.text, icon:'warning', title:'اختر فرقة أولاً'});
    const quantity = Math.min(500, Math.max(1, Number(keepEnglishDigitsOnly(codeQty)) || 1));
    confirmAction(`توليد ${quantity} كود؟`, `لـ ${selectedYear}`, async () => {
      const batch = writeBatch(db);
      const generatedCodes = [];
      for (let i = 0; i < quantity; i++) {
        const codeStr = `${Math.floor(10000000 + Math.random() * 90000000)}`;
        generatedCodes.push({ code: codeStr, year: selectedYear });
        batch.set(doc(collection(db, "codes")), { code: codeStr, year: selectedYear, isUsed: false, usedByName: "", usedById: "", createdAt: new Date() });
      }
      await batch.commit();
      Swal.fire({ background: theme.surface, color: theme.text, icon: 'success', title: 'تم التوليد!' });
      await exportCodeSheetToPdf(generatedCodes, selectedYear);
    });
  };

  const exportToPdf = (data, fileName, columns) => {
    if (!data || data.length === 0) return Swal.fire("تنبيه", "لا توجد بيانات", "info");

    const escapeHtml = (value) => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    const rows = data.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        ${columns.map((column) => `<td>${escapeHtml(column.value(item))}</td>`).join("")}
      </tr>
    `).join("");

    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      return Swal.fire({ icon: "warning", title: "اسمح بفتح النوافذ المنبثقة لتصدير PDF", background: theme.surface, color: theme.text });
    }

    printWindow.document.write(`
      <!doctype html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(fileName)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, Tahoma, sans-serif; direction: rtl; color: #151515; margin: 24px; }
            h1 { margin: 0 0 8px; color: #6E473B; font-size: 24px; }
            .meta { color: #666; margin-bottom: 18px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d7d7d7; padding: 8px; text-align: right; vertical-align: top; }
            th { background: #F5F0E8; color: #291C0E; }
            tr:nth-child(even) td { background: #fafafa; }
            @media print {
              body { margin: 12mm; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(fileName)}</h1>
          <div class="meta">تاريخ التصدير: ${new Date().toLocaleString("ar-EG")} - عدد السجلات: ${data.length}</div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                ${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <script>
            window.onload = () => {
              window.focus();
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const exportCodeSheetToPdf = async (codes = [], titleYear = "") => {
    if (!codes || codes.length === 0) return Swal.fire("تنبيه", "لا توجد أكواد للتصدير", "info");

    const escapeHtml = (value) => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    const normalizedCodes = codes
      .map((item) => String(item?.code || item || "").trim())
      .filter(Boolean);
    if (normalizedCodes.length === 0) {
      return Swal.fire("تنبيه", "لا توجد أكواد صالحة للتصدير", "info");
    }
    const rows = [];
    for (let index = 0; index < normalizedCodes.length; index += 3) {
      rows.push(normalizedCodes.slice(index, index + 3));
    }

    const sheetTitle = titleYear && titleYear !== "الكل"
      ? `د. الحديدي  ${titleYear}`
      : "د. الحديدي  أكواد التفعيل";

    const fileName = `${sheetTitle.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim()}.pdf`;
    const wrapper = document.createElement("div");
    wrapper.dir = "rtl";
    wrapper.innerHTML = `
      <div class="codes-pdf-page">
        <table>
          <thead>
            <tr><th colspan="3">${escapeHtml(sheetTitle)}</th></tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                ${[0, 1, 2].map((cellIndex) => `<td class="${row[cellIndex] ? "" : "empty-cell"}">${escapeHtml(row[cellIndex] || "0")}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    Object.assign(wrapper.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "794px",
      background: "#ffffff",
      color: "#000000",
      zIndex: "2147483647",
      pointerEvents: "none",
    });
    const style = document.createElement("style");
    style.textContent = `
      .codes-pdf-page {
        width: 794px;
        min-height: 1123px;
        background: #ffffff;
        color: #000000;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 46px;
        font-family: Arial, Tahoma, sans-serif;
        box-sizing: border-box;
      }
      .codes-pdf-page table {
        width: 640px;
        border-collapse: collapse;
        table-layout: fixed;
        border: 2px solid #111;
      }
      .codes-pdf-page th {
        border: 1.6px solid #111;
        height: 39px;
        font-size: 23px;
        font-weight: 500;
        text-align: center;
        line-height: 1.2;
        padding: 4px 8px;
      }
      .codes-pdf-page td {
        border: 1.4px solid #111;
        height: 34px;
        text-align: center;
        vertical-align: middle;
        font-size: 28px;
        line-height: 1;
        font-weight: 900;
        letter-spacing: 0.2px;
        direction: ltr;
        padding: 2px 8px;
      }
      .codes-pdf-page .empty-cell { color: transparent; }
    `;

    try {
      document.body.appendChild(style);
      document.body.appendChild(wrapper);
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const pdfPage = wrapper.querySelector(".codes-pdf-page");
      if (!pdfPage) throw new Error("تعذر تجهيز صفحة الأكواد للتصدير");

      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: 0,
          filename: fileName,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            scrollX: 0,
            scrollY: 0,
            logging: false,
          },
          jsPDF: { unit: "px", format: [794, 1123], orientation: "portrait" },
        })
        .from(pdfPage)
        .save();
      Swal.fire({ icon: "success", title: "تم تحميل ملف PDF", text: fileName, background: theme.surface, color: theme.text });
    } catch (error) {
      Swal.fire({ icon: "error", title: "تعذر تحميل PDF", text: "حاول مرة أخرى أو استخدم متصفح حديث.", background: theme.surface, color: theme.text });
    } finally {
      wrapper.remove();
      style.remove();
    }
  };

  const exportCodesToPdf = () => {
    const codesForPdf = (codesDB || []).filter((code) => {
      const matchesYear = codesYearFilter === "الكل" || code.year === codesYearFilter;
      const codeStatus = getCodeStatus(code);
      const matchesStatus = statusFilter === "all" || statusFilter === codeStatus;
      return matchesYear && matchesStatus;
    });
    exportCodeSheetToPdf(codesForPdf, codesYearFilter);
  };

  const copyText = async (text, successTitle = "تم النسخ") => {
    try {
      await navigator.clipboard.writeText(text);
      Swal.fire({ icon: 'success', title: successTitle, timer: 1000, showConfirmButton: false, background: theme.surface, color: theme.text });
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'تعذر النسخ', text: 'انسخ النص يدوياً من البطاقة.', background: theme.surface, color: theme.text });
    }
  };

  const toggleCodeSelection = (codeId) => {
    setSelectedCodeIds((current) => current.includes(codeId) ? current.filter((id) => id !== codeId) : [...current, codeId]);
  };

  const clearSelectedCodes = () => setSelectedCodeIds([]);

  const exportSelectedCodesToPdf = () => {
    const selectedCodes = codesDB.filter((code) => selectedCodeIds.includes(code.id));
    const selectedYears = Array.from(new Set(selectedCodes.map((code) => code.year).filter(Boolean)));
    exportCodeSheetToPdf(selectedCodes, selectedYears.length === 1 ? selectedYears[0] : "الأكواد المحددة");
  };

  const updateSelectedCodesPaused = (shouldPause) => {
    const selectedCodes = codesDB.filter((code) => selectedCodeIds.includes(code.id));
    if (!selectedCodes.length) return;

    confirmAction(
      shouldPause ? `إيقاف ${selectedCodes.length} كود مؤقتاً؟` : `تفعيل ${selectedCodes.length} كود؟`,
      shouldPause ? 'الأكواد الموقوفة لن تفتح المحتوى للطلاب حتى يتم تفعيلها مرة أخرى.' : 'سيتم السماح باستخدام الأكواد مرة أخرى.',
      async () => {
        const batch = writeBatch(db);
        selectedCodes.forEach((code) => {
          batch.update(doc(db, "codes", code.id), {
            isActive: !shouldPause,
            pausedAt: shouldPause ? serverTimestamp() : null,
            pausedBy: shouldPause ? "admin" : "",
          });
        });
        await batch.commit();
        clearSelectedCodes();
        Swal.fire({ icon: 'success', title: shouldPause ? 'تم إيقاف الأكواد المحددة' : 'تم تفعيل الأكواد المحددة', background: theme.surface, color: theme.text });
      },
      shouldPause
    );
  };

  const deleteSelectedCodes = () => {
    const selectedCodes = codesDB.filter((code) => selectedCodeIds.includes(code.id));
    if (!selectedCodes.length) return;
    confirmAction(`حذف ${selectedCodes.length} كود؟`, 'سيتم حذف الأكواد المحددة فقط وتصفير اشتراك الطلاب المرتبطين بها إن وجدوا.', async () => {
      const batch = writeBatch(db);
      selectedCodes.forEach((code) => {
        batch.delete(doc(db, "codes", code.id));
        if (code.usedById) {
          const linkedStudent = studentsDB.find((student) => student.id === code.usedById);
          batch.update(
            doc(db, "students", code.usedById),
            buildRevokedStudentAccess(linkedStudent || {}, code.year || "", code.code || "")
          );
        }
      });
      await batch.commit();
      clearSelectedCodes();
      Swal.fire({ icon: 'success', title: 'تم حذف الأكواد المحددة', background: theme.surface, color: theme.text });
    }, true);
  };

  const openLessonPreview = () => {
    const selectedSubject = subjects.find((subject) => subject.id === newLesson?.subjectId || subject.name === newLesson?.subject);
    const selectedChapter = (chapters[selectedSubject?.id] || []).find((chapter) => chapter.id === newLesson?.chapterId);
    setPreviewLesson({
      title: (newLesson?.title || lessonTitle || "محاضرة بدون عنوان").trim(),
      description: newLesson?.description || "",
      subject: selectedSubject?.name || newLesson?.subject || "بدون مادة",
      chapterName: selectedChapter?.name || newLesson?.chapterName || "بدون شابتر",
      year: newLesson?.year || "بدون فرقة",
      semester: newLesson?.semester || "بدون ترم",
      url: newLesson?.url || "",
      pdfUrl: newLesson?.pdfUrl || "",
      isActive: newLesson?.isActive !== false,
    });
  };
  const resolvedSupportRequests = supportRequests.filter((request) => request.status === 'resolved');
  const openSupportRequests = supportRequests.filter((request) => request.status !== 'resolved');
  const pendingSupportRequests = openSupportRequests.filter((request) => (request.status || 'pending') === 'pending');
  const securityAlerts = logsDB.filter((log) => log.alertType === 'security' || log.action?.includes('حظر') || log.action?.includes('تصفير'));
  const lessonSubjectsForYear = subjects.filter((subject) => {
    const subjectChapters = chapters[subject.id] || [];
    const hasChapterInYear = lessonYearFilter === "الكل" || subjectChapters.some((chapter) => chapter.year === lessonYearFilter);
    const hasLessonInYear = lessons?.some((lesson) => {
      const matchesSubject = lesson.subjectId === subject.id || lesson.subject === subject.name;
      const matchesYear = lessonYearFilter === "الكل" || lesson.year === lessonYearFilter;
      return matchesSubject && matchesYear;
    });
    return hasChapterInYear || hasLessonInYear;
  });
  const selectedLessonSubject = subjects.find((subject) => subject.id === lessonSubjectFilterId);
  const lessonChaptersForSubject = lessonSubjectFilterId
    ? (chapters[lessonSubjectFilterId] || []).filter((chapter) => lessonYearFilter === "الكل" || chapter.year === lessonYearFilter)
    : [];
  const filteredLessons = lessons?.filter((lesson) => {
    const matchesYear = lessonYearFilter === "الكل" || lesson.year === lessonYearFilter;
    const matchesSubject = !lessonSubjectFilterId || lesson.subjectId === lessonSubjectFilterId || lesson.subject === selectedLessonSubject?.name;
    const matchesChapter = !chapterFilterId || lesson.chapterId === chapterFilterId;
    return matchesYear && matchesSubject && matchesChapter;
  }) || [];
  const visibleCodes = codesDB?.filter((code) => {
    const matchesYear = codesYearFilter === "الكل" || code.year === codesYearFilter;
    const codeStatus = getCodeStatus(code);
    const matchesStatus = statusFilter === "all" || statusFilter === codeStatus;
    return matchesYear && matchesStatus;
  }) || [];
  const selectedVisibleCodesCount = visibleCodes.filter((code) => selectedCodeIds.includes(code.id)).length;
  const deviceFilters = ["all", ...new Set(studentsDB.map((student) => student.deviceType).filter(Boolean))];
  const visibleStudents = studentsDB?.filter((student) => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch = !term || student.name?.toLowerCase().includes(term) || student.username?.toLowerCase().includes(term) || student.phone?.includes(searchTerm.trim());
    const matchesYear = studentYearFilter === "الكل" || student.year === studentYearFilter || student.codeYear === studentYearFilter;
    const matchesStatus =
      studentStatusFilter === "all" ||
      (studentStatusFilter === "subscribed" && student.isSubscribed && !student.isBanned) ||
      (studentStatusFilter === "unsubscribed" && !student.isSubscribed && !student.isBanned) ||
      (studentStatusFilter === "banned" && student.isBanned);
    const matchesDevice = studentDeviceFilter === "all" || student.deviceType === studentDeviceFilter;
    return matchesSearch && matchesYear && matchesStatus && matchesDevice;
  }) || [];
  const visibleLogs = logsDB?.filter((log) => {
    const term = logSearch.trim().toLowerCase();
    const action = String(log.action || "").toLowerCase();
    const studentName = String(log.studentName || "").toLowerCase();
    const matchesSearch = !term || action.includes(term) || studentName.includes(term);
    const matchesType =
      logTypeFilter === "all" ||
      (logTypeFilter === "security" && (log.alertType === "security" || action.includes("حظر") || action.includes("تصوير"))) ||
      (logTypeFilter === "code" && (log.alertType === "code_activation" || log.alertType === "code_review" || action.includes("كود"))) ||
      (logTypeFilter === "device" && (action.includes("جهاز") || action.includes("تصفير")));
    return matchesSearch && matchesType;
  }) || [];
  const selectedStudentProfile = studentsDB.find((student) => student.id === selectedStudentId) || null;
  const selectedStudentCode = selectedStudentProfile
    ? codesDB.find((code) => code.usedById === selectedStudentProfile.id || code.code === selectedStudentProfile.usedCode)
    : null;
  const selectedStudentLogs = selectedStudentProfile
    ? logsDB.filter((log) => log.studentId === selectedStudentProfile.id || log.studentName === selectedStudentProfile.name).slice(0, 6)
    : [];
  const selectedStudentLessons = selectedStudentProfile
    ? lessons.filter((lesson) => {
      const studentYear = selectedStudentProfile.accessYear || selectedStudentProfile.codeYear || selectedStudentProfile.year;
      return lesson.isActive !== false && (!studentYear || lesson.year === studentYear);
    })
    : [];
  const openContentManager = () => {
    setActiveTab("content");
  };
  const openLessonComposer = () => {
    setActiveTab("content");
    setShowAddLessonForm(true);
  };
  const globalSearchTerm = globalSearch.trim().toLowerCase();
  const globalResults = globalSearchTerm ? [
    ...studentsDB.filter((student) => [student.name, student.username, student.phone].some((value) => String(value || "").toLowerCase().includes(globalSearchTerm))).slice(0, 4).map((student) => ({
      id: `student-${student.id}`,
      type: "طالب",
      icon: "fa-user",
      title: student.name || student.username,
      subtitle: student.phone || student.year || "طالب",
      action: () => { setActiveTab("students"); setSearchTerm(student.name || student.username || ""); setGlobalSearch(""); },
    })),
    ...lessons.filter((lesson) => [lesson.title, lesson.subject, lesson.chapterName].some((value) => String(value || "").toLowerCase().includes(globalSearchTerm))).slice(0, 4).map((lesson) => ({
      id: `lesson-${lesson.id}`,
      type: "محاضرة",
      icon: "fa-play-circle",
      title: lesson.title,
      subtitle: [lesson.subject, lesson.chapterName, lesson.year].filter(Boolean).join(" • "),
      action: () => { setActiveTab("content"); setLessonYearFilter(lesson.year || "الكل"); setLessonSubjectFilterId(lesson.subjectId || null); setChapterFilterId(lesson.chapterId || null); setGlobalSearch(""); },
    })),
    ...codesDB.filter((code) => String(code.code || "").toLowerCase().includes(globalSearchTerm)).slice(0, 4).map((code) => ({
      id: `code-${code.id}`,
      type: "كود",
      icon: "fa-ticket-alt",
      title: code.code,
      subtitle: `${code.year || "بدون فرقة"} • ${code.isUsed ? "مستخدم" : "متاح"}`,
      action: () => { setActiveTab("codes"); setCodesYearFilter(code.year || "الكل"); setStatusFilter(code.isUsed ? "used" : "available"); setGlobalSearch(""); },
    })),
    ...subjects.filter((subject) => String(subject.name || "").toLowerCase().includes(globalSearchTerm)).slice(0, 4).map((subject) => ({
      id: `subject-${subject.id}`,
      type: "مادة",
      icon: "fa-book-open",
      title: subject.name,
      subtitle: `${(chapters[subject.id] || []).length} شابتر`,
      action: () => { setActiveTab("content"); setExpandedSubject(subject.id); setGlobalSearch(""); },
    })),
  ].slice(0, 8) : [];

  const openSupportRequestStudent = (request) => {
    setSelectedStudentId(request.studentId || null);
    setSearchTerm(request.studentName || request.username || "");
    setActiveTab("students");
  };

  const updateSupportRequestStatus = async (request, status) => {
    await updateDoc(doc(db, "supportRequests", request.id), {
      status,
      reviewedAt: serverTimestamp(),
      reviewedBy: "admin",
    });
    Swal.fire({ icon: 'success', title: 'تم تحديث حالة الطلب', background: theme.surface, color: theme.text });
  };

  const navItems = [
    { id: 'stats', icon: 'fa-chart-pie', label: 'الرئيسية' },
    { id: 'content', icon: 'fa-layer-group', label: 'المحتوى' },
    { id: 'students', icon: 'fa-users', label: 'الطلاب' },
    { id: 'codes', icon: 'fa-ticket-alt', label: 'الأكواد' },
    { id: 'support_requests', icon: 'fa-headset', label: 'طلبات الدعم', badge: pendingSupportRequests.length },
    { id: 'logs', icon: 'fa-shield-alt', label: 'الرقابة' },
  ];
  const sectionTitles = {
    stats: { title: 'لوحة التحكم', subtitle: 'نظرة سريعة على المنصة والأنشطة' },
    content: { title: 'إدارة المحتوى', subtitle: 'المواد والشابترات والمحاضرات في صفحة واحدة للمدرس' },
    courses: { title: 'إدارة المحتوى', subtitle: 'المواد والشابترات والمحاضرات في صفحة واحدة للمدرس' },
    lessons: { title: 'إدارة المحتوى', subtitle: 'المواد والشابترات والمحاضرات في صفحة واحدة للمدرس' },
    add_lesson: { title: 'إضافة محاضرة', subtitle: 'رفع محتوى جديد مباشرة إلى المنصة' },
    students: { title: 'الطلاب', subtitle: 'بحث، مراجعة، وحظر أو تفعيل الحسابات' },
    codes: { title: 'الأكواد', subtitle: 'توليد الأكواد وتصديرها ومراجعة الاستخدام' },
    support_requests: { title: 'طلبات الدعم', subtitle: 'طلبات تصفير الجهاز ومشاكل المحتوى والحساب القادمة من التطبيق' },
    logs: { title: 'الرقابة', subtitle: 'سجل الحماية والتنبيهات الأمنية' },
  };
  const currentSection = sectionTitles[activeTab] || sectionTitles.stats;
  const topPills = [
    { label: 'طلاب', value: studentsDB.length },
    { label: 'محاضرات', value: lessons.length },
    { label: 'دعم', value: pendingSupportRequests.length },
    { label: 'رقابة', value: securityAlerts.length },
  ];
  const recentStudents = [...studentsDB].slice(0, 4);
  const recentAlerts = [...securityAlerts].slice(0, 4);
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toDateString();
    const studentsCount = studentsDB.filter((student) => student.createdAt?.toDate?.().toDateString() === key).length;
    const lessonsCount = lessons.filter((lesson) => {
      const createdAt = lesson.createdAt?.toDate?.() || (lesson.createdAt ? new Date(lesson.createdAt) : null);
      return createdAt && createdAt.toDateString() === key;
    }).length;
    return {
      key,
      label: date.toLocaleDateString('ar-EG', { weekday: 'short' }),
      studentsCount,
      lessonsCount,
      total: studentsCount + lessonsCount,
    };
  });
  const maxDailyActivity = Math.max(1, ...lastSevenDays.map((day) => day.total));
  const mostActiveYear = yearOptions
    .map((year) => ({ year, count: studentsDB.filter((student) => student.year === year || student.codeYear === year).length }))
    .sort((a, b) => b.count - a.count)[0];
  const lessonsWithoutChapter = lessons.filter((lesson) => !lesson.chapterId && !lesson.chapterName).length;
  const selectedFormSubject = subjects.find((subject) => subject.id === newLesson?.subjectId || subject.name === newLesson?.subject);
  const selectedFormChapters = selectedFormSubject ? (chapters[selectedFormSubject.id] || []).filter((chapter) => !newLesson?.year || chapter.year === newLesson.year) : [];
  const subjectsForSelectedContentYear = subjects.filter((subject) => {
    const subjectChapters = chapters[subject.id] || [];
    const subjectLessons = lessons.filter((lesson) => lesson.subjectId === subject.id || lesson.subject === subject.name);
    const hasContentInSelectedYear =
      subjectChapters.some((chapter) => chapter.year === selectedContentYear) ||
      subjectLessons.some((lesson) => lesson.year === selectedContentYear);
    const hasAnyContent = subjectChapters.length > 0 || subjectLessons.length > 0;

    return hasContentInSelectedYear || !hasAnyContent;
  });
  const selectedContentSubjectChapters = selectedContentSubject
    ? (chapters[selectedContentSubject.id] || [])
      .filter((chapter) => chapter.year === selectedContentYear)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    : [];
  const selectedContentSubjectLessons = selectedContentSubject
    ? lessons.filter((lesson) => {
      const matchesSubject = lesson.subjectId === selectedContentSubject.id || lesson.subject === selectedContentSubject.name;
      return matchesSubject && lesson.year === selectedContentYear;
    })
    : [];
  const selectedContentLegacyLessons = selectedContentSubjectLessons.filter((lesson) => !lesson.chapterId && !lesson.chapterName);
  const legacyContentChapter = selectedContentLegacyLessons.length
    ? {
      id: "__legacy_content__",
      name: "محاضرات قديمة / بدون شابتر",
      year: selectedContentYear,
      isLegacy: true,
    }
    : null;
  const visibleContentChapters = legacyContentChapter
    ? [...selectedContentSubjectChapters, legacyContentChapter]
    : selectedContentSubjectChapters;
  const selectedContentChapterLessons = selectedContentChapter
    ? selectedContentChapter?.isLegacy
      ? selectedContentLegacyLessons
      : selectedContentSubjectLessons.filter((lesson) =>
        lesson.chapterId === selectedContentChapter.id ||
        (lesson.subjectId === selectedContentSubject?.id && lesson.chapterName === selectedContentChapter.name)
      )
    : [];
  const contentStep = !isContentYearOpen
    ? "years"
    : selectedContentChapter
      ? "lessons"
      : selectedContentSubject
        ? "chapters"
        : "subjects";
  const aiQuickPrompts = [
    "إزاي أضيف محاضرة؟",
    "إزاي أولد أكواد؟",
    "طالب عنده مشكلة كود",
    "إزاي أحظر طالب؟",
    "إزاي أرتب المواد والشابترات؟",
    "راجع تنبيهات الحماية",
  ];

  const getAiAssistantReply = (rawQuestion) => {
    const question = String(rawQuestion || "").trim().toLowerCase();
    const includesAny = (words) => words.some((word) => question.includes(word));

    if (includesAny(["محاضرة", "محاضرات", "فيديو", "نشر"])) {
      return {
        text: `لإضافة محاضرة: افتح "إدارة المحتوى"، اكتب العنوان والوصف، اختر الفرقة والترم والمادة، ثم اختر الشابتر وارفع الفيديو أو ضع الرابط. قبل النشر استخدم زر "معاينة" للتأكد من أن الفيديو والمادة والشابتر صحيحين.`,
        actionLabel: "فتح إدارة المحتوى",
        action: openLessonComposer,
      };
    }

    if (includesAny(["كود", "اكواد", "أكواد", "تفعيل", "اشتراك"])) {
      return {
        text: `الأكواد الصحيحة تتفعل تلقائياً للطالب الآن. من صفحة الأكواد يمكنك توليد أكواد حسب الفرقة، فلترة المتاح والمستخدم، نسخ كود، تصدير PDF، أو حذف مجموعة أكواد محددة.`,
        actionLabel: "فتح صفحة الأكواد",
        action: () => setActiveTab("codes"),
      };
    }

    if (includesAny(["طالب", "طلاب", "بحث", "جهاز", "حظر", "فك حظر"])) {
      return {
        text: `لإدارة الطلاب: افتح صفحة الطلاب، استخدم البحث بالاسم أو الرقم، ثم فلتر حسب الفرقة أو الحالة أو الجهاز. من الإجراءات يمكنك تصفير الجهاز، حظر/فك حظر الطالب، أو حذف الحساب.`,
        actionLabel: "فتح الطلاب",
        action: () => setActiveTab("students"),
      };
    }

    if (includesAny(["رقابة", "حماية", "تصوير", "سجل", "تنبيه", "تنبيهات"])) {
      return {
        text: `سجل الرقابة يعرض محاولات التصوير، تنبيهات الحماية، تفعيل الأكواد، وأحداث الأجهزة. استخدم فلتر نوع الحدث أو البحث باسم الطالب، ثم اضغط "عرض الطالب" لو محتاج إجراء مباشر.`,
        actionLabel: "فتح سجل الرقابة",
        action: () => setActiveTab("logs"),
      };
    }

    if (includesAny(["مادة", "مواد", "شابتر", "شابترات", "فصل", "فصول", "ترتيب"])) {
      return {
        text: `لتنظيم المحتوى: افتح إدارة المحتوى، أضف المادة، ثم أضف الشابترات داخلها وحدد الفرقة. بعد ذلك أضف المحاضرة واربطها بنفس المادة والشابتر من نفس الصفحة.`,
        actionLabel: "فتح إدارة المحتوى",
        action: openContentManager,
      };
    }

    if (includesAny(["احصائيات", "إحصائيات", "رئيسية", "داشبورد", "نشاط"])) {
      return {
        text: `الرئيسية تعرض أرقام الطلاب والمحاضرات والأكواد، نشاط آخر 7 أيام، تنبيهات تشغيلية، وآخر الطلاب والتنبيهات. استخدمها كمركز متابعة سريع كل يوم.`,
        actionLabel: "فتح الرئيسية",
        action: () => setActiveTab("stats"),
      };
    }

    return {
      text: `أقدر أساعدك في: إضافة محاضرة، توليد أكواد، البحث عن طالب، تصفير جهاز، حظر طالب، مراجعة الرقابة، وتنظيم المواد والشابترات. اكتب سؤالك بشكل مباشر أو اختر سؤالاً جاهزاً من الأزرار.`,
    };
  };

  const sendAiMessage = (messageText = aiInput) => {
    const cleanMessage = String(messageText || "").trim();
    if (!cleanMessage) return;

    const reply = getAiAssistantReply(cleanMessage);
    setAiMessages((current) => [
      ...current,
      { role: "user", text: cleanMessage },
      { role: "assistant", text: reply.text, actionLabel: reply.actionLabel, action: reply.action },
    ]);
    setAiInput("");
  };

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', direction: 'rtl', minHeight: '100vh', background: theme.bg, color: theme.text, fontFamily: 'Cairo, sans-serif' }}>
      
      <aside className={isMobile ? "mobile-nav" : `desktop-sidebar ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={{
        width: isMobile ? '100%' : (isSidebarCollapsed ? '84px' : '288px'), height: isMobile ? '75px' : '100vh',
        position: 'fixed', bottom: 0, top: isMobile ? 'auto' : 0, right: 0,
        background: theme.surface, borderLeft: isMobile ? 'none' : `1px solid ${theme.borderSoft}`, borderTop: isMobile ? `1px solid ${theme.borderSoft}` : 'none', zIndex: 1000,
        display: 'flex', flexDirection: isMobile ? 'row' : 'column', transition: '0.3s'
      }}>
        {!isMobile && (
            <div className={`sidebar-brand ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed((current) => !current)}
                  className="sidebar-collapse-btn"
                  title={isSidebarCollapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
                >
                  <i className={`fas ${isSidebarCollapsed ? 'fa-chevron-left' : 'fa-chevron-right'}`}></i>
                </button>
                <div className="brand-main">
                  <div className="brand-logo-frame">
                    <img className="admin-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="El Hadidy" />
                  </div>
                  {!isSidebarCollapsed && (
                    <div className="brand-copy">
                      <span>Elhadedy App</span>
                      <strong>منصة الحديدي</strong>
                      <small>لوحة إدارة المحتوى والطلاب</small>
                    </div>
                  )}
                </div>
                {!isSidebarCollapsed && (
                  <div className="brand-status">
                    <span><i className="fas fa-shield-alt"></i> Admin</span>
                    <span><i className="fas fa-circle"></i> متصل</span>
                  </div>
                )}
                {!isSidebarCollapsed && (
                <div className="brand-theme">
                  <ThemeToggle mode={themeMode} onToggle={toggleTheme} theme={theme} />
                </div>
                )}
            </div>
        )}
        <nav className="custom-scrollbar" style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', flex: 1, padding: isMobile ? '0 5px' : '15px', justifyContent: isMobile ? 'space-between' : 'flex-start', alignItems: 'center', gap: isMobile ? '0' : '8px', overflowX: isMobile ? 'auto' : 'hidden' }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`nav-btn ${activeTab === item.id ? 'active' : ''}`} style={{ width: isMobile ? 'auto' : '100%', padding: isMobile ? '10px 12px' : '14px 20px', flexShrink: 0 }}>
              <span className="nav-icon-box"><i className={`fas ${item.icon}`} style={{ fontSize: isMobile ? '20px' : '16px', color: item.id === 'logs' ? theme.danger : 'inherit' }}></i></span>
              {(!isSidebarCollapsed || isMobile) && <span style={{ fontSize: isMobile ? '10px' : '14px', marginTop: isMobile ? '4px' : '0' }}>{item.label}</span>}
              {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
            </button>
          ))}
          
          <button onClick={handleLogout} className="nav-btn logout-btn" style={{ width: isMobile ? 'auto' : '100%', marginTop: isMobile ? '0' : 'auto', padding: isMobile ? '10px 12px' : '14px 20px', color: theme.danger, flexShrink: 0 }}>
              <span className="nav-icon-box"><i className="fas fa-sign-out-alt" style={{ fontSize: isMobile ? '20px' : '16px' }}></i></span>
              {(!isSidebarCollapsed || isMobile) && <span style={{ fontSize: isMobile ? '10px' : '14px', marginTop: isMobile ? '4px' : '0' }}>خروج</span>}
          </button>
        </nav>
      </aside>

      <main style={{ flex: 1, padding: isMobile ? '16px' : '28px', paddingBottom: isMobile ? '100px' : '32px', marginRight: isMobile ? 0 : (isSidebarCollapsed ? '84px' : '288px'), transition: '0.3s' }}>
        <div className="page-head">
          <div>
            <div className="page-kicker">Elhadedy Admin</div>
            <h1>{currentSection.title}</h1>
            <p>{currentSection.subtitle}</p>
          </div>
          <div className="global-search">
            <i className="fas fa-search"></i>
            <input
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="بحث سريع: طالب، كود، محاضرة، مادة..."
            />
            {globalSearch && (
              <button type="button" onClick={() => setGlobalSearch("")} title="مسح البحث">
                <i className="fas fa-times"></i>
              </button>
            )}
            {globalResults.length > 0 && (
              <div className="global-results">
                {globalResults.map((result) => (
                  <button key={result.id} type="button" onClick={result.action}>
                    <span className="result-icon"><i className={`fas ${result.icon}`}></i></span>
                    <span>
                      <strong>{result.title}</strong>
                      <small>{result.type} • {result.subtitle}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="page-head-actions">
            {!isMobile && <ThemeToggle mode={themeMode} onToggle={toggleTheme} theme={theme} />}
            <button className="quick-action" onClick={openLessonComposer}><i className="fas fa-plus"></i> محاضرة</button>
            <button className="quick-action ghost" onClick={() => setActiveTab('support_requests')}><i className="fas fa-headset"></i> طلبات الدعم</button>
            {topPills.map((pill) => (
              <div key={pill.label} className="mini-pill">
                <span>{pill.label}</span>
                <strong>{pill.value}</strong>
              </div>
            ))}
          </div>
        </div>

       {activeTab === 'stats' && (
          <div className="fade-in">
            <div className="admin-hero admin-hero-compact">
              <div>
                <h2>لوحة تحكم الأدمن</h2>
                <p>كل أرقام المنصة والمهام الحرجة في مكان واحد، بشكل أوضح وأهدأ.</p>
              </div>
              <div className="hero-pill">إجمالي {studentsDB.length + lessons.length} عنصر</div>
            </div>
            <div className="stats-grid-shell">
              <div className="stat-card"><div className="stat-icon"><i className="fas fa-users"></i></div><h3>{studentsDB.length}</h3><p>طالب مسجل</p></div>
              <div className="stat-card"><div className="stat-icon"><i className="fas fa-play-circle"></i></div><h3>{lessons.length}</h3><p>محاضرة</p></div>
              <div className="stat-card"><div className="stat-icon"><i className="fas fa-ticket-alt"></i></div><h3>{codesDB.filter(c => !c.isUsed).length}</h3><p>كود متاح</p></div>
              <div className="stat-card"><div className="stat-icon"><i className="fas fa-check-circle"></i></div><h3>{codesDB.filter(c => c.isUsed).length}</h3><p>كود مستخدم</p></div>
              <div className="stat-card danger-stat" onClick={() => setActiveTab('logs')}><div className="stat-icon danger"><i className="fas fa-shield-alt"></i></div><h3>{securityAlerts.length}</h3><p>تنبيه حماية</p></div>
            </div>
            <div className="insights-grid">
              <div className="insight-card">
                <div className="ops-head"><h3>نشاط آخر 7 أيام</h3><button onClick={() => setActiveTab('students')}>التفاصيل</button></div>
                <div className="activity-chart">
                  {lastSevenDays.map((day) => (
                    <div key={day.key} className="activity-day">
                      <div className="activity-bar" style={{ height: `${Math.max(8, (day.total / maxDailyActivity) * 100)}%` }} title={`${day.total} نشاط`}></div>
                      <span>{day.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="insight-card">
                <div className="ops-head"><h3>تنبيهات تشغيلية</h3><button onClick={openContentManager}>تحسين</button></div>
                <div className="insight-list">
                  <div><i className="fas fa-ticket-alt"></i><strong>{codesDB.filter(c => !c.isUsed).length}</strong><span>كود متاح حالياً</span></div>
                  <div><i className="fas fa-layer-group"></i><strong>{lessonsWithoutChapter}</strong><span>محاضرة بدون شابتر</span></div>
                  <div><i className="fas fa-graduation-cap"></i><strong>{mostActiveYear?.year || 'لا يوجد'}</strong><span>أكثر فرقة نشاطاً ({mostActiveYear?.count || 0})</span></div>
                </div>
              </div>
            </div>
            <div className="ops-grid">
              <div className="ops-card">
                <div className="ops-head"><h3>طلبات الدعم</h3><button onClick={() => setActiveTab('support_requests')}>عرض الكل</button></div>
                {pendingSupportRequests.length ? pendingSupportRequests.slice(0, 4).map((request) => (
                  <div className="ops-row" key={request.id}>
                    <span className="ops-dot"></span>
                    <div><strong>{request.studentName || request.name || 'طالب'}</strong><small>{request.type || request.requestType || 'طلب دعم'} • {request.status || 'pending'}</small></div>
                  </div>
                )) : <div className="ops-empty">لا توجد طلبات دعم معلقة</div>}
              </div>
              <div className="ops-card">
                <div className="ops-head"><h3>آخر الطلاب</h3><button onClick={() => setActiveTab('students')}>إدارة الطلاب</button></div>
                {recentStudents.length ? recentStudents.map((student) => (
                  <div className="ops-row" key={student.id}>
                    <span className={`ops-status ${student.isBanned ? 'danger' : 'success'}`}></span>
                    <div><strong>{student.name || student.username}</strong><small>{student.year || student.codeYear || 'بدون فرقة'}</small></div>
                  </div>
                )) : <div className="ops-empty">لا يوجد طلاب بعد</div>}
              </div>
              <div className="ops-card">
                <div className="ops-head"><h3>تنبيهات الرقابة</h3><button onClick={() => setActiveTab('logs')}>فتح السجل</button></div>
                {recentAlerts.length ? recentAlerts.map((log) => (
                  <div className="ops-row" key={log.id}>
                    <span className="ops-status danger"></span>
                    <div><strong>{log.studentName}</strong><small>{log.action}</small></div>
                  </div>
                )) : <div className="ops-empty">النظام آمن حالياً</div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'support_requests' && (
          <div className="fade-in">
            <div className="admin-hero">
              <div>
                <h2><i className="fas fa-headset"></i> طلبات الدعم من التطبيق</h2>
                <p>أي طلب يرسله الطالب من صفحة الدعم في التطبيق يظهر هنا مباشرة للأدمن.</p>
              </div>
              <div className="content-hero-pills">
                <div className="hero-pill">{supportRequests.length} طلب</div>
                <div className="hero-pill">{pendingSupportRequests.length} معلق</div>
              </div>
            </div>

            <div className="code-requests-grid">
              {openSupportRequests.map((request) => (
                <div key={request.id} className="request-card">
                  <div className="request-main">
                    <div className="request-avatar"><i className="fas fa-headset"></i></div>
                    <div>
                      <strong>{request.studentName || request.username || 'طالب'}</strong>
                      <p>{request.typeLabel || request.type || 'طلب دعم'} • الحالة: {request.status || 'pending'}</p>
                      <p>{request.message || 'لا توجد رسالة إضافية.'}</p>
                    </div>
                  </div>
                  <div className="request-meta">
                    <span><i className="fas fa-phone"></i> {request.phone || 'بدون رقم'}</span>
                    <span><i className="fas fa-mobile-alt"></i> {request.deviceId || 'بدون جهاز'}</span>
                    <span><i className="fas fa-clock"></i> {request.createdAt?.toDate?.().toLocaleString('ar-EG') || 'وقت غير متاح'}</span>
                  </div>
                  <div className="request-actions">
                    <button onClick={() => openSupportRequestStudent(request)} className="btn-action btn-cyan">عرض الطالب</button>
                    <button onClick={() => updateSupportRequestStatus(request, 'in_progress')} className="btn-action btn-orange">قيد المتابعة</button>
                    <button onClick={() => updateSupportRequestStatus(request, 'resolved')} className="btn-action btn-green">تم الحل</button>
                    <button onClick={() => updateSupportRequestStatus(request, 'rejected')} className="btn-action btn-red">رفض</button>
                  </div>
                </div>
              ))}
              {openSupportRequests.length === 0 && (
                <div className="empty-state">لا توجد طلبات دعم مفتوحة حاليًا.</div>
              )}
            </div>

            <button
              type="button"
              className="resolved-requests-toggle"
              onClick={() => setShowResolvedSupportRequests((current) => !current)}
              aria-expanded={showResolvedSupportRequests}
            >
              <span><i className="fas fa-check-circle"></i> تم الحل</span>
              <span>{resolvedSupportRequests.length} طلب <i className={`fas fa-chevron-${showResolvedSupportRequests ? 'up' : 'down'}`}></i></span>
            </button>

            {showResolvedSupportRequests && (
              <div className="code-requests-grid resolved-requests-list">
                {resolvedSupportRequests.map((request) => (
                  <div key={request.id} className="request-card resolved-request-card">
                    <div className="request-main">
                      <div className="request-avatar"><i className="fas fa-check"></i></div>
                      <div>
                        <strong>{request.studentName || request.username || 'طالب'}</strong>
                        <p>{request.typeLabel || request.type || 'طلب دعم'} • تم الحل</p>
                        <p>{request.message || 'لا توجد رسالة إضافية.'}</p>
                      </div>
                    </div>
                    <div className="request-meta">
                      <span><i className="fas fa-phone"></i> {request.phone || 'بدون رقم'}</span>
                      <span><i className="fas fa-clock"></i> {request.reviewedAt?.toDate?.().toLocaleString('ar-EG') || request.createdAt?.toDate?.().toLocaleString('ar-EG') || 'وقت غير متاح'}</span>
                    </div>
                    <div className="request-actions">
                      <button onClick={() => openSupportRequestStudent(request)} className="btn-action btn-cyan">عرض الطالب</button>
                      <button onClick={() => updateSupportRequestStatus(request, 'in_progress')} className="btn-action btn-orange">إعادة فتح الطلب</button>
                    </div>
                  </div>
                ))}
                {resolvedSupportRequests.length === 0 && (
                  <div className="empty-state">لا توجد طلبات تم حلها حتى الآن.</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- تابة الرقابة Logs --- */}
        {activeTab === 'logs' && (
          <div className="fade-in">
            <h2 style={{ color: theme.danger, marginBottom: '20px' }}><i className="fas fa-shield-alt"></i> سجل الرقابة والحماية</h2>
            <p style={{ color: theme.subText, marginBottom: '20px' }}>يتم هنا تسجيل طلبات تغيير الأجهزة ومحاولات التصوير المحظورة.</p>
            <div className="student-filter-panel">
              <input className="gold-input" value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder="ابحث باسم الطالب أو الحدث..." />
              <select className="gold-input" style={{ width: '220px' }} value={logTypeFilter} onChange={(e) => setLogTypeFilter(e.target.value)}>
                <option value="all">كل الأحداث</option>
                <option value="security">تنبيهات حماية</option>
                <option value="code">تفعيل الأكواد</option>
                <option value="device">الأجهزة</option>
              </select>
              <button className="btn-secondary" onClick={() => { setLogSearch(""); setLogTypeFilter("all"); }}><i className="fas fa-undo"></i> ضبط</button>
            </div>
            <div className="table-container">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: theme.surfaceAlt, color: theme.accent }}><th>الطالب</th><th>نوع الجهاز</th><th>الحدث</th><th>الوقت</th><th>الفتح</th></tr></thead>
                <tbody>
                  {visibleLogs?.map(log => (
                    <tr key={log.id} style={{ borderBottom: `1px solid ${theme.borderSoft}`, textAlign: 'center', background: (log.action || '').includes('حظر') ? `${theme.danger}14` : 'transparent' }}>
                      <td style={{ padding: '15px', color: theme.text }}>{log.studentName}</td>
                      <td>{getDeviceIcon(log.deviceType)} <span style={{fontSize:'10px', color: theme.muted, display:'block'}}>{log.deviceType}</span></td>
                      <td style={{ color: (log.action || '').includes('حظر') ? theme.danger : theme.info, fontWeight: 'bold', fontSize: '13px' }}>{log.action}</td>
                      <td style={{ fontSize: '12px', color: theme.muted }}>{log.time?.toDate().toLocaleString('ar-EG')}</td>
                      <td>
                        <button onClick={() => { setActiveTab('students'); setSearchTerm(log.studentName); }} className="btn-secondary" style={{fontSize: '10px', padding: '5px 10px'}}>
                          عرض الطالب
                        </button>
                      </td>
                    </tr>
                  ))}
                  {visibleLogs.length === 0 && <tr><td colSpan="5" style={{padding: '30px', color: theme.muted}}>لا توجد سجلات مطابقة للفلاتر الحالية.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'content' && (
          <div className="fade-in content-shell">
            <div className="admin-hero content-hero">
              <div>
                <h2>إدارة المحتوى في صفحة واحدة</h2>
                <p>أضف المادة، رتّب الشابترات، ثم راجع أو انشر المحاضرات من نفس المكان.</p>
              </div>
              <div className="content-hero-pills">
                <div className="hero-pill">{subjects.length} مادة</div>
                <div className="hero-pill">{lessons.length} محاضرة</div>
              </div>
            </div>

            <div className="content-control-panel content-flow-panel">
              <div className="content-panel-head">
                <div>
                  <strong>
                    {contentStep === "years" && "اختار الفرقة"}
                    {contentStep === "subjects" && `مواد ${selectedContentYear}`}
                    {contentStep === "chapters" && `${selectedContentSubject?.name} - ${selectedContentYear}`}
                    {contentStep === "lessons" && `${selectedContentChapter?.name} - ${selectedContentSubject?.name}`}
                  </strong>
                  <span>
                    {contentStep === "years" && "اضغط على الفرقة لفتح شاشة المواد الخاصة بها."}
                    {contentStep === "subjects" && "اضغط على المادة لفتح شاشة الشباتر الخاصة بها."}
                    {contentStep === "chapters" && "اختار الشابتر لعرض محتواه أو أضف شابتر جديد."}
                    {contentStep === "lessons" && "راجع محاضرات وملفات الشابتر، وعدل أو أخف المحتوى بسرعة."}
                  </span>
                </div>
                <div className="content-flow-actions">
                  {contentStep !== "years" && <button className="btn-secondary" onClick={contentStep === "subjects" ? backToContentYears : contentStep === "chapters" ? backToContentSubjects : backToContentChapters}><i className="fas fa-arrow-right"></i> رجوع</button>}
                  {contentStep === "lessons" && selectedContentSubject && selectedContentChapter && !selectedContentChapter.isLegacy && <button className="btn-primary" onClick={() => prepareLessonForChapter(selectedContentSubject, selectedContentChapter)}><i className="fas fa-plus"></i> إضافة محاضرة</button>}
                </div>
              </div>

              <div className="content-breadcrumbs">
                <button className={contentStep === "years" ? "active" : ""} onClick={backToContentYears}>الفرق</button>
                {isContentYearOpen && <button className={contentStep === "subjects" ? "active" : ""} onClick={backToContentSubjects}>{selectedContentYear}</button>}
                {selectedContentSubject && <button className={contentStep === "chapters" ? "active" : ""} onClick={backToContentChapters}>{selectedContentSubject.name}</button>}
                {selectedContentChapter && <button className="active">{selectedContentChapter.name}</button>}
              </div>

              {contentStep === "years" && (
                <>
                  <div className="content-year-grid">
                    {yearOptions.map((year) => {
                      const yearSubjectsCount = subjects.filter((subject) => {
                        const subjectChapters = chapters[subject.id] || [];
                        const subjectLessons = lessons.filter((lesson) => lesson.subjectId === subject.id || lesson.subject === subject.name);
                        return subjectChapters.some((chapter) => chapter.year === year) || subjectLessons.some((lesson) => lesson.year === year);
                      }).length;
                      const yearChaptersCount = Object.values(chapters).flat().filter((chapter) => chapter.year === year).length;
                      const yearLessonsCount = lessons.filter((lesson) => lesson.year === year).length;
                      return (
                        <button key={year} type="button" className="year-card flow-card" onClick={() => openYearContent(year)}>
                          <span><i className="fas fa-graduation-cap"></i></span>
                          <strong>{year}</strong>
                          <small>{yearSubjectsCount} مادة • {yearChaptersCount} شابتر • {yearLessonsCount} محاضرة</small>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {contentStep === "subjects" && (
                <div className="content-screen">
                  <div className="card course-form content-create-card">
                    <input placeholder="اسم المادة الجديدة" className="gold-input" value={newSubject} onChange={e => setNewSubject(e.target.value)} />
                    <input placeholder="رابط صورة المادة اختياري" className="gold-input" value={newSubjectImage} onChange={e => setNewSubjectImage(e.target.value)} />
                    <button onClick={handleAddSubject} className="btn-primary">إضافة مادة</button>
                  </div>

                  <div className="content-subject-grid">
                    {subjectsForSelectedContentYear.map((subject) => {
                      const subjectChapters = (chapters[subject.id] || []).filter((chapter) => chapter.year === selectedContentYear);
                      const subjectLessons = lessons.filter((lesson) => {
                        const matchesSubject = lesson.subjectId === subject.id || lesson.subject === subject.name;
                        return matchesSubject && lesson.year === selectedContentYear;
                      });
                      return (
                        <div key={subject.id} className="content-subject-card">
                          <button type="button" className="subject-open-btn year-subject-btn" onClick={() => openSubjectContent(subject)}>
                            <div className="course-cover">
                              {subject.image ? <img src={subject.image} alt={subject.name} /> : <i className="fas fa-book-open"></i>}
                            </div>
                            <div className="subject-card-copy">
                              <h3>{subject.name}</h3>
                              <p>{subjectChapters.length} شابتر • {subjectLessons.length} محاضرة</p>
                            </div>
                            <i className="fas fa-chevron-left"></i>
                          </button>
                          {editingSubject?.id === subject.id ? (
                            <div className="inline-editor">
                              <input className="gold-input" value={editingSubject.name} onChange={(e) => setEditingSubject((prev) => ({ ...prev, name: e.target.value }))} />
                              <input className="gold-input" placeholder="رابط الصورة" value={editingSubject.image || ""} onChange={(e) => setEditingSubject((prev) => ({ ...prev, image: e.target.value }))} />
                              <button className="btn-action btn-green" onClick={handleRenameSubject}>حفظ</button>
                              <button className="btn-action btn-red" onClick={() => setEditingSubject(null)}>إلغاء</button>
                            </div>
                          ) : (
                            <div className="course-actions compact-actions">
                              <button className="btn-action btn-cyan" onClick={() => setEditingSubject(subject)}><i className="fas fa-edit"></i> تعديل</button>
                              <button className="btn-action btn-red" onClick={() => handleDeleteSubject(subject)}><i className="fas fa-trash"></i> حذف</button>
                              <button className="btn-action btn-green" onClick={() => { openSubjectContent(subject); setShowAddChapterFor(subject.id); setNewChapter({ name: "", notes: "", year: selectedContentYear }); }}><i className="fas fa-plus"></i> شابتر</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {subjectsForSelectedContentYear.length === 0 && <div className="empty-state">لا توجد مواد مرتبطة بـ {selectedContentYear} حتى الآن. أضف مادة جديدة من الأعلى.</div>}
                </div>
              )}

              {contentStep === "chapters" && selectedContentSubject && (
                <div className="content-screen">
                  {showAddChapterFor === selectedContentSubject.id ? (
                    <div className="chapter-form modal-chapter-form soft-panel">
                      <input className="gold-input" placeholder="اسم الشابتر" value={newChapter.name} onChange={(e) => setNewChapter((prev) => ({ ...prev, name: e.target.value }))} />
                      <select className="gold-input" value={newChapter.year} onChange={(e) => setNewChapter((prev) => ({ ...prev, year: e.target.value }))}>
                        {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                      </select>
                      <textarea className="gold-input" placeholder="ملاحظات الشابتر" value={newChapter.notes} onChange={(e) => setNewChapter((prev) => ({ ...prev, notes: e.target.value }))} />
                      <button className="btn-primary" onClick={() => handleAddChapter(selectedContentSubject)}>حفظ الشابتر</button>
                    </div>
                  ) : (
                    <button className="btn-primary clear-filter-btn" onClick={() => { setShowAddChapterFor(selectedContentSubject.id); setNewChapter({ name: "", notes: "", year: selectedContentYear }); }}><i className="fas fa-plus"></i> إضافة شابتر</button>
                  )}

                  <div className="chapter-chip-list content-chapter-grid">
                    {visibleContentChapters.map((chapter, index) => {
                      const chapterLessons = chapter.isLegacy
                        ? selectedContentLegacyLessons
                        : selectedContentSubjectLessons.filter((lesson) => lesson.chapterId === chapter.id || lesson.chapterName === chapter.name);
                      return (
                        <div key={chapter.id} className={`chapter-drilldown content-chapter-card ${chapter.isLegacy ? 'legacy-chapter-card' : ''}`}>
                          <button type="button" className="chapter-select-btn" onClick={() => openChapterContent(chapter)}>
                            <span><i className={`fas ${chapter.isLegacy ? 'fa-archive' : 'fa-layer-group'}`}></i></span>
                            <strong>{chapter.name}</strong>
                            <small>{chapterLessons.length} محتوى</small>
                            <i className="fas fa-chevron-left"></i>
                          </button>
                          {!chapter.isLegacy && (
                            <div className="chapter-actions compact-actions">
                              <button className="icon-btn" disabled={index === 0} onClick={() => handleMoveChapter(selectedContentSubject.id, chapter.id, "up")}><i className="fas fa-arrow-up"></i></button>
                              <button className="icon-btn" disabled={index === selectedContentSubjectChapters.length - 1} onClick={() => handleMoveChapter(selectedContentSubject.id, chapter.id, "down")}><i className="fas fa-arrow-down"></i></button>
                              <button className="btn-action btn-green" onClick={() => prepareLessonForChapter(selectedContentSubject, chapter)}><i className="fas fa-plus"></i> محاضرة</button>
                              <button className="icon-btn" onClick={() => setEditingChapter(chapter)}><i className="fas fa-edit"></i></button>
                              <button className="icon-btn danger" onClick={() => handleDeleteChapter(chapter)}><i className="fas fa-trash"></i></button>
                            </div>
                          )}
                          {editingChapter?.id === chapter.id && !chapter.isLegacy && (
                            <div className="inline-editor wide">
                              <input className="gold-input" value={editingChapter.name} onChange={(e) => setEditingChapter((prev) => ({ ...prev, name: e.target.value }))} />
                              <select className="gold-input" value={editingChapter.year || selectedContentYear} onChange={(e) => setEditingChapter((prev) => ({ ...prev, year: e.target.value }))}>
                                {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                              </select>
                              <button className="btn-action btn-green" onClick={handleRenameChapter}>حفظ</button>
                              <button className="btn-action btn-red" onClick={() => setEditingChapter(null)}>إلغاء</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {visibleContentChapters.length === 0 && <div className="empty-state">لا توجد شابترات أو محاضرات قديمة لهذه المادة في {selectedContentYear}. أضف أول شابتر من الزر بالأعلى.</div>}
                </div>
              )}

              {contentStep === "lessons" && selectedContentSubject && selectedContentChapter && (
                <div className="chapter-videos-panel content-screen">
                  <div className="chapter-videos-head">
                    <div>
                      <strong>محتوى {selectedContentChapter.name}</strong>
                      <span>{selectedContentYear} • {selectedContentSubject.name} {selectedContentChapter.notes ? `• ${selectedContentChapter.notes}` : ""}</span>
                    </div>
                  </div>
                  <div className="chapter-video-list">
                    {selectedContentChapterLessons.map((lesson) => (
                      <div key={lesson.id} className="chapter-video-card">
                        <button className="video-thumb-mini" onClick={() => setPlayingVideoId((current) => current === lesson.id ? null : lesson.id)}>
                          <i className={`fas ${playingVideoId === lesson.id ? 'fa-pause' : 'fa-play'}`}></i>
                        </button>
                        <div>
                          <strong>{lesson.title}</strong>
                          <span>{lesson.semester || 'بدون ترم'} {lesson.pdfUrl ? '• PDF' : ''} {lesson.isActive === false ? '• مخفي' : ''}</span>
                        </div>
                        <div className="chapter-video-actions">
                          <button onClick={() => toggleLessonVisibility(lesson.id, lesson.isActive)} className={`btn-action ${lesson.isActive === false ? 'btn-green' : 'btn-orange'}`}>{lesson.isActive === false ? 'إظهار' : 'إخفاء'}</button>
                          <button onClick={() => handleEditLesson(lesson)} className="btn-action btn-cyan">تعديل</button>
                          <button onClick={() => setStatsLesson(lesson)} className="btn-action btn-green">إحصائيات</button>
                          <button onClick={() => confirmAction('حذف المحاضرة؟', '', () => deleteDoc(doc(db, "lessons", lesson.id)), true)} className="btn-action btn-red">حذف</button>
                        </div>
                        {playingVideoId === lesson.id && lesson.url && (
                          <div className="chapter-video-player">
                            {isBunnyEmbedUrl(lesson.url || '') ? (
                              <iframe src={lesson.url} className="inline-video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen title={lesson.title}></iframe>
                            ) : (
                              <video src={lesson.url} controls controlsList="nodownload noplaybackrate" disablePictureInPicture className="inline-video" onContextMenu={e => e.preventDefault()} />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {selectedContentChapterLessons.length === 0 && <div className="empty-state">لا يوجد محتوى داخل هذا الشابتر بعد. اضغط إضافة محاضرة.</div>}
                  </div>
                </div>
              )}
            </div>

            {showAddLessonForm && (
                    <div className="modal-overlay lesson-form-overlay" onClick={() => setShowAddLessonForm(false)}>
                      <div className="lesson-form-modal" onClick={(event) => event.stopPropagation()}>
                        <button className="modal-close lesson-modal-close" onClick={() => setShowAddLessonForm(false)}><i className="fas fa-times"></i></button>
                        <div className="lesson-modal-head">
                          <div className="lesson-type-toggle">
                            <span className="active"><i className="fas fa-circle"></i> Bunny Stream</span>
                          </div>
                          <div>
                            <h2>{editingLessonId ? 'تعديل محاضرة' : 'أضف محاضرة'}</h2>
                            <p>{selectedContentSubject?.name || newLesson?.subject || 'المادة'} • {newLesson?.chapterName || 'بدون شابتر'} • {newLesson?.year}</p>
                          </div>
                        </div>

                        <div className="lesson-modal-grid">
                          <label>
                          <strong>اسم المحاضرة:</strong>
                            <input placeholder="عنوان المحاضرة" className="gold-input lesson-modal-input" value={lessonTitle} onChange={e => { setLessonTitle(e.target.value); setNewLesson(prev => ({ ...prev, title: e.target.value, isActive: true })); }} />
                          </label>
                          <label>
                          <strong>ملف الفيديو:</strong>
                            <div className={`lesson-upload-line ${newLesson?.url ? 'uploaded' : ''}`}>
                              <i className="fas fa-upload"></i>
                              <span>{newLesson?.url ? 'تم تجهيز الفيديو' : 'ارفع فيديو من الجهاز أو استخدم رابط الفيديو'}</span>
                              <input type="file" accept="video/*" onChange={(e) => uploadFileToBunny(e.target.files[0], 'video')} />
                            </div>
                          </label>
                          <label className="wide">
                            <strong>وصف المحاضرة:</strong>
                            <textarea placeholder="وصف مختصر للمحاضرة" className="gold-input lesson-modal-input" value={newLesson?.description || ""} onChange={e => setNewLesson(prev => ({ ...prev, description: e.target.value }))} />
                          </label>
                          <label>
                            <strong>الترم:</strong>
                            <select className="gold-input lesson-modal-input" value={newLesson?.semester || "الأول"} onChange={e => setNewLesson(prev => ({ ...prev, semester: e.target.value }))}>
                              <option value="الأول">الترم الأول</option>
                              <option value="الثاني">الترم الثاني</option>
                            </select>
                          </label>
                          <label>
                            <strong>الفرقة:</strong>
                            <select className="gold-input lesson-modal-input" value={newLesson?.year || selectedContentYear} onChange={e => setNewLesson(prev => ({ ...prev, year: e.target.value, chapterId: "", chapterName: "" }))}>
                              {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                            </select>
                          </label>
                          <label>
                            <strong>الشابتر:</strong>
                            <select className="gold-input lesson-modal-input" value={newLesson?.chapterId || ""} onChange={(e) => {
                              const selectedChapter = (chapters[selectedContentSubject.id] || []).find((chapter) => chapter.id === e.target.value);
                              setNewLesson((prev) => ({ ...prev, chapterId: selectedChapter?.id || "", chapterName: selectedChapter?.name || "", year: selectedChapter?.year || prev.year }));
                            }}>
                              <option value="">بدون شابتر</option>
                              {(chapters[selectedContentSubject.id] || []).filter((chapter) => chapter.year === (newLesson?.year || selectedContentYear)).map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}
                            </select>
                          </label>
                          <label>
                            <strong>ملزمة PDF:</strong>
                            <div className={`lesson-upload-line ${newLesson?.pdfUrl ? 'uploaded' : ''}`}>
                              <i className="fas fa-upload"></i>
                              <span>{newLesson?.pdfUrl ? 'تم تجهيز الملزمة' : 'ارفع ملف PDF للملزمة'}</span>
                              <input type="file" accept=".pdf" onChange={(e) => uploadFileToBunny(e.target.files[0], 'pdf')} />
                            </div>
                          </label>
                          <label className="wide">
                            <strong>رابط الفيديو أو Embed:</strong>
                            <input className="gold-input lesson-modal-input" placeholder="رابط Bunny Stream Embed" value={newLesson?.url || ''} onChange={e => setNewLesson(prev => ({ ...prev, url: e.target.value, videoKind: 'bunny' }))} />
                          </label>
                          <label className="wide">
                            <strong>رابط الملزمة:</strong>
                            <input className="gold-input lesson-modal-input" placeholder="رابط PDF مباشر" value={newLesson?.pdfUrl || ''} onChange={e => setNewLesson(prev => ({ ...prev, pdfUrl: e.target.value }))} />
                          </label>
                        </div>

                        {(isUploading.video || isUploading.pdf) && <div className="loader-dots">جارٍ الرفع...</div>}

                        <div className="lesson-modal-actions">
                          <button onClick={saveLesson} className="btn-primary"><i className="fas fa-plus"></i> {editingLessonId ? 'حفظ التعديلات' : 'أضف'}</button>
                          <button onClick={openLessonPreview} className="btn-secondary"><i className="fas fa-eye"></i> معاينة</button>
                          <button onClick={() => setShowAddLessonForm(false)} className="btn-secondary">إغلاق</button>
                        </div>
                      </div>
                    </div>
                  )}
          </div>
        )}

        {activeTab === 'add_lesson' && (
          <div className="fade-in add-lesson-shell">
            <div className="admin-hero">
              <div>
                <h2>{editingLessonId ? 'تعديل محاضرة' : 'إضافة محاضرة جديدة'}</h2>
                <p>واجهة نشر مرتبة: اكتب البيانات، اربط المادة والشابتر، أضف الفيديو والملزمة، ثم عاين قبل النشر.</p>
              </div>
              <div className="publish-steps">
                <span className={(lessonTitle || newLesson?.title) ? 'done' : ''}>1 البيانات</span>
                <span className={newLesson?.subject ? 'done' : ''}>2 الربط</span>
                <span className={newLesson?.url ? 'done' : ''}>3 الفيديو</span>
              </div>
            </div>

            <div className="lesson-compose-grid">
              <div className="compose-main">
                <div className="compose-section">
                  <div className="compose-head">
                    <i className="fas fa-pen-nib"></i>
                    <div>
                      <strong>بيانات المحاضرة</strong>
                      <span>العنوان والوصف الذي سيظهر للطالب</span>
                    </div>
                  </div>
                  <input placeholder="عنوان المحاضرة" className="gold-input lesson-title-input" value={lessonTitle} onChange={e => { setLessonTitle(e.target.value); setNewLesson(prev => ({ ...prev, title: e.target.value, isActive: true })); }} />
                  <textarea placeholder="وصف مختصر للمحاضرة" className="gold-input lesson-description-input" value={newLesson?.description || ""} onChange={e => setNewLesson(prev => ({ ...prev, description: e.target.value }))} />
                </div>

                <div className="compose-section">
                  <div className="compose-head">
                    <i className="fas fa-sitemap"></i>
                    <div>
                      <strong>تنظيم المحتوى</strong>
                      <span>اختر الفرقة والترم ثم المادة والشابتر</span>
                    </div>
                  </div>
                  <div className="form-grid">
                    <select className="gold-input" value={newLesson?.year || "الفرقة الأولى"} onChange={e => setNewLesson(prev => ({ ...prev, year: e.target.value, chapterId: "", chapterName: "" }))}>
                      {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                    <select className="gold-input" value={newLesson?.semester || "الأول"} onChange={e => setNewLesson(prev => ({ ...prev, semester: e.target.value }))}>
                      <option value="الأول">الترم الأول</option>
                      <option value="الثاني">الترم الثاني</option>
                    </select>
                    <div className="bunny-mode-pill">
                      <i className="fas fa-play-circle"></i>
                      <span>Bunny Stream فقط</span>
                    </div>
                  </div>

                  <div className="chips-wrap compose-chips">
                    {subjects.map((subject) => (
                      <button key={subject.id} className={`chip ${newLesson?.subjectId === subject.id || newLesson?.subject === subject.name ? 'active' : ''}`} onClick={() => selectLessonSubject(subject)}>
                        <i className="fas fa-book"></i>
                        {subject.name}
                      </button>
                    ))}
                    {subjects.length === 0 && <div className="filter-empty">أضف مادة أولاً من إدارة المحتوى.</div>}
                  </div>

                  {selectedFormSubject && (
                    <select className="gold-input" value={newLesson?.chapterId || ""} onChange={(e) => {
                      const selectedChapter = selectedFormChapters.find((chapter) => chapter.id === e.target.value);
                      setNewLesson((prev) => ({ ...prev, chapterId: selectedChapter?.id || "", chapterName: selectedChapter?.name || "" }));
                    }}>
                      <option value="">اختر الشابتر</option>
                      {selectedFormChapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}
                    </select>
                  )}
                </div>

                <div className="compose-section">
                  <div className="compose-head">
                    <i className="fas fa-link"></i>
                    <div>
                      <strong>مصادر الفيديو والملزمة</strong>
                      <span>ارفع الملفات أو الصق الروابط مباشرة</span>
                    </div>
                  </div>
                  <input
                    className="gold-input"
                    placeholder="رابط Bunny Stream Embed أو ارفع فيديو من الصندوق بالأسفل"
                    value={newLesson?.url || ''}
                    onChange={e => setNewLesson(prev => ({ ...prev, url: e.target.value, videoKind: 'bunny' }))}
                  />
                  <input
                    className="gold-input"
                    placeholder="رابط PDF مباشر أو ارفع ملف PDF إلى Bunny Storage"
                    value={newLesson?.pdfUrl || ''}
                    onChange={e => setNewLesson(prev => ({ ...prev, pdfUrl: e.target.value }))}
                  />
                  <div className="upload-grid">
                    <div className={`upload-box ${newLesson?.url ? 'uploaded' : ''}`}>
                      <i className="fas fa-video"></i>
                      <strong>رفع فيديو</strong>
                      <span>{newLesson?.url ? 'تم تجهيز الفيديو' : 'اضغط لاختيار ملف فيديو'}</span>
                      <input type="file" accept="video/*" onChange={(e) => uploadFileToBunny(e.target.files[0], 'video')} />
                      {isUploading.video && <div className="loader-dots">جارٍ الرفع...</div>}
                    </div>
                    <div className={`upload-box ${newLesson?.pdfUrl ? 'uploaded' : ''}`}>
                      <i className="fas fa-file-pdf"></i>
                      <strong>رفع PDF</strong>
                      <span>{newLesson?.pdfUrl ? 'تم تجهيز الملزمة' : 'اختياري: ارفع ملف PDF'}</span>
                      <input type="file" accept=".pdf" onChange={(e) => uploadFileToBunny(e.target.files[0], 'pdf')} />
                      {isUploading.pdf && <div className="loader-dots">جارٍ الرفع...</div>}
                    </div>
                  </div>
                </div>
              </div>

              <aside className="compose-side">
                <div className="compose-summary">
                  <span className="code-status available">ملخص النشر</span>
                  <h3>{lessonTitle || newLesson?.title || 'محاضرة بدون عنوان'}</h3>
                  <p>{newLesson?.description || 'لم يتم إضافة وصف بعد.'}</p>
                  <div className="preview-checks">
                    <span className={(lessonTitle || newLesson?.title) ? 'ok' : 'warn'}><i className={`fas ${(lessonTitle || newLesson?.title) ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i> العنوان</span>
                    <span className={newLesson?.subject ? 'ok' : 'warn'}><i className={`fas ${newLesson?.subject ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i> المادة</span>
                    <span className={newLesson?.chapterId ? 'ok' : 'warn'}><i className={`fas ${newLesson?.chapterId ? 'fa-check-circle' : 'fa-info-circle'}`}></i> الشابتر</span>
                    <span className={newLesson?.url ? 'ok' : 'warn'}><i className={`fas ${newLesson?.url ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i> الفيديو</span>
                    <span className={newLesson?.pdfUrl ? 'ok' : 'warn'}><i className={`fas ${newLesson?.pdfUrl ? 'fa-check-circle' : 'fa-info-circle'}`}></i> الملزمة</span>
                  </div>
                  <div className="form-actions compose-actions">
                    <button onClick={saveLesson} className="btn-primary">{editingLessonId ? 'حفظ التعديلات' : 'نشر المحاضرة'}</button>
                    <button onClick={openLessonPreview} className="btn-secondary"><i className="fas fa-eye"></i> معاينة</button>
                    {editingLessonId && <button onClick={resetLessonForm} className="btn-secondary">إلغاء التعديل</button>}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}

        {activeTab === 'students' && (
          <div className="fade-in">
            <div className="student-filter-panel">
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="ابحث بالاسم أو الرقم..." className="gold-input" style={{ flex: 1, minWidth: '250px' }} />
              <select className="gold-input" style={{ width: '180px' }} value={studentYearFilter} onChange={e => setStudentYearFilter(e.target.value)}>
                {yearFilters.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
              <select className="gold-input" style={{ width: '180px' }} value={studentStatusFilter} onChange={e => setStudentStatusFilter(e.target.value)}>
                <option value="all">كل الحالات</option>
                <option value="subscribed">مشترك</option>
                <option value="unsubscribed">غير مشترك</option>
                <option value="banned">محظور</option>
              </select>
              <select className="gold-input" style={{ width: '180px' }} value={studentDeviceFilter} onChange={e => setStudentDeviceFilter(e.target.value)}>
                {deviceFilters.map((device) => <option key={device} value={device}>{device === "all" ? "كل الأجهزة" : device}</option>)}
              </select>
              <button onClick={() => exportToPdf(visibleStudents, 'بيانات الطلاب', [
                { label: 'الاسم', value: (s) => s.name || '' },
                { label: 'اسم المستخدم', value: (s) => s.username || '' },
                { label: 'الرقم', value: (s) => s.phone || 'غير متوفر' },
                { label: 'الفرقة', value: (s) => s.year || s.codeYear || '' },
                { label: 'الاشتراك', value: (s) => s.isSubscribed ? 'مفعل' : 'غير مفعل' },
                { label: 'الحالة', value: (s) => s.isBanned ? 'محظور' : 'مفعل' },
                { label: 'الكود المستخدم', value: (s) => s.usedCode || '' },
              ])} className="btn-secondary"><i className="fas fa-file-pdf"></i> تصدير PDF</button>
              <button onClick={() => { setSearchTerm(""); setStudentYearFilter("الكل"); setStudentStatusFilter("all"); setStudentDeviceFilter("all"); }} className="btn-secondary"><i className="fas fa-undo"></i> ضبط</button>
            </div>
            <div className="table-container">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: theme.surfaceAlt, color: theme.accent }}><th>الاسم</th><th>الرقم</th><th>الجهاز</th><th>الفرقة</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
                <tbody>
                  {visibleStudents.map(s => (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${theme.borderSoft}`, textAlign: 'center' }}>
                      <td style={{ padding: '15px' }}>
                        <button className="student-name-link" onClick={() => setSelectedStudentId(s.id)}>
                          {s.name}
                        </button>
                        <br/><small style={{color: theme.muted}}>{s.username}</small>
                      </td>
                      <td>{s.phone || 'غير متوفر'}</td>
                      <td>
                        <div style={{ fontSize: '18px' }}>
                          {getDeviceIcon(s.deviceType)} 
                          <div style={{fontSize: '9px', color: theme.muted, marginTop: '4px'}}>{s.deviceType || 'غير متوفر'}</div>
                        </div>
                      </td>
                      <td>{s.year}</td>
                      <td><span className={s.isBanned ? 'status-banned' : 'status-active'}>{s.isBanned ? 'محظور' : 'مفعل'}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                          <button title="فتح البروفايل" onClick={() => setSelectedStudentId(s.id)} className="btn-action btn-green"><i className="fas fa-id-card"></i></button>
                          <button title="تصفير الجهاز" onClick={() => confirmAction('تصفير الجهاز؟', '', () => updateDoc(doc(db, "students", s.id), { deviceId: null, deviceType: null }))} className="btn-action btn-cyan"><i className="fas fa-sync-alt"></i></button>
                          <button title="حظر / فك حظر" onClick={() => updateDoc(doc(db, "students", s.id), { isBanned: !s.isBanned, banReason: !s.isBanned ? 'تم حظر الحساب بواسطة الإدارة' : '' })} className={`btn-action ${s.isBanned ? 'btn-green' : 'btn-orange'}`}><i className={`fas ${s.isBanned ? 'fa-unlock' : 'fa-ban'}`}></i></button>
                          <button title="حذف" onClick={() => confirmAction('حذف نهائي؟', '', () => deleteDoc(doc(db, "students", s.id)), true)} className="btn-action btn-red"><i className="fas fa-trash"></i></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visibleStudents.length === 0 && <tr><td colSpan="6" style={{padding: '30px', color: theme.muted}}>لا يوجد طلاب مطابقين للفلتر الحالي.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'codes' && (
          <div className="fade-in">
            <div className="codes-toolbar">
              <div className="codes-panel">
                <div className="codes-panel-title">
                  <i className="fas fa-magic"></i>
                  <div>
                    <strong>توليد أكواد جديدة</strong>
                    <span>اختر الفرقة وعدد الأكواد المطلوبة</span>
                  </div>
                </div>
                <div className="codes-control-row">
                  <select className="gold-input" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                    <option value="الكل">اختر الفرقة</option>
                    <option value="الفرقة الأولى">الفرقة الأولى</option>
                    <option value="الفرقة الثانية">الفرقة الثانية</option>
                    <option value="الفرقة الثالثة">الفرقة الثالثة</option>
                    <option value="الفرقة الرابعة">الفرقة الرابعة</option>
                  </select>
                  <input type="text" inputMode="numeric" dir="ltr" min="1" max="500" value={codeQty} onChange={e => setCodeQty(keepEnglishDigitsOnly(e.target.value))} className="gold-input" />
                  <button onClick={generateCodes} className="btn-primary">توليد</button>
                </div>
              </div>

              <div className="codes-panel">
                <div className="codes-panel-title">
                  <i className="fas fa-filter"></i>
                  <div>
                    <strong>فلترة وتصدير</strong>
                    <span>اعرض الأكواد حسب الفرقة والحالة ثم صدّر نفس النتائج PDF</span>
                  </div>
                </div>
                <div className="codes-control-row">
                  <select className="gold-input" value={codesYearFilter} onChange={e => setCodesYearFilter(e.target.value)}>
                    <option value="الكل">كل الفرق</option>
                    <option value="الفرقة الأولى">الفرقة الأولى</option>
                    <option value="الفرقة الثانية">الفرقة الثانية</option>
                    <option value="الفرقة الثالثة">الفرقة الثالثة</option>
                    <option value="الفرقة الرابعة">الفرقة الرابعة</option>
                  </select>
                  <select className="gold-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="all">كل الحالات</option>
                    <option value="available">متاح</option>
                    <option value="used">مستخدم</option>
                    <option value="paused">موقوف مؤقتاً</option>
                  </select>
                  <button onClick={exportCodesToPdf} className="btn-secondary"><i className="fas fa-file-pdf"></i> تصدير نتائج الفلتر PDF</button>
                  <button onClick={deleteAllCodes} className="btn-red-solid"><i className="fas fa-exclamation-triangle"></i> حذف الكل</button>
                </div>
              </div>
            </div>

            <div className="codes-summary">
              <div><strong>{codesDB.length}</strong><span>إجمالي الأكواد</span></div>
              <div><strong>{codesDB.filter((code) => getCodeStatus(code) === 'available').length}</strong><span>متاح</span></div>
              <div><strong>{codesDB.filter((code) => getCodeStatus(code) === 'used').length}</strong><span>مستخدم</span></div>
              <div><strong>{codesDB.filter((code) => getCodeStatus(code) === 'paused').length}</strong><span>موقوف</span></div>
              <div><strong>{visibleCodes.length}</strong><span>نتيجة الفلتر</span></div>
            </div>

            <div className="codes-visibility-bar">
              <div>
                <strong>{showCodes ? 'قائمة الأكواد مفتوحة الآن' : 'قائمة الأكواد مخفية لتنظيم الصفحة'}</strong>
                <span>التوليد وفلترة الفرقة وتصدير PDF متاحين بدون فتح القائمة.</span>
              </div>
              <button className={showCodes ? "btn-red-solid" : "btn-secondary"} onClick={() => setShowCodes((current) => !current)}>
                <i className={`fas ${showCodes ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                {showCodes ? 'إخفاء قائمة الأكواد' : 'إظهار قائمة الأكواد'}
              </button>
            </div>

            {showCodes && (
              <>
                <div className="bulk-actions">
                  <button className="btn-secondary" onClick={() => setSelectedCodeIds(visibleCodes.map((code) => code.id))}><i className="fas fa-check-double"></i> تحديد نتائج الفلتر</button>
                  <button className="btn-secondary" onClick={clearSelectedCodes}><i className="fas fa-times"></i> مسح التحديد</button>
                  <button className="btn-secondary" disabled={!selectedCodeIds.length} onClick={exportSelectedCodesToPdf}><i className="fas fa-file-pdf"></i> تصدير المحدد ({selectedCodeIds.length})</button>
                  <button className="btn-secondary" disabled={!selectedCodeIds.length} onClick={() => updateSelectedCodesPaused(true)}><i className="fas fa-pause"></i> إيقاف المحدد</button>
                  <button className="btn-secondary" disabled={!selectedCodeIds.length} onClick={() => updateSelectedCodesPaused(false)}><i className="fas fa-play"></i> تفعيل المحدد</button>
                  <button className="btn-red-solid" disabled={!selectedCodeIds.length} onClick={deleteSelectedCodes}><i className="fas fa-trash"></i> حذف المحدد</button>
                  <span>{selectedVisibleCodesCount} محدد من النتائج الحالية</span>
                </div>

                <div className="codes-grid">
                  {visibleCodes.map(c => {
                    const codeStatus = getCodeStatus(c);
                    return (
                    <div key={c.id} className={`code-card ${codeStatus}`}>
                      <div className="code-card-top">
                        <label className="code-select">
                          <input type="checkbox" checked={selectedCodeIds.includes(c.id)} onChange={() => toggleCodeSelection(c.id)} />
                          <span className={`code-status ${codeStatus}`}>{codeStatus === 'paused' ? 'موقوف مؤقتاً' : codeStatus === 'used' ? 'مستخدم' : 'متاح'}</span>
                        </label>
                        <div className="code-card-actions">
                          <button onClick={() => copyText(c.code, "تم نسخ الكود")} title="نسخ الكود"><i className="fas fa-copy"></i></button>
                          <button onClick={() => updateSingleCodePaused(c, codeStatus !== 'paused')} title={codeStatus === 'paused' ? 'تفعيل الكود' : 'إيقاف مؤقت'}><i className={`fas ${codeStatus === 'paused' ? 'fa-play' : 'fa-pause'}`}></i></button>
                          <button onClick={() => handleDeleteSingleCode(c.id, c.usedById)} title="حذف الكود"><i className="fas fa-times"></i></button>
                        </div>
                      </div>
                      <div className="code-value">{c.code}</div>
                      <div className="code-year">{c.year || 'بدون فرقة'}</div>
                      {codeStatus === 'paused' ? (
                        <div className="code-paused-note">الكود موقوف مؤقتاً ولا يفتح المحتوى</div>
                      ) : c.isUsed ? (
                        <div className="code-used-by">
                          <span>مستخدم بواسطة</span>
                          <strong>{c.usedByName || c.usedBy || 'طالب غير معروف'}</strong>
                          <button onClick={() => { setActiveTab('students'); setSearchTerm(c.usedByName || c.usedBy || ''); }}>عرض الطالب</button>
                        </div>
                      ) : <div className="code-available-note">جاهز للاستخدام</div>}
                    </div>
                  );})}
                  {visibleCodes.length === 0 && (
                    <div className="empty-state">لا توجد أكواد مطابقة للفلاتر الحالية.</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <button className="ai-assistant-fab" onClick={() => setIsAiAssistantOpen((current) => !current)} title="مساعد الأدمن">
          <i className="fas fa-robot"></i>
          {!isAiAssistantOpen && <span>AI</span>}
        </button>

        {isAiAssistantOpen && (
          <div className="ai-assistant-panel">
            <div className="ai-assistant-head">
              <div>
                <strong>مساعد الأدمن الذكي</strong>
                <span>أسئلة جاهزة وتحكم سريع في المنصة</span>
              </div>
              <button onClick={() => setIsAiAssistantOpen(false)}><i className="fas fa-times"></i></button>
            </div>

            <div className="ai-assistant-metrics">
              <div><strong>{studentsDB.length}</strong><span>طلاب</span></div>
              <div><strong>{codesDB.filter(c => !c.isUsed).length}</strong><span>أكواد متاحة</span></div>
              <div><strong>{pendingSupportRequests.length}</strong><span>دعم</span></div>
            </div>

            <div className="ai-quick-prompts">
              {aiQuickPrompts.map((prompt) => (
                <button key={prompt} onClick={() => sendAiMessage(prompt)}>{prompt}</button>
              ))}
            </div>

            <div className="ai-messages">
              {aiMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`ai-message ${message.role}`}>
                  <p>{message.text}</p>
                  {message.actionLabel && (
                    <button onClick={message.action}>
                      <i className="fas fa-arrow-left"></i> {message.actionLabel}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="ai-input-row">
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendAiMessage();
                }}
                placeholder="اكتب سؤال للأدمن..."
              />
              <button onClick={() => sendAiMessage()}><i className="fas fa-paper-plane"></i></button>
            </div>
          </div>
        )}

        {selectedStudentProfile && (
          <div className="modal-overlay" onClick={() => setSelectedStudentId(null)}>
            <div className="modal-card student-profile-modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setSelectedStudentId(null)}><i className="fas fa-times"></i></button>

              <div className="student-profile-head">
                <div className="student-avatar-large">{selectedStudentProfile.name?.[0] || selectedStudentProfile.username?.[0] || '?'}</div>
                <div>
                  <span className={`code-status ${selectedStudentProfile.isBanned ? 'used' : 'available'}`}>{selectedStudentProfile.isBanned ? 'محظور' : 'نشط'}</span>
                  <h3>{selectedStudentProfile.name || 'طالب بدون اسم'}</h3>
                  <p>@{selectedStudentProfile.username || 'بدون اسم مستخدم'} • {selectedStudentProfile.phone || 'لا يوجد رقم'}</p>
                </div>
              </div>

              <div className="profile-stats-grid">
                <div><strong>{selectedStudentProfile.year || 'غير محدد'}</strong><span>فرقة التسجيل</span></div>
                <div><strong>{selectedStudentProfile.codeYear || selectedStudentProfile.accessYear || 'غير مفعل'}</strong><span>فرقة الوصول</span></div>
                <div><strong>{selectedStudentProfile.isSubscribed ? 'مفعل' : 'غير مفعل'}</strong><span>الاشتراك</span></div>
                <div><strong>{selectedStudentLessons.length}</strong><span>محاضرات متاحة</span></div>
              </div>

              <div className="profile-sections">
                <section>
                  <div className="profile-section-title"><i className="fas fa-ticket-alt"></i> الكود والاشتراك</div>
                  <div className="profile-info-list">
                    <span><strong>الكود:</strong> {selectedStudentProfile.usedCode || selectedStudentProfile.pendingCode || 'لا يوجد'}</span>
                    <span><strong>حالة المراجعة:</strong> {selectedStudentProfile.codeReviewStatus || 'لا يوجد'}</span>
                    <span><strong>كود مستخدم في قاعدة الأكواد:</strong> {selectedStudentCode?.code || 'غير مرتبط'}</span>
                  </div>
                </section>

                <section>
                  <div className="profile-section-title"><i className="fas fa-mobile-alt"></i> الجهاز</div>
                  <div className="profile-info-list">
                    <span><strong>النوع:</strong> {selectedStudentProfile.deviceType || 'غير معروف'}</span>
                    <span><strong>Device ID:</strong> {selectedStudentProfile.deviceId ? 'مسجل' : 'غير مسجل'}</span>
                    <span><strong>ملاحظات:</strong> {selectedStudentProfile.banReason || selectedStudentProfile.deviceInfo || 'لا توجد'}</span>
                  </div>
                </section>
              </div>

              <div className="profile-actions">
                <button className="btn-action btn-cyan" onClick={() => confirmAction('تصفير الجهاز؟', '', () => updateDoc(doc(db, "students", selectedStudentProfile.id), { deviceId: null, deviceType: null }))}><i className="fas fa-sync-alt"></i> تصفير الجهاز</button>
                <button className={`btn-action ${selectedStudentProfile.isBanned ? 'btn-green' : 'btn-orange'}`} onClick={() => updateDoc(doc(db, "students", selectedStudentProfile.id), { isBanned: !selectedStudentProfile.isBanned, banReason: !selectedStudentProfile.isBanned ? 'تم حظر الحساب بواسطة الإدارة' : '' })}><i className={`fas ${selectedStudentProfile.isBanned ? 'fa-unlock' : 'fa-ban'}`}></i> {selectedStudentProfile.isBanned ? 'فك الحظر' : 'حظر الطالب'}</button>
                <button className="btn-action btn-red" onClick={() => confirmAction('حذف الطالب نهائياً؟', '', async () => { await deleteDoc(doc(db, "students", selectedStudentProfile.id)); setSelectedStudentId(null); }, true)}><i className="fas fa-trash"></i> حذف</button>
              </div>

              <div className="profile-activity">
                <div className="profile-section-title"><i className="fas fa-clock"></i> آخر النشاطات</div>
                {selectedStudentLogs.length ? selectedStudentLogs.map((log) => (
                  <div key={log.id} className="profile-log-row">
                    <span className={`ops-status ${(log.action || '').includes('حظر') ? 'danger' : 'success'}`}></span>
                    <div>
                      <strong>{log.action || 'حدث غير معروف'}</strong>
                      <small>{log.time?.toDate?.().toLocaleString('ar-EG') || 'وقت غير متاح'}</small>
                    </div>
                  </div>
                )) : <div className="ops-empty">لا توجد نشاطات مسجلة لهذا الطالب.</div>}
              </div>
            </div>
          </div>
        )}

        {statsLesson && (
          <div className="modal-overlay" onClick={() => setStatsLesson(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setStatsLesson(null)}><i className="fas fa-times"></i></button>
              <h3>{statsLesson.title}</h3>
              <p>{statsLesson.subject} • {statsLesson.chapterName || 'بدون فصل'}</p>
              <div className="stats-grid">
                <div><strong>{statsLesson.views || 0}</strong><span>مشاهدة</span></div>
                <div><strong>{statsLesson.isActive === false ? 'مخفي' : 'ظاهر'}</strong><span>الحالة</span></div>
                <div><strong>{statsLesson.pdfUrl ? 'موجود' : 'غير موجود'}</strong><span>ملف PDF</span></div>
                <div><strong>Bunny</strong><span>نوع الفيديو</span></div>
              </div>
              <button className="btn-primary" onClick={() => { handleEditLesson(statsLesson); setStatsLesson(null); }}>تعديل المحاضرة</button>
            </div>
          </div>
        )}

        {previewLesson && (
          <div className="modal-overlay" onClick={() => setPreviewLesson(null)}>
            <div className="modal-card lesson-preview-modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setPreviewLesson(null)}><i className="fas fa-times"></i></button>
              <span className="code-status available">معاينة قبل النشر</span>
              <h3>{previewLesson.title}</h3>
              <p>{previewLesson.description || 'لا يوجد وصف مكتوب لهذه المحاضرة.'}</p>
              <div className="preview-meta">
                <div><strong>{previewLesson.year}</strong><span>السنة</span></div>
                <div><strong>{previewLesson.semester}</strong><span>الترم</span></div>
                <div><strong>{previewLesson.subject}</strong><span>المادة</span></div>
                <div><strong>{previewLesson.chapterName}</strong><span>الشابتر</span></div>
              </div>
              <div className="preview-checks">
                <span className={previewLesson.url ? 'ok' : 'warn'}><i className={`fas ${previewLesson.url ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i> {previewLesson.url ? 'رابط الفيديو موجود' : 'لا يوجد رابط فيديو'}</span>
                <span className={previewLesson.pdfUrl ? 'ok' : 'warn'}><i className={`fas ${previewLesson.pdfUrl ? 'fa-check-circle' : 'fa-info-circle'}`}></i> {previewLesson.pdfUrl ? 'ملف PDF موجود' : 'بدون ملف PDF'}</span>
                <span className={previewLesson.isActive ? 'ok' : 'warn'}><i className={`fas ${previewLesson.isActive ? 'fa-eye' : 'fa-eye-slash'}`}></i> {previewLesson.isActive ? 'ستظهر للطلاب' : 'ستحفظ كمخفية'}</span>
              </div>
              <button className="btn-primary" onClick={() => { setPreviewLesson(null); saveLesson(); }}>اعتماد ونشر</button>
            </div>
          </div>
        )}
      </main>

      <style>{`
        /* Custom Scrollbar for mobile nav */
        * { box-sizing: border-box; }
        .custom-scrollbar::-webkit-scrollbar { height: 4px; width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: ${theme.surface}; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: ${theme.borderSoft}; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${theme.accent}; }
        .desktop-sidebar { background: ${isLightTheme ? `linear-gradient(180deg, ${theme.surface}, #F9FAFC)` : `linear-gradient(180deg, ${theme.surface}, ${theme.bg})`} !important; box-shadow: ${isLightTheme ? '-8px 0 28px rgba(15,23,42,0.06)' : '-12px 0 36px rgba(0,0,0,0.14)'}; overflow: hidden; }
        .desktop-sidebar::before { content: ''; position: absolute; inset: 0 0 auto; height: 210px; background: radial-gradient(circle at 70% 0%, ${theme.accent}22, transparent 58%); pointer-events: none; }
        .sidebar-brand { position: relative; padding: 18px; border-bottom: 1.5px solid ${visibleBorder}; display: grid; gap: 14px; }
        .sidebar-brand.collapsed { padding: 16px 10px; place-items: center; }
        .brand-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .sidebar-brand.collapsed .brand-main { justify-content: center; }
        .brand-logo-frame { width: 72px; height: 72px; border-radius: 22px; padding: 6px; background: ${theme.gradient}; box-shadow: ${isLightTheme ? '0 12px 28px rgba(154,95,0,0.16)' : '0 16px 34px rgba(0,0,0,0.32)'}; flex-shrink: 0; }
        .sidebar-brand.collapsed .brand-logo-frame { width: 54px; height: 54px; border-radius: 18px; padding: 4px; }
        .admin-logo { width: 100%; height: 100%; object-fit: cover; border-radius: 17px; border: 1px solid ${theme.surface}; background: ${theme.surface}; display: block; }
        .brand-copy { min-width: 0; text-align: right; }
        .brand-copy span { display: block; color: ${theme.accent}; font-size: 11px; font-weight: 900; text-transform: uppercase; line-height: 1; }
        .brand-copy strong { display: block; color: ${theme.text}; font-size: 18px; line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .brand-copy small { display: block; color: ${theme.subText}; font-size: 11px; line-height: 1.6; }
        .sidebar-collapse-btn { position: absolute; top: 14px; left: 14px; width: 34px; height: 34px; border-radius: 12px; border: 1.5px solid ${visibleBorder}; background: ${theme.surfaceAlt}; color: ${theme.text}; cursor: pointer; display: grid; place-items: center; transition: 0.2s ease; z-index: 2; }
        .sidebar-collapse-btn:hover { border-color: ${theme.accent}; color: ${theme.accent}; transform: translateY(-1px); }
        .sidebar-brand.collapsed .sidebar-collapse-btn { position: static; order: 2; }
        .brand-status { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .brand-status span { min-height: 34px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; background: ${theme.surfaceAlt}; color: ${theme.subText}; border: 1.5px solid ${visibleBorder}; font-size: 11px; font-weight: 900; }
        .brand-status span:first-child { color: ${theme.accent}; background: ${theme.accent}12; border-color: ${theme.accent}33; }
        .brand-status span:last-child i { color: ${theme.success}; font-size: 8px; }
        .brand-theme { display: grid; }
        .brand-theme button { width: 100%; justify-content: center; }
        
        .video-container-fixed { width: 100%; aspect-ratio: 16/9; background: #000; overflow: hidden; position: relative; border-radius: 20px 20px 0 0; }
        .inline-video { width: 100%; height: 100%; object-fit: cover; }
        .video-thumb-alt { width: 100%; height: 100%; border: none; background: linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url('https://img.freepik.com/free-vector/abstract-gold-background_23-2148390518.jpg'); background-size: cover; display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative; }
        .play-btn-circle { width: 50px; height: 50px; background: ${theme.accent}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: ${theme.buttonText}; font-size: 20px; box-shadow: 0 0 20px ${theme.accent}55; }
        
        .gold-input { background: ${theme.surfaceAlt}; color: ${theme.text}; border: 1px solid ${theme.borderSoft}; padding: 12px 14px; border-radius: 12px; outline: none; width: 100%; font-family: 'Cairo'; transition: 0.18s ease; min-height: 46px; }
        .gold-input:focus { border-color: ${theme.accent}; box-shadow: 0 0 0 3px ${theme.accent}18; }
        .gold-input::placeholder { color: ${theme.muted}; }
        .btn-primary { background: ${theme.gradient}; color: ${theme.buttonText}; border: none; padding: 13px 16px; border-radius: 12px; font-weight: 900; cursor: pointer; width: 100%; transition: 0.2s ease; min-height: 46px; box-shadow: 0 10px 22px ${theme.accent}22; }
        .btn-primary:hover, .quick-action:hover, .btn-secondary:hover, .btn-action:hover, .icon-btn:hover { transform: translateY(-1px); filter: brightness(1.05); }
        .btn-secondary { background: ${theme.surfaceAlt}; color: ${theme.text}; border: 1px solid ${theme.borderSoft}; padding: 12px 20px; border-radius: 12px; cursor: pointer; transition: 0.2s ease; }
        .btn-red-solid { background: ${theme.danger}; color: #fff; border: none; padding: 12px 20px; border-radius: 12px; font-weight: bold; cursor: pointer; }
        .page-head { position: sticky; top: 0; z-index: 80; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; margin: 0 auto 22px; max-width: 1500px; background: ${theme.surface}F2; backdrop-filter: blur(14px); border: 1px solid ${theme.borderSoft}; border-radius: 18px; box-shadow: ${isLightTheme ? '0 16px 38px rgba(15,23,42,0.07)' : '0 16px 40px rgba(0,0,0,0.12)'}; flex-wrap: wrap; }
        .page-head h1 { margin: 4px 0 6px; color: ${theme.text}; font-size: 26px; line-height: 1.15; }
        .page-head p { margin: 0; color: ${theme.subText}; font-size: 13px; }
        .page-kicker { color: ${theme.accent}; font-size: 11px; font-weight: 900; letter-spacing: 0; text-transform: uppercase; }
        .page-head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .global-search { position: relative; flex: 1 1 320px; max-width: 520px; display: flex; align-items: center; gap: 10px; background: ${theme.surfaceAlt}; border: 1.5px solid ${visibleBorder}; border-radius: 16px; padding: 0 12px; min-height: 48px; }
        .global-search > i { color: ${theme.accent}; }
        .global-search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: ${theme.text}; font-family: 'Cairo'; font-weight: 800; }
        .global-search input::placeholder { color: ${theme.muted}; }
        .global-search > button { border: none; background: ${theme.danger}12; color: ${theme.danger}; width: 30px; height: 30px; border-radius: 10px; cursor: pointer; }
        .global-results { position: absolute; top: calc(100% + 8px); right: 0; left: 0; z-index: 120; background: ${theme.surface}; border: 1.5px solid ${visibleBorder}; border-radius: 16px; padding: 8px; box-shadow: ${isLightTheme ? '0 18px 40px rgba(15,23,42,0.12)' : '0 18px 50px rgba(0,0,0,0.35)'}; display: grid; gap: 6px; }
        .global-results button { border: 1px solid transparent; background: transparent; color: ${theme.text}; border-radius: 12px; padding: 10px; display: flex; align-items: center; gap: 10px; text-align: right; cursor: pointer; font-family: 'Cairo'; }
        .global-results button:hover { background: ${theme.surfaceAlt}; border-color: ${theme.accent}55; }
        .result-icon { width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; background: ${theme.accent}16; color: ${theme.accent}; }
        .global-results strong, .global-results small { display: block; }
        .global-results small { color: ${theme.subText}; font-size: 11px; margin-top: 3px; }
        .quick-action { border: 1px solid ${theme.accent}55; background: ${theme.accent}18; color: ${theme.accent}; min-height: 42px; padding: 0 14px; border-radius: 12px; font-family: 'Cairo'; font-weight: 900; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: 0.2s ease; }
        .quick-action.ghost { border-color: ${theme.borderSoft}; background: ${theme.surfaceAlt}; color: ${theme.text}; }
        .mini-pill { min-width: 78px; padding: 8px 12px; border-radius: 14px; background: ${theme.surfaceAlt}; border: 1px solid ${theme.borderSoft}; display: grid; gap: 2px; text-align: center; }
        .mini-pill span { color: ${theme.subText}; font-size: 11px; }
        .mini-pill strong { color: ${theme.text}; font-size: 18px; line-height: 1; }
        .stats-grid-shell { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 18px; }
        .stat-card { background: linear-gradient(180deg, ${theme.surface} 0%, ${theme.surfaceAlt} 100%); padding: 18px; border-radius: 16px; text-align: right; border: 1px solid ${theme.borderSoft}; transition: 0.25s ease; box-shadow: ${isLightTheme ? '0 12px 28px rgba(15,23,42,0.06)' : '0 12px 25px rgba(0,0,0,0.08)'}; display: grid; gap: 8px; min-height: 142px; }
        .stat-card:hover { border-color: ${theme.accent}; transform: translateY(-3px); box-shadow: ${isLightTheme ? '0 18px 34px rgba(15,23,42,0.09)' : '0 16px 30px rgba(0,0,0,0.12)'}; }
        .stat-card h3 { color: ${theme.text}; font-size: 32px; margin: 0; line-height: 1; }
        .stat-card p { color: ${theme.subText}; margin: 0; font-weight: 800; }
        .stat-icon { width: 42px; height: 42px; border-radius: 14px; display: grid; place-items: center; background: ${theme.accent}18; color: ${theme.accent}; border: 1px solid ${theme.accent}33; }
        .stat-icon.danger { background: ${theme.danger}18; color: ${theme.danger}; border-color: ${theme.danger}33; }
        .alert-stat, .danger-stat { cursor: pointer; text-align: right; }
        .alert-stat { background: linear-gradient(135deg, ${theme.surface}, ${theme.accent}12); }
        .danger-stat { background: linear-gradient(135deg, ${theme.surface}, ${theme.danger}12); }
        .admin-hero { background: ${theme.panelGradient}; border: 1px solid ${theme.borderSoft}; border-radius: 20px; padding: 22px; margin-bottom: 18px; display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; box-shadow: ${isLightTheme ? '0 16px 34px rgba(15,23,42,0.07)' : '0 18px 36px rgba(0,0,0,0.10)'}; }
        .admin-hero-compact { padding: 18px 20px; margin-bottom: 18px; }
        .admin-hero h2 { margin: 0 0 8px; color: ${theme.accent}; font-size: 26px; }
        .admin-hero p { margin: 0; color: ${theme.subText}; line-height: 1.8; }
        .content-shell { max-width: 1480px; margin: 0 auto; display: grid; gap: 16px; }
        .content-hero { margin-bottom: 0; padding: 20px; background: linear-gradient(135deg, ${theme.surface}, ${theme.accent}0F); }
        .content-hero-pills { display: flex; gap: 10px; flex-wrap: wrap; }
        .content-control-panel { background: ${theme.surface}; border: 1.5px solid ${visibleBorder}; border-radius: 22px; padding: 16px; display: grid; gap: 14px; box-shadow: ${isLightTheme ? '0 14px 32px rgba(15,23,42,0.06)' : '0 16px 34px rgba(0,0,0,0.12)'}; }
        .content-flow-panel { min-height: 520px; align-content: start; }
        .content-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 4px 2px 12px; border-bottom: 1.5px solid ${visibleBorder}; }
        .content-panel-head strong, .content-panel-head span { display: block; }
        .content-panel-head strong { color: ${theme.text}; font-size: 18px; margin-bottom: 4px; }
        .content-panel-head span { color: ${theme.subText}; font-size: 12px; }
        .content-flow-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .content-breadcrumbs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px; background: ${theme.surfaceAlt}; border: 1.5px solid ${visibleBorder}; border-radius: 16px; }
        .content-breadcrumbs button { border: 1px solid ${theme.borderSoft}; background: ${theme.surface}; color: ${theme.subText}; border-radius: 999px; padding: 8px 13px; cursor: pointer; font-family: 'Cairo'; font-weight: 900; }
        .content-breadcrumbs button.active { background: ${theme.accent}; border-color: ${theme.accent}; color: ${theme.buttonText}; }
        .content-screen { display: grid; gap: 14px; animation: contentSlide 0.22s ease both; }
        @keyframes contentSlide { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
        .content-subject-grid, .content-chapter-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
        .content-subject-card, .content-chapter-card { background: ${theme.surfaceAlt}; border: 1.5px solid ${visibleBorder}; border-radius: 18px; padding: 12px; display: grid; gap: 10px; transition: 0.18s ease; }
        .content-subject-card:hover, .content-chapter-card:hover { border-color: ${theme.accent}66; transform: translateY(-1px); box-shadow: 0 12px 24px ${theme.accent}12; }
        .legacy-chapter-card { border-style: dashed; background: linear-gradient(135deg, ${theme.surfaceAlt}, ${theme.info}0F); }
        .legacy-chapter-card .chapter-select-btn span { background: ${theme.info}16; color: ${theme.info}; border-color: ${theme.info}33; }
        .flow-card { min-height: 126px; }
        .content-section-hero { margin-top: 24px; border-style: dashed; }
        .hero-pill { background: ${theme.accent}22; color: ${theme.accent}; border: 1px solid ${theme.accent}55; border-radius: 999px; padding: 10px 18px; font-weight: 900; }
        .requests-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
        .request-card { background: ${theme.surface}; border: 1px solid ${theme.borderSoft}; border-radius: 20px; padding: 18px; display: grid; gap: 16px; box-shadow: ${isLightTheme ? '0 14px 30px rgba(15,23,42,0.07)' : '0 16px 28px rgba(0,0,0,0.10)'}; }
        .request-top { display: flex; align-items: center; gap: 12px; }
        .request-avatar { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: ${theme.accent}18; color: ${theme.accent}; border: 1px solid ${theme.accent}55; font-weight: 900; font-size: 22px; }
        .request-top h3 { margin: 0 0 4px; color: ${theme.text}; }
        .request-top p { margin: 0; color: ${theme.subText}; font-size: 13px; }
        .request-details { display: grid; gap: 8px; color: ${theme.subText}; font-size: 13px; }
        .request-details span { display: flex; align-items: center; gap: 8px; }
        .request-details i { color: ${theme.accent}; width: 18px; }
        .request-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .resolved-requests-toggle { width: 100%; margin-top: 20px; padding: 15px 18px; border-radius: 16px; border: 1.5px solid ${theme.success}55; background: ${theme.success}12; color: ${theme.success}; display: flex; align-items: center; justify-content: space-between; gap: 12px; font: inherit; font-weight: 900; cursor: pointer; transition: 0.2s ease; }
        .resolved-requests-toggle:hover { background: ${theme.success}1F; border-color: ${theme.success}; transform: translateY(-1px); }
        .resolved-requests-toggle span { display: inline-flex; align-items: center; gap: 9px; }
        .resolved-requests-list { margin-top: 14px; animation: fadeIn 0.22s ease; }
        .resolved-request-card { border-color: ${theme.success}44; opacity: 0.92; }
        .resolved-request-card .request-avatar { color: ${theme.success}; background: ${theme.success}14; border-color: ${theme.success}44; }
        .ops-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 18px; }
        .insights-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; margin-bottom: 18px; }
        .insight-card { background: ${theme.surface}; border: 1.5px solid ${visibleBorder}; border-radius: 18px; padding: 16px; box-shadow: ${isLightTheme ? '0 12px 28px rgba(15,23,42,0.06)' : '0 14px 30px rgba(0,0,0,0.10)'}; }
        .activity-chart { height: 170px; display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; align-items: end; padding-top: 12px; }
        .activity-day { height: 100%; display: grid; grid-template-rows: 1fr auto; gap: 8px; align-items: end; text-align: center; color: ${theme.subText}; font-size: 11px; font-weight: 900; }
        .activity-bar { width: 100%; min-height: 8px; border-radius: 999px 999px 6px 6px; background: ${theme.gradient}; border: 1px solid ${theme.accent}55; box-shadow: 0 8px 18px ${theme.accent}18; }
        .insight-list { display: grid; gap: 10px; }
        .insight-list div { display: grid; grid-template-columns: 38px auto 1fr; align-items: center; gap: 10px; background: ${theme.surfaceAlt}; border: 1.5px solid ${visibleBorder}; border-radius: 14px; padding: 11px; }
        .insight-list i { color: ${theme.accent}; }
        .insight-list strong { color: ${theme.text}; font-size: 16px; }
        .insight-list span { color: ${theme.subText}; font-size: 12px; }
        .ops-card { background: ${theme.surface}; border: 1px solid ${theme.borderSoft}; border-radius: 18px; padding: 16px; min-height: 220px; box-shadow: ${isLightTheme ? '0 12px 28px rgba(15,23,42,0.06)' : '0 14px 30px rgba(0,0,0,0.10)'}; }
        .ops-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .ops-head h3 { margin: 0; color: ${theme.text}; font-size: 16px; }
        .ops-head button { border: none; background: ${theme.accent}16; color: ${theme.accent}; border-radius: 999px; padding: 7px 10px; font-family: 'Cairo'; font-weight: 900; cursor: pointer; }
        .ops-row { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-top: 1px solid ${theme.borderSoft}; }
        .ops-row:first-of-type { border-top: none; }
        .ops-row strong { display: block; color: ${theme.text}; font-size: 13px; margin-bottom: 3px; }
        .ops-row small { display: block; color: ${theme.subText}; font-size: 11px; line-height: 1.5; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ops-dot, .ops-status { width: 10px; height: 10px; border-radius: 999px; flex-shrink: 0; background: ${theme.accent}; box-shadow: 0 0 0 4px ${theme.accent}18; }
        .ops-status.success { background: ${theme.success}; box-shadow: 0 0 0 4px ${theme.success}18; }
        .ops-status.danger { background: ${theme.danger}; box-shadow: 0 0 0 4px ${theme.danger}18; }
        .ops-empty { color: ${theme.muted}; border: 1px dashed ${theme.borderSoft}; background: ${theme.surfaceAlt}; border-radius: 14px; padding: 22px; text-align: center; margin-top: 12px; }
        .empty-state { grid-column: 1 / -1; background: ${theme.surface}; border: 1px dashed ${theme.borderSoft}; color: ${theme.subText}; border-radius: 18px; padding: 30px; text-align: center; }
        .codes-toolbar { display: grid; grid-template-columns: 0.9fr 1.35fr; gap: 16px; margin-bottom: 16px; }
        .codes-panel { background: ${theme.surface}; border: 1px solid ${theme.borderSoft}; border-radius: 18px; padding: 16px; box-shadow: ${isLightTheme ? '0 12px 28px rgba(15,23,42,0.06)' : '0 14px 30px rgba(0,0,0,0.10)'}; }
        .codes-panel-title { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
        .codes-panel-title i { width: 42px; height: 42px; border-radius: 14px; display: grid; place-items: center; background: ${theme.accent}18; color: ${theme.accent}; border: 1px solid ${theme.accent}33; }
        .codes-panel-title strong { display: block; color: ${theme.text}; font-size: 15px; margin-bottom: 3px; }
        .codes-panel-title span { display: block; color: ${theme.subText}; font-size: 12px; }
        .codes-control-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; align-items: center; }
        .codes-summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px; }
        .codes-summary div { background: ${theme.surface}; border: 1px solid ${theme.borderSoft}; border-radius: 16px; padding: 14px; text-align: center; }
        .codes-summary strong { display: block; color: ${theme.accent}; font-size: 24px; line-height: 1; margin-bottom: 6px; }
        .codes-summary span { color: ${theme.subText}; font-size: 12px; font-weight: 800; }
        .codes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
        .bulk-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; background: ${theme.surface}; border: 1.5px solid ${visibleBorder}; border-radius: 16px; padding: 12px; }
        .bulk-actions span { color: ${theme.subText}; font-size: 12px; font-weight: 900; margin-inline-start: auto; }
        .bulk-actions button:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; }
        .codes-visibility-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; background: ${theme.surface}; border: 1.5px solid ${visibleBorder}; border-radius: 16px; padding: 13px; box-shadow: ${isLightTheme ? '0 10px 24px rgba(15,23,42,0.05)' : '0 12px 24px rgba(0,0,0,0.08)'}; }
        .codes-visibility-bar div { display: grid; gap: 3px; text-align: right; }
        .codes-visibility-bar strong { color: ${theme.text}; font-size: 14px; }
        .codes-visibility-bar span { color: ${theme.subText}; font-size: 12px; font-weight: 800; }
        .code-card { background: ${theme.surface}; border: 1px solid ${theme.borderSoft}; border-radius: 18px; padding: 15px; text-align: right; display: grid; gap: 10px; box-shadow: ${isLightTheme ? '0 10px 24px rgba(15,23,42,0.06)' : '0 12px 24px rgba(0,0,0,0.08)'}; transition: 0.2s ease; }
        .code-card:hover { transform: translateY(-2px); border-color: ${theme.accent}66; }
        .code-card.available { background: linear-gradient(180deg, ${theme.surface}, ${theme.success}08); }
        .code-card.used { opacity: 0.86; }
        .code-card.paused { background: linear-gradient(180deg, ${theme.surface}, ${theme.danger}08); border-color: ${theme.danger}55; opacity: 0.88; }
        .code-card-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .code-select { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
        .code-select input { width: 16px; height: 16px; accent-color: ${theme.accent}; }
        .code-card-actions { display: inline-flex; align-items: center; gap: 6px; }
        .code-card-actions button { border: none; background: ${theme.surfaceAlt}; color: ${theme.text}; width: 30px; height: 30px; border-radius: 10px; cursor: pointer; }
        .code-card-actions button:disabled { opacity: 0.42; cursor: not-allowed; filter: grayscale(0.7); }
        .code-card-actions button:last-child { background: ${theme.danger}12; color: ${theme.danger}; }
        .code-status { border-radius: 999px; padding: 5px 10px; font-size: 11px; font-weight: 900; }
        .code-status.available { color: ${theme.success}; background: ${theme.success}14; border: 1px solid ${theme.success}33; }
        .code-status.used { color: ${theme.info}; background: ${theme.info}14; border: 1px solid ${theme.info}33; }
        .code-status.paused { color: ${theme.danger}; background: ${theme.danger}14; border: 1px solid ${theme.danger}33; }
        .code-value { color: ${theme.text}; font-size: 22px; font-weight: 900; letter-spacing: 1px; direction: ltr; text-align: center; background: ${theme.surfaceAlt}; border: 1px solid ${theme.borderSoft}; border-radius: 14px; padding: 12px; }
        .code-value.masked { color: ${theme.muted}; letter-spacing: 4px; user-select: none; background: repeating-linear-gradient(135deg, ${theme.surfaceAlt}, ${theme.surfaceAlt} 8px, ${theme.borderSoft} 9px, ${theme.surfaceAlt} 18px); }
        .code-year { color: ${theme.subText}; font-size: 12px; font-weight: 800; text-align: center; }
        .code-used-by { background: ${theme.info}10; border: 1px solid ${theme.info}22; border-radius: 14px; padding: 10px; display: grid; gap: 5px; }
        .code-used-by span { color: ${theme.subText}; font-size: 11px; }
        .code-used-by strong { color: ${theme.text}; font-size: 13px; }
        .code-used-by button { border: none; background: transparent; color: ${theme.info}; padding: 0; text-align: right; font-family: 'Cairo'; font-weight: 900; cursor: pointer; }
        .code-available-note { color: ${theme.success}; font-size: 12px; font-weight: 900; text-align: center; padding: 8px; border-radius: 12px; background: ${theme.success}10; }
        .code-paused-note { color: ${theme.danger}; font-size: 12px; font-weight: 900; text-align: center; padding: 8px; border-radius: 12px; background: ${theme.danger}10; border: 1px solid ${theme.danger}22; }
        .lesson-card { background: ${theme.surface}; border-radius: 20px; overflow: hidden; position: relative; }
        .hidden-label { position: absolute; top: 10px; left: 10px; background: ${theme.danger}; color: ${theme.buttonText}; padding: 4px 10px; border-radius: 5px; font-size: 10px; font-weight: bold; z-index: 10; }
        .nav-btn { background: transparent; border: 1px solid transparent; color: ${theme.muted}; cursor: pointer; display: flex; align-items: center; gap: 11px; border-radius: 16px; transition: 0.2s ease; flex-direction: row; position: relative; font-family: 'Cairo'; font-weight: 900; min-height: 52px; isolation: isolate; }
        .nav-btn::after { content: ''; position: absolute; inset: 8px auto 8px 8px; width: 4px; border-radius: 999px; background: transparent; transition: 0.2s ease; }
        .nav-icon-box { width: 34px; height: 34px; border-radius: 12px; display: grid; place-items: center; background: ${theme.surfaceAlt}; border: 1px solid ${visibleBorder}; color: inherit; flex-shrink: 0; transition: 0.2s ease; }
        .nav-btn:hover { background: ${theme.surfaceAlt}; color: ${theme.text}; }
        .nav-btn:hover .nav-icon-box { border-color: ${theme.accent}55; color: ${theme.accent}; transform: scale(1.03); }
        .nav-btn.active { background: ${theme.accent}16; color: ${theme.accent}; border-color: ${theme.accent}44; box-shadow: ${isLightTheme ? '0 10px 22px rgba(154,95,0,0.10)' : '0 12px 26px rgba(0,0,0,0.18)'}; }
        .nav-btn.active::after { background: ${theme.accent}; }
        .nav-btn.active .nav-icon-box { background: ${theme.accent}; color: ${theme.buttonText}; border-color: ${theme.accent}; box-shadow: 0 8px 18px ${theme.accent}33; }
        .sidebar-collapsed .nav-btn { justify-content: center; padding-inline: 0 !important; }
        .sidebar-collapsed .nav-btn::after { inset-inline-start: 4px; }
        .logout-btn:hover { background: ${theme.danger}12 !important; color: ${theme.danger} !important; }
        .logout-btn .nav-icon-box { color: ${theme.danger}; border-color: ${theme.danger}22; background: ${theme.danger}10; }
        .mobile-nav { padding-bottom: env(safe-area-inset-bottom); box-shadow: ${isLightTheme ? '0 -8px 24px rgba(15,23,42,0.08)' : '0 -5px 20px rgba(0,0,0,0.5)'}; }
        .mobile-nav .nav-btn { flex-direction: column; gap: 4px; flex: 1; min-height: 62px; border-radius: 14px; justify-content: center; }
        .mobile-nav .nav-icon-box { width: 32px; height: 32px; border-radius: 11px; }
        .mobile-nav .nav-btn::after { inset: auto 22% 2px; width: auto; height: 3px; }
        .upload-box { background: ${theme.surfaceAlt}; padding: 20px; border-radius: 15px; border: 1px dashed ${theme.borderSoft}; text-align: center; position: relative; transition: 0.3s; min-height: 148px; display: grid; place-items: center; align-content: center; gap: 7px; overflow: hidden; }
        .upload-box:hover { border-color: ${theme.accent}; transform: translateY(-1px); }
        .upload-box.uploaded { background: ${theme.success}10; border-color: ${theme.success}66; }
        .upload-box i { font-size: 26px; color: ${theme.accent}; }
        .upload-box:nth-child(2) i { color: ${theme.danger}; }
        .upload-box strong { color: ${theme.text}; font-size: 15px; }
        .upload-box span, .upload-box p { color: ${theme.subText}; font-size: 12px; margin: 0; }
        .upload-box.uploaded span { color: ${theme.success}; font-weight: 900; }
        .upload-box input { position: absolute; width: 100%; height: 100%; top: 0; left: 0; opacity: 0; cursor: pointer; }
        .status-active { color: ${theme.success}; background: ${theme.success}14; padding: 5px 12px; border-radius: 6px; font-size: 12px; }
        .status-banned { color: ${theme.danger}; background: ${theme.danger}14; padding: 5px 12px; border-radius: 6px; font-size: 12px; }
        .table-container { background: ${theme.surface}; border-radius: 18px; overflow-x: auto; border: 1px solid ${theme.borderSoft}; box-shadow: ${isLightTheme ? '0 10px 26px rgba(15,23,42,0.06)' : '0 12px 24px rgba(0,0,0,0.08)'}; }
        .table-container table { min-width: 760px; }
        .table-container th { position: sticky; top: 0; z-index: 2; padding: 13px 12px; font-size: 12px; text-align: center; white-space: nowrap; }
        .table-container td { padding: 13px 12px; font-size: 13px; color: ${theme.subText}; vertical-align: middle; }
        .table-container tbody tr { transition: 0.16s ease; }
        .table-container tbody tr:hover { background: ${theme.surfaceAlt} !important; }
        .btn-action { border: 1px solid transparent; padding: 9px 11px; border-radius: 10px; cursor: pointer; transition: 0.2s; font-family: 'Cairo'; font-weight: 900; }
        .btn-cyan { background: ${theme.info}22; color: ${theme.info}; }
        .btn-orange { background: ${theme.accentAlt}22; color: ${theme.accentAlt}; }
        .btn-green { background: ${theme.success}22; color: ${theme.success}; }
        .btn-red { background: ${theme.danger}22; color: ${theme.danger}; }
        .card { background: ${theme.surface}; border: 1px solid ${theme.borderSoft}; border-radius: 18px; padding: 20px; box-shadow: ${isLightTheme ? '0 10px 26px rgba(15,23,42,0.06)' : '0 12px 24px rgba(0,0,0,0.08)'}; }
        .nav-badge { min-width: 20px; height: 20px; display: inline-grid; place-items: center; background: ${theme.danger}; color: ${theme.buttonText}; border-radius: 999px; font-size: 11px; font-weight: 900; margin-inline-start: auto; }
        .sidebar-collapsed .nav-badge { position: absolute; top: 4px; left: 8px; margin: 0; }
        .course-form { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) 150px; gap: 12px; margin-bottom: 18px; }
        .content-create-card { margin-bottom: 0; background: ${theme.surfaceAlt}; box-shadow: none; }
        .content-year-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 0; }
        .year-card { border: 1.5px solid ${visibleBorder}; background: ${theme.surface}; color: ${theme.text}; border-radius: 16px; padding: 16px; text-align: right; cursor: pointer; font-family: 'Cairo'; display: grid; grid-template-columns: 46px 1fr; gap: 8px 12px; align-items: center; box-shadow: ${isLightTheme ? '0 8px 20px rgba(15,23,42,0.045)' : '0 10px 22px rgba(0,0,0,0.08)'}; transition: 0.18s ease; min-height: 104px; }
        .year-card:hover, .year-card.active { border-color: ${theme.accent}; transform: translateY(-1px); }
        .year-card.active { background: linear-gradient(135deg, ${theme.accent}1A, ${theme.surface}); box-shadow: 0 12px 26px ${theme.accent}18; }
        .year-card span { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: ${theme.accent}14; color: ${theme.accent}; border: 1px solid ${theme.accent}33; grid-row: span 2; }
        .year-card strong { font-size: 18px; align-self: end; }
        .year-card small { color: ${theme.subText}; font-weight: 800; }
        .content-section-title { background: ${theme.surface}; border: 1.5px solid ${visibleBorder}; border-radius: 16px; padding: 14px 16px; margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .content-section-title.compact { margin-bottom: 0; padding: 0; background: transparent; border: none; }
        .content-section-title strong, .content-section-title span { display: block; }
        .content-section-title strong { color: ${theme.text}; font-size: 17px; margin-bottom: 4px; }
        .content-section-title span { color: ${theme.subText}; font-size: 12px; }
        .subject-picker-grid { gap: 14px; }
        .subject-picker-grid .course-card { display: grid; gap: 12px; padding: 14px; border-radius: 16px; box-shadow: ${isLightTheme ? '0 8px 18px rgba(15,23,42,0.045)' : '0 10px 22px rgba(0,0,0,0.08)'}; }
        .subject-open-btn { border: none; background: transparent; color: inherit; padding: 0; display: flex; align-items: center; gap: 12px; text-align: right; cursor: pointer; font-family: 'Cairo'; width: 100%; }
        .subject-open-btn h3 { margin: 0 0 4px; color: ${theme.text}; }
        .subject-open-btn p { margin: 0; color: ${theme.subText}; font-size: 13px; }
        .subject-card-copy { min-width: 0; flex: 1; }
        .subject-open-btn > i { color: ${theme.accent}; width: 34px; height: 34px; border-radius: 12px; display: grid; place-items: center; background: ${theme.accent}12; flex-shrink: 0; }
        .course-year-filter { background: ${theme.surface}; border: 1.5px solid ${visibleBorder}; border-radius: 18px; padding: 14px; margin-bottom: 18px; display: grid; gap: 10px; box-shadow: ${isLightTheme ? '0 10px 26px rgba(15,23,42,0.06)' : '0 12px 24px rgba(0,0,0,0.08)'}; }
        .course-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 18px; }
        .course-card { background: ${theme.surface}; border: 1px solid ${theme.borderSoft}; border-radius: 18px; padding: 16px; box-shadow: ${isLightTheme ? '0 12px 28px rgba(15,23,42,0.06)' : '0 14px 28px rgba(0,0,0,0.10)'}; transition: 0.2s ease; }
        .course-card:hover { border-color: ${theme.accent}66; transform: translateY(-2px); }
        .course-head { display: flex; align-items: center; gap: 14px; }
        .course-cover { width: 70px; height: 70px; border-radius: 18px; background: ${theme.accent}18; border: 1px solid ${theme.borderSoft}; display: grid; place-items: center; color: ${theme.accent}; font-size: 24px; overflow: hidden; flex-shrink: 0; }
        .course-cover img { width: 100%; height: 100%; object-fit: cover; }
        .course-head h3 { margin: 0 0 4px; color: ${theme.text}; }
        .course-head p { margin: 0; color: ${theme.subText}; font-size: 13px; }
        .course-actions, .chapter-actions, .lesson-actions, .form-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
        .icon-btn { border: 1px solid ${theme.borderSoft}; background: ${theme.surfaceAlt}; color: ${theme.text}; width: 38px; height: 38px; border-radius: 12px; cursor: pointer; display: inline-grid; place-items: center; transition: 0.2s ease; }
        .icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .icon-btn.danger { color: ${theme.danger}; }
        .inline-editor { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 10px; margin-top: 14px; align-items: center; }
        .inline-editor.wide { grid-template-columns: 1fr 150px auto auto; width: 100%; }
        .chapter-panel { margin-top: 16px; border-top: 1px solid ${theme.borderSoft}; padding-top: 16px; display: grid; gap: 12px; }
        .chapter-form { display: grid; grid-template-columns: 1fr 160px; gap: 10px; background: ${theme.surfaceAlt}; padding: 12px; border-radius: 16px; border: 1px solid ${theme.borderSoft}; }
        .chapter-form textarea, .chapter-form button { grid-column: 1 / -1; }
        .chapter-row { display: flex; justify-content: space-between; gap: 12px; align-items: center; background: ${theme.surfaceAlt}; border: 1px solid ${theme.borderSoft}; border-radius: 14px; padding: 12px; }
        .chapter-row strong { display: block; color: ${theme.text}; }
        .chapter-row span { display: block; color: ${theme.subText}; font-size: 12px; margin-top: 4px; }
        .hero-button { width: auto; min-width: 170px; display: flex; gap: 8px; align-items: center; justify-content: center; }
        .add-lesson-shell { max-width: 1440px; margin: 0 auto; }
        .publish-steps { display: flex; gap: 8px; flex-wrap: wrap; }
        .publish-steps span { min-height: 38px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: 999px; border: 1.5px solid ${visibleBorder}; background: ${theme.surfaceAlt}; color: ${theme.subText}; font-size: 12px; font-weight: 900; }
        .publish-steps span.done { background: ${theme.success}14; color: ${theme.success}; border-color: ${theme.success}55; }
        .lesson-compose-grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
        .compose-main { display: grid; gap: 16px; }
        .compose-section, .compose-summary { background: ${theme.surface}; border: 1.5px solid ${visibleBorder}; border-radius: 20px; padding: 18px; box-shadow: ${isLightTheme ? '0 12px 28px rgba(15,23,42,0.06)' : '0 14px 30px rgba(0,0,0,0.10)'}; display: grid; gap: 14px; }
        .compose-head { display: flex; align-items: center; gap: 12px; }
        .compose-head i { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: ${theme.accent}16; color: ${theme.accent}; border: 1px solid ${theme.accent}33; flex-shrink: 0; }
        .compose-head strong, .compose-head span { display: block; }
        .compose-head strong { color: ${theme.text}; font-size: 16px; margin-bottom: 3px; }
        .compose-head span { color: ${theme.subText}; font-size: 12px; }
        .bunny-mode-pill { min-height: 46px; border-radius: 12px; border: 1.5px solid ${theme.accent}44; background: ${theme.accent}12; color: ${theme.accent}; display: inline-flex; align-items: center; justify-content: center; gap: 9px; font-weight: 900; }
        .lesson-title-input { min-height: 54px; font-size: 18px; font-weight: 900; }
        .lesson-description-input { min-height: 96px; resize: vertical; line-height: 1.8; }
        .compose-chips { padding: 6px; background: ${theme.surfaceAlt}; border: 1.5px solid ${visibleBorder}; border-radius: 16px; }
        .compose-side { position: sticky; top: 104px; }
        .compose-summary h3 { margin: 8px 0 0; color: ${theme.text}; line-height: 1.5; }
        .compose-summary p { margin: 0; color: ${theme.subText}; line-height: 1.8; font-size: 13px; }
        .compose-actions { display: grid; gap: 10px; }
        .compose-actions .btn-primary, .compose-actions .btn-secondary { width: 100%; }
        .lesson-editor { display: grid; gap: 14px; margin-bottom: 18px; }
        .form-grid, .upload-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .upload-grid { grid-template-columns: repeat(2, 1fr); }
        .chips-wrap, .filter-row { display: flex; flex-wrap: wrap; gap: 10px; }
        .filter-row { margin: 0; }
        .lesson-filter-panel { background: ${theme.surface}; border: 1.5px solid ${visibleBorder}; border-radius: 18px; padding: 16px; margin: 16px 0; display: grid; gap: 14px; box-shadow: ${isLightTheme ? '0 10px 26px rgba(15,23,42,0.06)' : '0 12px 24px rgba(0,0,0,0.08)'}; }
        .filter-group { display: grid; gap: 10px; padding-bottom: 14px; border-bottom: 1.5px solid ${visibleBorder}; }
        .filter-group:last-of-type { padding-bottom: 0; border-bottom: none; }
        .filter-label { display: inline-flex; align-items: center; gap: 8px; color: ${theme.accent}; font-size: 13px; font-weight: 900; }
        .filter-empty { color: ${theme.muted}; background: ${theme.surfaceAlt}; border: 1.5px dashed ${visibleBorder}; border-radius: 14px; padding: 10px 14px; font-size: 13px; }
        .clear-filter-btn { width: fit-content; display: inline-flex; align-items: center; gap: 8px; justify-content: center; }
        .chip { border: 1px solid ${theme.borderSoft}; background: ${theme.surface}; color: ${theme.text}; border-radius: 999px; padding: 9px 14px; cursor: pointer; font-family: 'Cairo'; transition: 0.18s ease; display: inline-flex; align-items: center; gap: 8px; }
        .chip-count { min-width: 22px; height: 22px; border-radius: 999px; display: inline-grid; place-items: center; padding: 0 7px; background: ${theme.surfaceAlt}; color: ${theme.subText}; border: 1px solid ${theme.borderSoft}; font-size: 11px; font-weight: 900; }
        .chip:hover { border-color: ${theme.accent}; color: ${theme.accent}; }
        .chip.active { border-color: ${theme.accent}; background: ${theme.accent}22; color: ${theme.accent}; font-weight: 900; }
        .chip.active .chip-count { background: ${theme.accent}; color: ${theme.buttonText}; border-color: ${theme.accent}; }
        .lesson-list { display: grid; gap: 16px; }
        .lesson-row-card { display: grid; grid-template-columns: 240px 1fr; gap: 16px; background: ${theme.surface}; border: 1px solid ${theme.borderSoft}; border-radius: 18px; padding: 14px; box-shadow: ${isLightTheme ? '0 10px 26px rgba(15,23,42,0.06)' : '0 12px 24px rgba(0,0,0,0.08)'}; transition: 0.2s ease; }
        .lesson-row-card:hover { border-color: ${theme.accent}66; transform: translateY(-1px); }
        .lesson-preview { aspect-ratio: 16/9; background: #000; border-radius: 16px; overflow: hidden; min-height: 140px; }
        .lesson-info h4 { margin: 0 0 6px; color: ${theme.text}; font-size: 18px; }
        .lesson-info p { margin: 0 0 8px; color: ${theme.accent}; font-size: 13px; }
        .lesson-info span { color: ${theme.subText}; font-size: 13px; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.56); z-index: 3000; display: grid; place-items: center; padding: 20px; backdrop-filter: blur(5px); }
        .modal-card { position: relative; width: min(520px, 100%); background: ${theme.surface}; border: 1px solid ${theme.border}; border-radius: 24px; padding: 24px; box-shadow: 0 24px 70px rgba(0,0,0,0.35); }
        .modal-card h3 { margin: 0 0 6px; color: ${theme.accent}; }
        .modal-card p { margin: 0 0 18px; color: ${theme.subText}; }
        .modal-close { position: absolute; top: 14px; left: 14px; border: none; background: ${theme.surfaceAlt}; color: ${theme.text}; width: 36px; height: 36px; border-radius: 12px; cursor: pointer; }
        .content-modal { width: min(1060px, 100%); max-height: min(860px, calc(100vh - 36px)); overflow-y: auto; display: grid; gap: 14px; padding: 22px; }
        .content-modal-head { display: flex; align-items: center; gap: 14px; padding: 14px; border: 1.5px solid ${visibleBorder}; border-radius: 18px; background: ${theme.surfaceAlt}; }
        .content-modal-head span { display: block; color: ${theme.accent}; font-weight: 900; font-size: 12px; margin-bottom: 4px; }
        .content-modal-head h3 { color: ${theme.text}; font-size: 24px; }
        .content-modal-head p { margin: 0; line-height: 1.7; }
        .year-modal-icon { width: 64px; height: 64px; border-radius: 18px; display: grid; place-items: center; background: ${theme.accent}16; color: ${theme.accent}; border: 1.5px solid ${theme.accent}33; font-size: 24px; flex-shrink: 0; }
        .content-inline-panel { background: ${theme.surface}; border: 1.5px solid ${visibleBorder}; border-radius: 22px; padding: 16px; box-shadow: ${isLightTheme ? '0 14px 32px rgba(15,23,42,0.07)' : '0 16px 34px rgba(0,0,0,0.14)'}; }
        .content-inline-panel .content-modal { width: 100%; max-height: none; overflow: visible; padding: 0; border: none; box-shadow: none; background: transparent; }
        .content-inline-panel .modal-close { top: 26px; left: 26px; }
        .soft-panel { background: ${theme.surfaceAlt}; border: 1.5px solid ${visibleBorder}; border-radius: 18px; padding: 14px; }
        .content-modal-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .year-subjects-panel { display: grid; gap: 12px; }
        .year-subject-block { background: ${theme.surfaceAlt}; border: 1.5px solid ${visibleBorder}; border-radius: 18px; padding: 12px; display: grid; gap: 10px; transition: 0.18s ease; }
        .year-subject-block.active { border-color: ${theme.accent}66; background: linear-gradient(180deg, ${theme.surfaceAlt}, ${theme.accent}0D); }
        .year-subject-btn { min-height: 74px; }
        .compact-actions { margin-top: 0; padding-top: 10px; border-top: 1.5px solid ${visibleBorder}; }
        .subject-drilldown { display: grid; gap: 12px; padding: 12px; border-radius: 16px; background: ${theme.surface}; border: 1.5px solid ${visibleBorder}; }
        .chapter-chip-list { display: grid; gap: 10px; }
        .chapter-drilldown { display: grid; gap: 10px; }
        .chapter-select-btn { width: 100%; border: 1.5px solid ${visibleBorder}; background: ${theme.surfaceAlt}; color: ${theme.text}; border-radius: 15px; padding: 12px; display: grid; grid-template-columns: 38px 1fr auto 30px; gap: 10px; align-items: center; text-align: right; cursor: pointer; font-family: 'Cairo'; transition: 0.18s ease; }
        .chapter-drilldown.active .chapter-select-btn, .chapter-select-btn:hover { border-color: ${theme.accent}; background: ${theme.accent}12; }
        .chapter-select-btn span { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: ${theme.accent}14; color: ${theme.accent}; }
        .chapter-select-btn strong { color: ${theme.text}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chapter-select-btn small { color: ${theme.subText}; font-weight: 900; }
        .chapter-videos-panel { background: ${theme.surface}; border: 1.5px solid ${visibleBorder}; border-radius: 16px; padding: 12px; display: grid; gap: 12px; }
        .chapter-videos-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding-bottom: 10px; border-bottom: 1.5px solid ${visibleBorder}; }
        .chapter-videos-head strong, .chapter-videos-head span { display: block; }
        .chapter-videos-head strong { color: ${theme.text}; margin-bottom: 4px; }
        .chapter-videos-head span { color: ${theme.subText}; font-size: 12px; }
        .chapter-video-list { display: grid; gap: 10px; }
        .chapter-video-card { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 10px; align-items: center; background: ${theme.surfaceAlt}; border: 1.5px solid ${visibleBorder}; border-radius: 14px; padding: 10px; }
        .video-thumb-mini { width: 44px; height: 44px; border-radius: 14px; border: none; background: ${theme.accent}; color: ${theme.buttonText}; display: grid; place-items: center; cursor: pointer; }
        .chapter-video-card strong, .chapter-video-card span { display: block; }
        .chapter-video-card strong { color: ${theme.text}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chapter-video-card span { color: ${theme.subText}; font-size: 12px; margin-top: 3px; }
        .chapter-video-actions { display: flex; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }
        .chapter-video-actions .btn-action { padding: 7px 9px; font-size: 12px; }
        .chapter-video-player { grid-column: 1 / -1; border-radius: 14px; overflow: hidden; background: #000; aspect-ratio: 16 / 9; }
        .lesson-form-overlay { background: ${isLightTheme ? 'rgba(15,23,42,0.36)' : 'rgba(0,0,0,0.62)'}; backdrop-filter: blur(4px); }
        .lesson-form-modal { position: relative; width: min(92vw, 1180px); max-height: min(780px, calc(100vh - 48px)); overflow-y: auto; background: ${theme.surface}; color: ${theme.text}; border: 1.5px solid ${visibleBorder}; border-radius: 22px; padding: 34px 38px 24px; box-shadow: ${isLightTheme ? '0 28px 80px rgba(15,23,42,0.22)' : '0 28px 90px rgba(0,0,0,0.54)'}; direction: rtl; }
        .lesson-modal-close { background: ${theme.surfaceAlt}; color: ${theme.text}; border: 1.5px solid ${visibleBorder}; }
        .lesson-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 28px; padding-inline-start: 44px; }
        .lesson-modal-head h2 { margin: 0 0 8px; color: ${theme.text}; font-size: 28px; font-weight: 900; }
        .lesson-modal-head p { margin: 0; color: ${theme.subText}; font-size: 13px; }
        .lesson-type-toggle { display: flex; align-items: center; gap: 34px; color: ${theme.text}; font-weight: 900; padding-top: 6px; }
        .lesson-type-toggle span { display: inline-flex; align-items: center; gap: 8px; }
        .lesson-type-toggle .active i { color: ${theme.accent}; }
        .lesson-modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px 16px; }
        .lesson-modal-grid label { display: grid; gap: 8px; align-content: start; }
        .lesson-modal-grid label.wide { grid-column: 1 / -1; }
        .lesson-modal-grid label strong { color: ${theme.text}; font-size: 15px; font-weight: 900; text-align: right; }
        .lesson-modal-input { min-height: 42px; background: ${theme.surfaceAlt} !important; color: ${theme.text} !important; border-color: ${visibleBorder} !important; border-radius: 10px !important; box-shadow: none !important; }
        textarea.lesson-modal-input { min-height: 48px; resize: vertical; }
        .lesson-upload-line { position: relative; min-height: 42px; border: 1.5px solid ${visibleBorder}; border-radius: 10px; display: flex; align-items: center; justify-content: center; gap: 9px; color: ${theme.text}; background: ${theme.surfaceAlt}; overflow: hidden; font-weight: 900; }
        .lesson-upload-line.uploaded { border-color: ${theme.success}88; color: ${theme.success}; background: ${theme.success}12; }
        .lesson-upload-line input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
        .lesson-modal-actions { display: flex; align-items: center; justify-content: flex-start; gap: 10px; margin-top: 24px; }
        .lesson-modal-actions .btn-primary { min-width: 120px; border-radius: 999px; }
        .modal-chapter-form { margin: 0; }
        .modal-chapter-list { border-top: none; padding-top: 0; margin-top: 0; }
        .modal-chapter-row { align-items: flex-start; background: ${theme.surface}; }
        .modal-lesson-editor { box-shadow: none; background: ${theme.surfaceAlt}; border-radius: 18px; }
        .lesson-preview-modal { display: grid; gap: 14px; }
        .student-name-link { border: none; background: transparent; color: ${theme.text}; font-family: 'Cairo'; font-weight: 900; cursor: pointer; padding: 0; }
        .student-name-link:hover { color: ${theme.accent}; text-decoration: underline; }
        .student-profile-modal { width: min(820px, 100%); max-height: min(820px, calc(100vh - 40px)); overflow-y: auto; display: grid; gap: 16px; }
        .student-profile-head { display: flex; align-items: center; gap: 14px; padding-bottom: 14px; border-bottom: 1.5px solid ${visibleBorder}; }
        .student-avatar-large { width: 78px; height: 78px; border-radius: 24px; display: grid; place-items: center; background: ${theme.gradient}; color: ${theme.buttonText}; font-size: 34px; font-weight: 900; box-shadow: 0 14px 28px ${theme.accent}22; flex-shrink: 0; }
        .student-profile-head h3 { margin: 8px 0 4px; color: ${theme.text}; font-size: 24px; }
        .student-profile-head p { margin: 0; color: ${theme.subText}; }
        .profile-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .profile-stats-grid div { background: ${theme.surfaceAlt}; border: 1.5px solid ${visibleBorder}; border-radius: 16px; padding: 14px; text-align: center; }
        .profile-stats-grid strong, .profile-stats-grid span { display: block; }
        .profile-stats-grid strong { color: ${theme.accent}; font-size: 16px; margin-bottom: 5px; }
        .profile-stats-grid span { color: ${theme.subText}; font-size: 12px; font-weight: 900; }
        .profile-sections { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .profile-sections section, .profile-activity { background: ${theme.surfaceAlt}; border: 1.5px solid ${visibleBorder}; border-radius: 18px; padding: 14px; }
        .profile-section-title { color: ${theme.accent}; font-weight: 900; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .profile-info-list { display: grid; gap: 9px; color: ${theme.subText}; font-size: 13px; line-height: 1.7; }
        .profile-info-list strong { color: ${theme.text}; }
        .profile-actions { display: flex; flex-wrap: wrap; gap: 10px; }
        .profile-actions .btn-action { flex: 1 1 150px; min-height: 42px; }
        .profile-log-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid ${visibleBorder}; }
        .profile-log-row:first-of-type { border-top: none; }
        .profile-log-row strong, .profile-log-row small { display: block; }
        .profile-log-row strong { color: ${theme.text}; font-size: 13px; margin-bottom: 3px; }
        .profile-log-row small { color: ${theme.subText}; font-size: 11px; }
        .preview-meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        .preview-meta div { background: ${theme.surfaceAlt}; border: 1.5px solid ${visibleBorder}; border-radius: 14px; padding: 12px; }
        .preview-meta strong, .preview-meta span { display: block; }
        .preview-meta strong { color: ${theme.text}; margin-bottom: 4px; }
        .preview-meta span { color: ${theme.subText}; font-size: 12px; }
        .preview-checks { display: grid; gap: 8px; }
        .preview-checks span { display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 12px; border: 1.5px solid ${visibleBorder}; background: ${theme.surfaceAlt}; font-size: 13px; font-weight: 900; }
        .preview-checks .ok { color: ${theme.success}; }
        .preview-checks .warn { color: ${theme.accent}; }
        .student-filter-panel { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; background: ${theme.surface}; border: 1.5px solid ${visibleBorder}; border-radius: 18px; padding: 12px; }
        .ai-assistant-fab { position: fixed; left: 24px; bottom: 24px; z-index: 2500; width: 62px; height: 62px; border-radius: 22px; border: 1.5px solid ${theme.accent}66; background: ${theme.gradient}; color: ${theme.buttonText}; cursor: pointer; display: grid; place-items: center; box-shadow: 0 18px 40px ${theme.accent}33; transition: 0.2s ease; }
        .ai-assistant-fab:hover { transform: translateY(-2px); filter: brightness(1.05); }
        .ai-assistant-fab i { font-size: 20px; }
        .ai-assistant-fab span { position: absolute; top: -7px; right: -7px; min-width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; background: ${theme.danger}; color: #fff; border: 2px solid ${theme.surface}; font-size: 11px; font-weight: 900; }
        .ai-assistant-panel { position: fixed; left: 24px; bottom: 96px; z-index: 2600; width: min(420px, calc(100vw - 32px)); max-height: min(720px, calc(100vh - 132px)); background: ${theme.surface}; color: ${theme.text}; border: 1.5px solid ${visibleBorder}; border-radius: 24px; box-shadow: ${isLightTheme ? '0 24px 60px rgba(15,23,42,0.18)' : '0 26px 80px rgba(0,0,0,0.46)'}; overflow: hidden; display: grid; grid-template-rows: auto auto auto 1fr auto; }
        .ai-assistant-head { padding: 16px; background: ${theme.panelGradient}; border-bottom: 1.5px solid ${visibleBorder}; display: flex; justify-content: space-between; gap: 12px; align-items: center; }
        .ai-assistant-head strong, .ai-assistant-head span { display: block; }
        .ai-assistant-head strong { color: ${theme.text}; font-size: 16px; }
        .ai-assistant-head span { color: ${theme.subText}; font-size: 12px; margin-top: 3px; }
        .ai-assistant-head button { border: none; background: ${theme.surfaceAlt}; color: ${theme.text}; width: 36px; height: 36px; border-radius: 12px; cursor: pointer; }
        .ai-assistant-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 12px 14px 0; }
        .ai-assistant-metrics div { background: ${theme.surfaceAlt}; border: 1.5px solid ${visibleBorder}; border-radius: 14px; padding: 10px; text-align: center; }
        .ai-assistant-metrics strong, .ai-assistant-metrics span { display: block; }
        .ai-assistant-metrics strong { color: ${theme.accent}; font-size: 18px; line-height: 1; }
        .ai-assistant-metrics span { color: ${theme.subText}; font-size: 11px; margin-top: 5px; font-weight: 900; }
        .ai-quick-prompts { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 14px; border-bottom: 1.5px solid ${visibleBorder}; }
        .ai-quick-prompts button { border: 1px solid ${theme.accent}33; background: ${theme.accent}12; color: ${theme.accent}; border-radius: 999px; padding: 8px 10px; font-family: 'Cairo'; font-size: 11px; font-weight: 900; cursor: pointer; }
        .ai-messages { padding: 14px; overflow-y: auto; display: grid; gap: 10px; align-content: start; min-height: 220px; }
        .ai-message { max-width: 88%; border-radius: 16px; padding: 11px 12px; border: 1.5px solid ${visibleBorder}; }
        .ai-message p { margin: 0; color: inherit; line-height: 1.8; font-size: 13px; }
        .ai-message.user { justify-self: end; background: ${theme.accent}; color: ${theme.buttonText}; border-color: ${theme.accent}; border-bottom-right-radius: 6px; }
        .ai-message.assistant { justify-self: start; background: ${theme.surfaceAlt}; color: ${theme.text}; border-bottom-left-radius: 6px; }
        .ai-message button { margin-top: 10px; border: none; background: ${theme.accent}18; color: ${theme.accent}; border-radius: 12px; padding: 8px 10px; font-family: 'Cairo'; font-weight: 900; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; }
        .ai-input-row { display: grid; grid-template-columns: 1fr 46px; gap: 8px; padding: 12px; border-top: 1.5px solid ${visibleBorder}; background: ${theme.surface}; }
        .ai-input-row input { min-width: 0; border: 1.5px solid ${visibleBorder}; background: ${theme.surfaceAlt}; color: ${theme.text}; border-radius: 14px; padding: 0 12px; outline: none; font-family: 'Cairo'; }
        .ai-input-row input:focus { border-color: ${theme.accent}; box-shadow: 0 0 0 3px ${theme.accent}18; }
        .ai-input-row button { border: none; background: ${theme.gradient}; color: ${theme.buttonText}; border-radius: 14px; cursor: pointer; }
        .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 18px; }
        .stats-grid div { background: ${theme.surfaceAlt}; border: 1px solid ${theme.borderSoft}; border-radius: 16px; padding: 16px; text-align: center; }
        .stats-grid strong { display: block; color: ${theme.accent}; font-size: 20px; margin-bottom: 4px; }
        .stats-grid span { color: ${theme.subText}; font-size: 12px; }
        .gold-input,
        .btn-secondary,
        .quick-action,
        .mini-pill,
        .stat-card,
        .admin-hero,
        .request-card,
        .ops-card,
        .ops-empty,
        .empty-state,
        .codes-panel,
        .codes-summary div,
        .code-card,
        .code-value,
        .code-used-by,
        .course-card,
        .course-cover,
        .icon-btn,
        .chapter-form,
        .chapter-row,
        .chip,
        .table-container,
        .card,
        .lesson-row-card,
        .modal-card,
        .stats-grid div,
        .upload-box {
          border-width: 1.5px;
          border-style: solid;
          border-color: ${visibleBorder};
        }
        .btn-primary {
          border: 1.5px solid ${strongBorder};
        }
        .nav-btn {
          border: 1.5px solid transparent;
        }
        .nav-btn:hover,
        .btn-secondary:hover,
        .quick-action:hover,
        .icon-btn:hover,
        .chip:hover,
        .course-card:hover,
        .lesson-row-card:hover,
        .code-card:hover {
          border-color: ${theme.accent};
        }
        .nav-btn.active,
        .chip.active,
        .gold-input:focus {
          border-color: ${theme.accent};
        }
        .btn-red-solid {
          border: 1.5px solid ${theme.danger};
        }
        .fade-in { animation: fadeIn 0.4s ease-out; }
        @media (max-width: 768px) {
          .page-head { align-items: stretch; }
          .global-search { max-width: none; flex-basis: 100%; order: 3; }
          .insights-grid, .codes-toolbar, .codes-summary { grid-template-columns: 1fr; }
          .codes-grid { grid-template-columns: 1fr; }
          .bulk-actions span { margin-inline-start: 0; width: 100%; }
          .lesson-compose-grid, .course-form, .form-grid, .upload-grid, .lesson-row-card, .chapter-form, .inline-editor, .inline-editor.wide { grid-template-columns: 1fr; }
          .compose-side { position: static; }
          .publish-steps { width: 100%; }
          .publish-steps span { flex: 1; justify-content: center; }
          .course-grid { grid-template-columns: 1fr; }
          .content-year-grid { grid-template-columns: 1fr; }
          .year-card { min-height: 92px; }
          .content-modal { padding: 16px; max-height: calc(100vh - 24px); }
          .content-modal-head { align-items: flex-start; padding-inline-start: 48px; }
          .modal-chapter-row { flex-direction: column; }
          .modal-chapter-row .chapter-actions { width: 100%; }
          .chapter-select-btn { grid-template-columns: 38px 1fr 30px; }
          .chapter-select-btn small { grid-column: 2 / 3; }
          .chapter-video-card { grid-template-columns: 44px 1fr; }
          .chapter-video-actions { grid-column: 1 / -1; justify-content: stretch; }
          .chapter-video-actions .btn-action { flex: 1 1 120px; }
          .lesson-form-modal { width: calc(100vw - 24px); max-height: calc(100vh - 24px); padding: 24px 16px 18px; }
          .lesson-modal-head { flex-direction: column-reverse; gap: 12px; padding-inline-start: 44px; }
          .lesson-modal-grid { grid-template-columns: 1fr; }
          .lesson-modal-grid label.wide { grid-column: auto; }
          .lesson-type-toggle { gap: 18px; flex-wrap: wrap; }
          .lesson-modal-actions { flex-wrap: wrap; }
          .lesson-modal-actions button { flex: 1 1 120px; }
          .student-filter-panel .gold-input, .student-filter-panel .btn-secondary { width: 100% !important; }
          .ai-assistant-fab { left: 16px; bottom: 92px; }
          .ai-assistant-panel { left: 16px; right: 16px; bottom: 164px; width: auto; max-height: calc(100vh - 190px); }
          .profile-stats-grid, .profile-sections { grid-template-columns: 1fr; }
          .student-profile-head { align-items: flex-start; }
          .student-avatar-large { width: 64px; height: 64px; border-radius: 20px; font-size: 28px; }
          .lesson-actions .btn-action { flex: 1 1 120px; }
          .nav-badge { position: absolute; margin: 0; transform: translate(-10px, -10px); }
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default AdminDashboard;


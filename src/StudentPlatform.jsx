import React, { useEffect, useState } from 'react';
import { db } from './firebase';
import { collection, query, where, getDocs, orderBy, onSnapshot, doc, writeBatch, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import Swal from 'sweetalert2';
import ContactSupport from './ContactSupport';
import ThemeToggle from './ThemeToggle';
import { getEmbeddableVideoUrl, isBunnyUrl, isEmbeddedVideoUrl, resolveBunnyPlaybackUrl } from './video-utils';
import { keepEnglishDigitsOnly } from './services/auth-service';

const StudentPlatform = ({ user, setUser, lessons, announcement, theme, themeMode, toggleTheme }) => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [inputCode, setInputCode] = useState(""); 
  const [activating, setActivating] = useState(false);
  const [studentDetails, setStudentDetails] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [wmPos, setWmPos] = useState({ top: '20%', left: '20%' });
  const [lastWatched, setLastWatched] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [chapters, setChapters] = useState([]);

  const uniqByNormalized = (values = []) => {
    const seen = new Set();
    return values.filter((value) => {
      const key = normalizeYear(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const normalizeYear = (value = '') =>
    String(value)
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim();

  // --- نظام المراقبة وحماية التصوير ---
  useEffect(() => {
    const handleDetection = async () => {
      await updateDoc(doc(db, "students", user.id), { isBanned: true, banReason: "محاولة تصوير محتوى المنصة" });
      await addDoc(collection(db, "logs"), {
        studentName: studentDetails?.name || user.name, studentId: user.id,
        action: "حظر تلقائي: محاولة تصوير شاشة أو تسجيل الشاشة",
        alertType: "security",
        seen: false,
        deviceType: studentDetails?.deviceType || 'Unknown',
        time: serverTimestamp()
      });
      setUser(null); // طرد فوري
    };

    const disableKeyBox = (e) => {
      // PrintScreen Key
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        navigator.clipboard.writeText(""); 
        handleDetection();
      }
    };
    
    window.addEventListener('keyup', disableKeyBox);
    window.onblur = () => { document.body.style.filter = "blur(15px)"; }; // تعتيم الشاشة عند فقدان التركيز
    window.onfocus = () => { document.body.style.filter = "none"; };

    return () => { 
      window.removeEventListener('keyup', disableKeyBox);
      window.onblur = null; window.onfocus = null;
    };
  }, [user.id, studentDetails, setUser]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setSelectedSubject(null);
    setSelectedChapter(null);
  }, [activeTab]);

  useEffect(() => {
    let isMounted = true;

    const prepareVideoUrl = async () => {
      if (!selectedVideo?.url) {
        setSelectedVideoUrl('');
        return;
      }

      try {
        const nextUrl = isBunnyUrl(selectedVideo.url)
          ? await resolveBunnyPlaybackUrl(selectedVideo.url)
          : getEmbeddableVideoUrl(selectedVideo.url);
        if (isMounted) setSelectedVideoUrl(nextUrl || selectedVideo.url);
      } catch {
        if (isMounted) setSelectedVideoUrl(getEmbeddableVideoUrl(selectedVideo.url) || selectedVideo.url);
      }
    };

    prepareVideoUrl();
    return () => { isMounted = false; };
  }, [selectedVideo]);

  useEffect(() => {
    const userId = user?.uid || user?.id;
    if (!userId) return;
    const unsubUser = onSnapshot(doc(db, "students", userId), (docSnap) => {
      if (docSnap.exists()) setStudentDetails(docSnap.data());
      setLoading(false); 
    });
    return () => unsubUser();
  }, [user]);

  useEffect(() => {
    const unsubChapters = onSnapshot(collection(db, "chapters"), (snapshot) => {
      const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setChapters(data.sort((a, b) => (a.order ?? 99) - (b.order ?? 99)));
    });
    return () => unsubChapters();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setWmPos({ top: Math.floor(Math.random() * 70 + 10) + '%', left: Math.floor(Math.random() * 60 + 5) + '%' });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleWatchVideo = async (lesson) => {
    try {
      await updateDoc(doc(db, "lessons", lesson.id), { views: (lesson.views || 0) + 1 });
      setSelectedVideo(lesson);
      setLastWatched(lesson);
    } catch (e) { setSelectedVideo(lesson); }
  };

  const getEmbeddableUrl = (url = '') => {
    return getEmbeddableVideoUrl(url);
  };

  const isEmbedVideo = (lesson) => (
    lesson?.videoKind === 'youtube' ||
    lesson?.videoKind === 'google_drive' ||
    lesson?.videoKind === 'bunny' ||
    isEmbeddedVideoUrl(lesson?.url || '')
  );

  const handleActivateCode = async () => {
    const cleanCode = keepEnglishDigitsOnly(inputCode).trim().toUpperCase();
    if (!cleanCode) return Swal.fire({ icon: 'warning', title: 'تنبيه', text: 'أدخل الكود أولاً', background: theme.surface, color: theme.text, confirmButtonColor: theme.accent });

    setActivating(true);
    try {
      const q = query(collection(db, "codes"), where("code", "==", cleanCode), where("isUsed", "==", false));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return Swal.fire({ icon: 'error', title: 'كود غير صحيح', text: 'الكود غير موجود أو تم استخدامه من قبل.', background: theme.surface, color: theme.text, confirmButtonColor: theme.accent });
      }

      const codeDoc = querySnapshot.docs[0];
      const codeData = codeDoc.data();
      const accessYear = codeData.year || studentDetails?.year || user.year;
      const batch = writeBatch(db);

      batch.update(doc(db, "students", user.id), {
        isSubscribed: true,
        usedCode: cleanCode,
        accessYear,
        codeYear: accessYear,
        pendingCode: "",
        codeReviewStatus: "approved",
      });
      batch.update(doc(db, "codes", codeDoc.id), {
        isUsed: true,
        usedByName: studentDetails?.name || user.name,
        usedBy: studentDetails?.username || user.username,
        usedById: user.id,
        usedAt: serverTimestamp(),
      });
      await batch.commit();

      await addDoc(collection(db, "logs"), {
        studentId: user.id,
        studentName: studentDetails?.name || user.name,
        action: `تفعيل كود تلقائي لفرقة ${accessYear}`,
        code: cleanCode,
        alertType: "code_activation",
        seen: true,
        deviceType: studentDetails?.deviceType || "Unknown",
        time: serverTimestamp(),
      });

      Swal.fire({ icon: 'success', title: 'تم تفعيل الحساب', text: `تم فتح محتوى ${accessYear} حسب الكود المستخدم.`, background: theme.surface, color: theme.text, confirmButtonColor: theme.accent });
      setInputCode("");
    } catch (error) {
      Swal.fire({ icon: 'error', title: 'فشل التفعيل', text: error.message || 'حاول مرة أخرى.', background: theme.surface, color: theme.text, confirmButtonColor: theme.accent });
    } finally { setActivating(false); }
  };

  const getSubjectsForSemester = (semesterName) => {
    const semesterLessons = studentLessons.filter(l => l.semester === semesterName);
    return [...new Set(semesterLessons.map(l => l.subject || "عامة"))];
  };

  const accessYears = uniqByNormalized(
    Array.isArray(studentDetails?.accessYears) && studentDetails.accessYears.length
      ? studentDetails.accessYears
      : [studentDetails?.accessYear, studentDetails?.codeYear, studentDetails?.year].filter(Boolean)
  );
  const accessYearKeys = new Set(accessYears.map((year) => normalizeYear(year)));
  const activeAccessYear = accessYears[0] || studentDetails?.year;
  const studentLessons = lessons.filter(
    (lesson) => accessYearKeys.has(normalizeYear(lesson.year)) && lesson.isActive !== false
  );
  const chaptersBySubject = (() => {
    const grouped = {};
    chapters.forEach((chapter) => {
      const allowed = !chapter.year || chapter.year === 'مشترك' || accessYearKeys.has(normalizeYear(chapter.year));
      if (!allowed) return;
      const keys = [chapter.subjectId, chapter.subjectName && `name:${chapter.subjectName}`].filter(Boolean);
      keys.forEach((key) => {
        if (!grouped[key]) grouped[key] = [];
        if (!grouped[key].some((item) => item.id === chapter.id)) grouped[key].push(chapter);
      });
    });
    return grouped;
  })();
  const pdfLessons = studentLessons.filter((lesson) => lesson.pdfUrl);
  const latestLessons = [...studentLessons].slice(0, 5);

  if (loading) return <div className="loader-container"><div className="gold-loader"></div></div>;

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', direction: 'rtl', minHeight: '100vh', background: theme.bg, color: theme.text, fontFamily: 'Cairo, sans-serif' }} className="protected-container">
      
      <aside style={{
        width: isMobile ? '100%' : '260px', height: isMobile ? '70px' : '100vh',
        position: isMobile ? 'fixed' : 'sticky', bottom: isMobile ? 0 : 'unset', top: 0,
        background: theme.surface, borderLeft: isMobile ? 'none' : `1px solid ${theme.border}`, zIndex: 1000, 
        display: 'flex', flexDirection: isMobile ? 'row' : 'column'
      }}>
        {!isMobile && (
          <div style={{ padding: '30px 20px', textAlign: 'center' }}>
            <img className="sidebar-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="El Hadidy" />
            <h4 style={{ color: theme.accent, margin: '15px 0 5px' }}>{studentDetails?.name}</h4>
            <p style={{ fontSize: '11px', color: theme.subText }}>{studentDetails?.year}</p>
            <div style={{ marginTop: '14px' }}>
              <ThemeToggle mode={themeMode} onToggle={toggleTheme} theme={theme} />
            </div>
          </div>
        )}
        <nav style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', flex: 1, padding: isMobile ? '0' : '10px', justifyContent: 'space-around' }}>
          {[{ id: 'profile', icon: 'fa-user', label: 'ملفي' }, { id: 'notifications', icon: 'fa-bell', label: 'التنبيهات' }, { id: 'books', icon: 'fa-book', label: 'الملفات' }, { id: 'home', icon: 'fa-home', label: 'الرئيسية' }, { id: 'sem1', icon: 'fa-book-open', label: 'الترم الأول' }, { id: 'sem2', icon: 'fa-book-reader', label: 'الترم الثاني' }].map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} style={{
              background: activeTab === item.id ? `${theme.accent}22` : 'none', color: activeTab === item.id ? theme.accent : theme.muted,
              border: 'none', padding: '15px', borderRadius: '12px', cursor: 'pointer',
              display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: '10px', transition: '0.3s'
            }}>
              <i className={`fas ${item.icon}`} style={{ fontSize: '18px' }}></i><span style={{ fontSize: isMobile ? '10px' : '14px' }}>{item.label}</span>
            </button>
          ))}
          {!isMobile && (
            <button onClick={() => setUser(null)} style={{ marginTop: 'auto', background: `${theme.danger}11`, border: `1px solid ${theme.danger}44`, color: theme.danger, padding: '12px', borderRadius: '12px', cursor: 'pointer', marginBottom: '20px' }}>
              <i className="fas fa-sign-out-alt"></i> خروج
            </button>
          )}
        </nav>
      </aside>

      <main style={{ flex: 1, padding: isMobile ? '20px' : '40px', paddingBottom: isMobile ? '100px' : '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
           <div>
              <h2 style={{ color: theme.accent, margin: 0 }}>{activeTab === 'home' ? 'لوحة الطالب' : activeTab === 'sem1' ? 'الترم الأول' : activeTab === 'sem2' ? 'الترم الثاني' : activeTab === 'books' ? 'الملفات والملخصات' : activeTab === 'notifications' ? 'التنبيهات' : 'الملف الشخصي'}</h2>
              <p style={{ color: theme.subText, fontSize: '14px' }}>{selectedSubject ? `مادة: ${selectedSubject}` : 'مرحباً بك في رحلتك التعليمية'}</p>
           </div>
           <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
             {isMobile && <ThemeToggle mode={themeMode} onToggle={toggleTheme} theme={theme} />}
             {isMobile && <i className="fas fa-sign-out-alt" onClick={() => setUser(null)} style={{ color: theme.danger, fontSize:'24px' }}></i>}
           </div>
        </div>

        {!studentDetails?.isSubscribed ? (
          <div className="fade-in" style={{ textAlign: 'center', padding: '60px 20px', background: theme.surface, borderRadius: '30px', border: `1px solid ${theme.border}` }}>
            <div className="lock-icon-container"><i className="fas fa-lock" style={{ fontSize: '50px', color: theme.accent }}></i></div>
            <h2 style={{ marginBottom: '10px' }}>المحتوى مقيد</h2>
            <p style={{ color: theme.subText, marginBottom: '30px' }}>
              أدخل الكود الصحيح وسيتم تفعيل الحساب فوراً. إذا كان الكود لفرقة مختلفة سيتم فتح محتوى هذه الفرقة تلقائياً.
            </p>
            <div style={{ maxWidth: '400px', margin: '0 auto', display: 'flex', gap: '10px' }}>
              <input type="text" inputMode="numeric" dir="ltr" placeholder="أدخل كود التفعيل..." className="gold-input" value={inputCode} onChange={(e) => setInputCode(keepEnglishDigitsOnly(e.target.value))} />
              <button onClick={handleActivateCode} className="btn-primary" style={{ width: '120px' }} disabled={activating}>{activating ? '...' : 'تفعيل'}</button>
            </div>
          </div>
        ) : (
          <div className="fade-in">
            {activeTab === 'home' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                {lastWatched && (
                  <div className="stat-card" style={{ textAlign: 'right' }}>
                    <div style={{ color: theme.accent, marginBottom: '10px', fontSize: '14px' }}>تابع من حيث توقفت</div>
                    <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>{lastWatched.title}</h3>
                    <p>{lastWatched.subject || 'عام'}</p>
                  </div>
                )}
                <div className="stat-card"><i className="fas fa-video gold-text" style={{fontSize: '24px'}}></i><h3>{studentLessons.length}</h3><p>محاضرة متاحة</p></div>
                <div className="stat-card"><i className="fas fa-check-circle gold-text" style={{fontSize: '24px'}}></i><h3>{activeAccessYear}</h3><p>محتوى الكود الحالي</p></div>
                <div className="stat-card"><i className="fas fa-file-pdf gold-text" style={{fontSize: '24px'}}></i><h3>{pdfLessons.length}</h3><p>ملف PDF متاح</p></div>
              </div>
            )}
            {activeTab === 'books' && (
              <div className="fade-in">
                {pdfLessons.length > 0 ? (
                  <div className="lectures-grid">
                    {pdfLessons.map((lesson) => (
                      <div key={lesson.id} className="lecture-card">
                        <div style={{ padding: '22px' }}>
                          <div style={{ color: theme.accent, fontSize: '24px', marginBottom: '14px' }}>
                            <i className="fas fa-file-pdf"></i>
                          </div>
                          <h3 style={{ margin: '0 0 8px', color: theme.text }}>{lesson.title}</h3>
                          <p style={{ margin: '0 0 16px', color: theme.subText, fontSize: '13px' }}>{lesson.subject || 'عام'}</p>
                          <a href={lesson.pdfUrl} target="_blank" rel="noreferrer" className="btn-watch" style={{ display: 'inline-flex', textDecoration: 'none', justifyContent: 'center' }}>
                            فتح الملزمة
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="stat-card"><p>قريباً سيتم إضافة قسم الملفات والملخصات.</p></div>
                )}
              </div>
            )}
            {activeTab === 'notifications' && (
              <div className="fade-in" style={{ display: 'grid', gap: '16px' }}>
                <div className="stat-card" style={{ textAlign: 'right' }}>
                  <div style={{ color: theme.accent, marginBottom: '10px', fontWeight: 'bold' }}>إشعار عام</div>
                  <p style={{ color: theme.text, margin: 0 }}>{announcement || 'لا توجد إعلانات جديدة حالياً.'}</p>
                </div>
                <div className="stat-card" style={{ textAlign: 'right' }}>
                  <div style={{ color: theme.accent, marginBottom: '10px', fontWeight: 'bold' }}>آخر المحاضرات</div>
                  {latestLessons.length > 0 ? latestLessons.map((lesson) => (
                    <div key={lesson.id} style={{ padding: '10px 0', borderBottom: `1px solid ${theme.borderSoft}` }}>
                      <div style={{ color: theme.text, fontWeight: 'bold' }}>{lesson.title}</div>
                      <div style={{ color: theme.subText, fontSize: '12px' }}>{lesson.subject || 'عام'}</div>
                    </div>
                  )) : <p style={{ color: theme.subText, margin: 0 }}>لا توجد تنبيهات جديدة.</p>}
                </div>
              </div>
            )}
            {activeTab === 'profile' && (
              <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px)', gap: '20px' }}>
                <div className="stat-card" style={{ textAlign: 'right' }}>
                  <div className="avatar-gold" style={{ margin: '0 0 18px auto' }}>{studentDetails?.name?.[0]?.toUpperCase()}</div>
                  <h3 style={{ fontSize: '22px' }}>{studentDetails?.name}</h3>
                  <p style={{ color: theme.accent }}>@{studentDetails?.username || user.username}</p>
                  <div style={{ display: 'grid', gap: '10px', marginTop: '18px', color: theme.text }}>
                    <div>الفرقة: {studentDetails?.year}</div>
                    <div>رقم الهاتف: {studentDetails?.phone || 'غير مسجل'}</div>
                    <div>الحالة: <span style={{ color: studentDetails?.isBanned ? theme.danger : theme.success }}>{studentDetails?.isBanned ? 'محظور' : 'نشط'}</span></div>
                    <div>الإشعارات: غير مفعلة على الويب</div>
                  </div>
                  <div style={{ marginTop: '20px' }}>
                    <button onClick={() => setUser(null)} className="btn-primary" style={{ width: '100%' }}>تسجيل الخروج</button>
                  </div>
                </div>
                <ContactSupport compact theme={theme} />
              </div>
            )}
            {(activeTab === 'sem1' || activeTab === 'sem2') && (
              <>
                {!selectedSubject ? (
                  <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                    {getSubjectsForSemester(activeTab === 'sem1' ? 'الأول' : 'الثاني').map((subject, idx) => (
                      <div key={idx} className="subject-card" onClick={() => { setSelectedSubject(subject); setSelectedChapter(null); }}>
                        <div className="subject-icon"><i className="fas fa-folder-open"></i></div>
                        <h3>{subject}</h3>
                        <span>{studentLessons.filter(l => l.subject === subject && l.semester === (activeTab === 'sem1' ? 'الأول' : 'الثاني') && l.isActive).length} محاضرة</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="fade-in">
                    <button className="btn-back" onClick={() => { setSelectedSubject(null); setSelectedChapter(null); }}><i className="fas fa-chevron-right"></i> عودة لكل المواد</button>
                    {(() => {
                      const subjectLessons = studentLessons.filter(l => l.semester === (activeTab === 'sem1' ? 'الأول' : 'الثاني') && l.subject === selectedSubject && l.isActive);
                      const subjectId = subjectLessons.find((lesson) => lesson.subjectId)?.subjectId;
                      const subjectChapters = [
                        ...(subjectId ? (chaptersBySubject[subjectId] || []) : []),
                        ...(chaptersBySubject[`name:${selectedSubject}`] || []),
                      ].filter((chapter, index, list) => list.findIndex((item) => item.id === chapter.id) === index);
                      if (!subjectChapters.length) return null;
                      return (
                        <div className="chapter-strip">
                          <button className={`chapter-chip ${!selectedChapter ? 'active' : ''}`} onClick={() => setSelectedChapter(null)}>كل المحاضرات</button>
                          {subjectChapters.map((chapter) => (
                            <button key={chapter.id} className={`chapter-chip ${selectedChapter?.id === chapter.id ? 'active' : ''}`} onClick={() => setSelectedChapter(chapter)}>
                              {chapter.name}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                    <div className="lectures-grid">
                      {studentLessons.filter(l => l.semester === (activeTab === 'sem1' ? 'الأول' : 'الثاني') && l.subject === selectedSubject && l.isActive && (!selectedChapter || l.chapterId === selectedChapter.id || l.chapterName === selectedChapter.name)).map(lesson => (
                          <div key={lesson.id} className="lecture-card">
                            <div className="thumb-container" onClick={() => handleWatchVideo(lesson)}>
                               <img src={lesson.thumbnail || "https://img.freepik.com/free-vector/abstract-gold-background_23-2148390518.jpg"} alt="" />
                               <div className="play-btn-overlay"><i className="fas fa-play"></i></div>
                            </div>
                            <div style={{ padding: '20px' }}>
                              <h3 style={{ fontSize: '16px', margin: '0 0 15px 0', color: theme.text }}>{lesson.title}</h3>
                              <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => handleWatchVideo(lesson)} className="btn-watch"><i className="fas fa-play"></i> مشاهدة</button>
                                {lesson.pdfUrl && (<a href={lesson.pdfUrl} target="_blank" rel="noreferrer" className="btn-pdf"><i className="fas fa-file-pdf"></i></a>)}
                              </div>
                            </div>
                          </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {selectedVideo && (
          <div className="video-overlay" onClick={() => setSelectedVideo(null)}>
            <div className="video-content" onClick={e => e.stopPropagation()}>
              <div className="video-player-container">
                <div className="watermark" style={{ top: wmPos.top, left: wmPos.left }}>{studentDetails?.name} <br /> {studentDetails?.phone}</div>
                {isEmbedVideo(selectedVideo) ? (
                  <iframe
                    src={selectedVideoUrl || getEmbeddableUrl(selectedVideo.url)}
                    title={selectedVideo.title}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    sandbox="allow-scripts allow-same-origin allow-presentation"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                ) : (
                  <video src={selectedVideoUrl || selectedVideo.url} controls controlsList="nodownload noplaybackrate" disablePictureInPicture autoPlay onContextMenu={e => e.preventDefault()} />
                )}
              </div>
              <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <h3 style={{ color: theme.accent, margin: 0 }}>{selectedVideo.title}</h3>
                 <button onClick={() => setSelectedVideo(null)} className="btn-close">إغلاق</button>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        /* حماية المتصفح الأساسية */
        .protected-container {
          -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;
        }
        img, video { pointer-events: none; }
        
        .avatar-gold { width: 80px; height: 80px; border: 2px solid ${theme.accent}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; font-size: 30px; font-weight: bold; color: ${theme.accent}; background: ${theme.accent}11; }
        .sidebar-logo { width: 88px; height: 88px; object-fit: cover; border-radius: 24px; border: 1px solid ${theme.border}; box-shadow: 0 14px 30px rgba(0,0,0,0.24); }
        .gold-input { background: ${theme.surfaceAlt}; color: ${theme.text}; border: 1px solid ${theme.borderSoft}; padding: 14px; border-radius: 12px; outline: none; width: 100%; transition: 0.3s; }
        .gold-input:focus { border-color: ${theme.accent}; }
        .btn-primary { background: ${theme.gradient}; color: ${theme.buttonText}; border: none; padding: 14px; border-radius: 12px; font-weight: bold; cursor: pointer; transition: 0.3s; }
        .gold-text { color: ${theme.accent}; }
        .subject-card { background: ${theme.surface}; border: 1px solid ${theme.border}; border-radius: 20px; padding: 25px; text-align: center; cursor: pointer; transition: 0.3s; }
        .subject-card:hover { transform: translateY(-5px); border-color: ${theme.accent}; background: ${theme.surfaceAlt}; }
        .subject-icon { font-size: 30px; color: ${theme.accent}; margin-bottom: 15px; opacity: 0.8; }
        .btn-back { background: none; border: 1px solid ${theme.accent}; color: ${theme.accent}; padding: 8px 15px; border-radius: 10px; cursor: pointer; margin-bottom: 20px; font-family: 'Cairo'; }
        .chapter-strip { display: flex; gap: 10px; overflow-x: auto; padding: 0 0 16px; margin-bottom: 6px; }
        .chapter-chip { flex-shrink: 0; background: ${theme.surfaceAlt}; color: ${theme.text}; border: 1px solid ${theme.borderSoft}; border-radius: 999px; padding: 9px 15px; cursor: pointer; font-family: 'Cairo'; font-weight: 800; }
        .chapter-chip.active { background: ${theme.accent}; color: ${theme.buttonText}; border-color: ${theme.accent}; }
        .stat-card { background: ${theme.surface}; padding: 30px; border-radius: 25px; text-align: center; border: 1px solid ${theme.border}; }
        .stat-card h3 { font-size: 28px; color: ${theme.accent}; margin: 10px 0; }
        .lectures-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 25px; }
        .lecture-card { background: ${theme.surface}; border-radius: 20px; overflow: hidden; border: 1px solid ${theme.border}; transition: 0.3s; }
        .lecture-card:hover { transform: translateY(-8px); border-color: ${theme.accent}; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
        .thumb-container { position: relative; aspect-ratio: 16/9; cursor: pointer; }
        .thumb-container img { width: 100%; height: 100%; object-fit: cover; }
        .play-btn-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; font-size: 40px; color: ${theme.accent}; opacity: 0; transition: 0.3s; }
        .lecture-card:hover .play-btn-overlay { opacity: 1; }
        .btn-watch { flex: 1; background: ${theme.accent}; color: ${theme.buttonText}; border: none; padding: 10px; border-radius: 10px; font-weight: bold; cursor: pointer; pointer-events: auto; }
        .btn-pdf { background: ${theme.danger}22; color: ${theme.danger}; border: 1px solid ${theme.danger}44; padding: 10px 15px; border-radius: 10px; cursor: pointer; pointer-events: auto; }
        .video-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: ${theme.overlay}; z-index: 2000; display: flex; align-items: center; justify-content: center; }
        .video-content { width: 95%; max-width: 1000px; background: ${theme.surface}; border-radius: 25px; overflow: hidden; border: 1px solid ${theme.border}; }
        .video-player-container { position: relative; background: #000; aspect-ratio: 16/9; }
        .video-player-container video, .video-player-container iframe { width: 100%; height: 100%; pointer-events: auto; border: 0; }
        .watermark { position: absolute; color: rgba(255,255,255,0.15); font-size: 11px; pointer-events: none; z-index: 100; text-align: center; text-shadow: 1px 1px 2px #000; transition: 1s; }
        .btn-close { background: ${theme.surfaceAlt}; color: ${theme.text}; border: none; padding: 8px 20px; border-radius: 8px; cursor: pointer; pointer-events: auto; }
        .loader-container { height: 100vh; display: flex; align-items: center; justify-content: center; background: ${theme.bg}; }
        .gold-loader { width: 50px; height: 50px; border: 3px solid ${theme.accent}22; border-top-color: ${theme.accent}; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fade-in { animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default StudentPlatform;

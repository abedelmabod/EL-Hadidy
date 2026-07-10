import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, doc } from "firebase/firestore";
import AdminDashboard from './AdminDashboard';
import StudentPlatform from './StudentPlatform'; 
import Login from './Login';
import Swal from 'sweetalert2';
import { subscribeToLiveCollection } from './services/firestore-service';
import SupportAdmin from './SupportAdmin';
import { resolveWebTheme, THEME_STORAGE_KEY } from './theme/theme-config';
import { DeleteAccountPage, PrivacyPolicy, TermsPage } from './LegalPages';
import DeveloperPage from './DeveloperPage';

function App() {
  const [user, setUser] = useState(null);
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
  const [activeTab, setActiveTab] = useState('stats'); 
  const [studentsDB, setStudentsDB] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [questionsDB, setQuestionsDB] = useState([]);
  const [codesDB, setCodesDB] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [logsDB, setLogsDB] = useState([]); // سجلات الرقابة
  const [supportRequests, setSupportRequests] = useState([]);
  const [announcement, setAnnouncement] = useState("");
  const theme = resolveWebTheme(themeMode);

  const [newLesson, setNewLesson] = useState({ 
    title: '', description: '', url: '', year: 'الفرقة الأولى', semester: 'الأول', pdfUrl: '', videoKind: 'direct', isActive: true, subject: '', subjectId: '', chapterId: '', chapterName: '' 
  });

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      const unsubStudent = onSnapshot(doc(db, "students", user.id), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const currentDeviceId = navigator.userAgent + "_" + navigator.platform;

          const registeredDeviceIds = Array.isArray(data.deviceIds)
            ? data.deviceIds
            : (data.deviceId ? [data.deviceId] : []);

          if (registeredDeviceIds.length && !registeredDeviceIds.includes(currentDeviceId)) {
            Swal.fire({
              title: 'تنبيه أمني', text: 'تم فتح الحساب من جهاز آخر، سيتم تسجيل الخروج.', icon: 'warning', background: theme.surface, color: theme.text, confirmButtonColor: theme.accent
            }).then(() => setUser(null));
          }

          if (data.isBanned) {
            Swal.fire({
              title: 'تم حظر الحساب', text: data.banReason || 'يرجى التواصل مع الإدارة', icon: 'error', background: theme.surface, color: theme.text, confirmButtonColor: theme.accent
            }).then(() => setUser(null));
          }
        }
      });
      return () => unsubStudent();
    }
  }, [user]);

  useEffect(() => {
    const unsubS = subscribeToLiveCollection(db, "students", {
      onData: setStudentsDB,
    });
    const unsubL = subscribeToLiveCollection(db, "lessons", {
      onData: setLessons,
    });
    const unsubC = onSnapshot(collection(db, "codes"), (s) => setCodesDB(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubSub = onSnapshot(collection(db, "subjects"), (s) => setSubjects(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubSupportRequests = onSnapshot(collection(db, "supportRequests"), (s) => {
      const requestsData = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setSupportRequests(requestsData.sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)));
    });
    const unsubLogs = onSnapshot(collection(db, "logs"), (s) => {
       const logsData = s.docs.map(d => ({ id: d.id, ...d.data() }));
       setLogsDB(logsData.sort((a, b) => b.time?.toDate() - a.time?.toDate())); // ترتيب تنازلي
    });
    const unsubA = onSnapshot(doc(db, "settings", "global"), (d) => d.exists() && setAnnouncement(d.data().text));
    
    return () => { unsubS(); unsubL(); unsubC(); unsubSub(); unsubSupportRequests(); unsubLogs(); unsubA(); };
  }, []);

  const toggleTheme = () => {
    setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const currentPath = window.location.pathname.replace(basePath, '') || '/';
  if (currentPath === '/privacy' || currentPath === '/privacy-policy') return <PrivacyPolicy />;
  if (currentPath === '/terms') return <TermsPage />;
  if (currentPath === '/delete-account' || currentPath === '/account-deletion') return <DeleteAccountPage />;
  if (currentPath === '/developer' || currentPath === '/about-developer') return <DeveloperPage />;

  if (!user) return <Login setUser={setUser} theme={theme} themeMode={themeMode} toggleTheme={toggleTheme} />;

  if (user.role === 'admin') {
    return (
      <AdminDashboard 
        theme={theme}
        themeMode={themeMode}
        toggleTheme={toggleTheme}
        activeTab={activeTab} setActiveTab={setActiveTab}
        studentsDB={studentsDB} lessons={lessons} codesDB={codesDB} subjects={subjects} logsDB={logsDB} supportRequests={supportRequests}
        announcement={announcement} setAnnouncement={setAnnouncement}
        setUser={setUser} setLessons={setLessons} setStudentsDB={setStudentsDB} setCodesDB={setCodesDB}
        newLesson={newLesson} setNewLesson={setNewLesson}
      />
    );
  }

  if (user.role === 'support') {
    return <SupportAdmin setUser={setUser} theme={theme} themeMode={themeMode} toggleTheme={toggleTheme} supportRequests={supportRequests} />;
  }

  return (
    <StudentPlatform
      theme={theme}
      themeMode={themeMode}
      toggleTheme={toggleTheme}
      user={user}
      setUser={setUser}
      announcement={announcement}
      lessons={lessons}
      subjects={subjects}
    />
  );
}

export default App;

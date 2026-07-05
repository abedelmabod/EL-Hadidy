// theme.js - النسخة الكاملة والاحترافية (الأسود والذهبي)
// تم التصميم بناءً على ملفات App.jsx و AdminDashboard.jsx

export const styles = {
  // --- 1. شاشات الدخول (Auth) ---
  authContainer: { 
    height: '100vh', 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    background: '#050505', 
    direction: 'rtl',
    fontFamily: "'Cairo', sans-serif"
  },
  authCard: { 
    padding: '40px', 
    background: '#0a0a0a', 
    borderRadius: '28px', 
    border: '1px solid #D4AF37', 
    textAlign: 'center', 
    width: '100%',
    maxWidth: '350px', 
    boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
    boxSizing: 'border-box'
  },
  input: { 
    width: '100%', 
    padding: '14px', 
    marginBottom: '12px', 
    background: '#111', 
    border: '1px solid #222', 
    color: '#fff', 
    borderRadius: '12px', 
    outline: 'none', 
    boxSizing: 'border-box', 
    textAlign: 'right',
    fontSize: '14px'
  },
  inputCode: { 
    width: '100%', 
    padding: '14px', 
    marginBottom: '12px', 
    background: '#111', 
    border: '2px solid #D4AF37', 
    color: '#fff', 
    borderRadius: '12px', 
    outline: 'none', 
    boxSizing: 'border-box', 
    textAlign: 'center', 
    fontWeight: 'bold',
    fontSize: '18px',
    letterSpacing: '2px'
  },
  inputFlex: { 
    flex: 1, 
    padding: '12px', 
    background: '#111', 
    border: '1px solid #222', 
    color: '#fff', 
    borderRadius: '10px', 
    outline: 'none',
    textAlign: 'right'
  },
  goldBtn: { 
    width: '100%', 
    padding: '14px', 
    background: 'linear-gradient(45deg, #D4AF37, #F9E27E)', 
    border: 'none', 
    borderRadius: '12px', 
    fontWeight: 'bold', 
    cursor: 'pointer', 
    color: '#000', 
    marginTop: '10px', 
    fontSize: '16px',
    boxShadow: '0 5px 15px rgba(212,175,55,0.3)',
    transition: '0.3s'
  },
  goldBtnDisabled: { 
    width: '100%', 
    padding: '14px', 
    background: '#333', 
    border: 'none', 
    borderRadius: '12px', 
    fontWeight: 'bold', 
    cursor: 'not-allowed', 
    color: '#666', 
    marginTop: '10px' 
  },
  switchLink: { 
    color: '#888', 
    marginTop: '20px', 
    cursor: 'pointer', 
    fontSize: '13px', 
    display: 'block',
    textDecoration: 'none'
  },

  // --- 2. لوحة تحكم الأدمن (Admin Dashboard) ---
  adminLayout: { 
    display: 'flex', 
    direction: 'rtl', 
    minHeight: '100vh', 
    background: '#050505', 
    color: '#fff' 
  },
  sidebar: { 
    width: '260px', 
    background: '#000', 
    padding: '30px 15px', 
    borderLeft: '1px solid #1a1a1a', 
    display: 'flex', 
    flexDirection: 'column',
    height: '100vh',
    position: 'sticky',
    top: 0
  },
  content: { 
    flex: 1, 
    padding: '40px', 
    overflowY: 'auto',
    background: '#050505'
  },
  navBtn: { 
    width: '100%', 
    padding: '14px 15px', 
    background: 'none', 
    color: '#888', 
    border: 'none', 
    textAlign: 'right', 
    cursor: 'pointer', 
    borderRadius: '12px', 
    marginBottom: '8px',
    fontSize: '15px',
    transition: '0.3s'
  },
  activeNavBtn: { 
    width: '100%', 
    padding: '14px 15px', 
    background: 'rgba(212, 175, 55, 0.1)', 
    color: '#D4AF37', 
    borderRadius: '12px', 
    fontWeight: 'bold',
    borderRight: '4px solid #D4AF37'
  },
  adminAvatar: { 
    width: '65px', 
    height: '65px', 
    background: 'linear-gradient(45deg, #D4AF37, #F9E27E)', 
    borderRadius: '50%', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    color: '#000', 
    margin: '0 auto 35px', 
    fontWeight: 'bold', 
    fontSize: '1.6rem',
    boxShadow: '0 5px 20px rgba(0,0,0,0.4)'
  },
  
  // الإحصائيات (Stats)
  statsGrid: { 
    display: 'grid', 
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
    gap: '25px', 
    marginBottom: '40px' 
  },
  statBox: { 
    background: '#0f0f0f', 
    padding: '30px', 
    borderRadius: '24px', 
    textAlign: 'center', 
    border: '1px solid #1a1a1a',
    boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
    transition: '0.3s'
  },

  // رفع المحاضرات
  uploadGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', margin: '20px 0' },
  uploadBox: { 
    border: '2px dashed rgba(212, 175, 55, 0.3)', 
    padding: '25px', 
    borderRadius: '18px', 
    textAlign: 'center', 
    background: '#080808',
    transition: '0.3s'
  },
  uploadLabel: { color: '#D4AF37', display: 'block', marginBottom: '12px', fontSize: '0.95rem', fontWeight: 'bold' },
  textArea: { 
    width: '100%', height: '100px', background: '#111', border: '1px solid #222', 
    color: '#fff', borderRadius: '14px', padding: '15px', outline: 'none', marginBottom: '10px', boxSizing: 'border-box' 
  },

  // --- 3. واجهة الطالب (Student Interface) ---
  studentContainer: { 
    maxWidth: '1200px', 
    margin: '0 auto', 
    padding: '35px 20px', 
    direction: 'rtl',
    background: '#050505'
  },
  announcementBar: { 
    background: 'linear-gradient(90deg, #D4AF37, #B8860B)', 
    color: '#000', 
    padding: '16px', 
    borderRadius: '16px', 
    marginBottom: '35px', 
    fontWeight: 'bold', 
    textAlign: 'center',
    boxShadow: '0 10px 30px rgba(212,175,55,0.2)'
  },
  profileCard: { 
    background: 'linear-gradient(145deg, #111, #080808)', 
    padding: '28px', 
    borderRadius: '28px', 
    border: '1px solid rgba(212, 175, 55, 0.1)', 
    marginBottom: '40px' 
  },
  profileFlex: { display: 'flex', gap: '20px', alignItems: 'center' },
  avatarLarge: { 
    width: '75px', height: '75px', borderRadius: '50%', 
    background: 'linear-gradient(45deg, #D4AF37, #F9E27E)', 
    display: 'flex', alignItems: 'center', justifyContent: 'center', 
    color: '#000', fontWeight: 'bold', fontSize: '2rem' 
  },
  
  semesterTabs: { 
    display: 'flex', gap: '15px', justifyContent: 'center', marginBottom: '35px' 
  },
  tab: { 
    flex: 1, maxWidth: '160px', padding: '15px', background: '#111', color: '#777', 
    border: 'none', borderRadius: '14px', cursor: 'pointer', transition: '0.3s' 
  },
  tabActive: { 
    flex: 1, maxWidth: '160px', padding: '15px', background: '#D4AF37', 
    color: '#000', borderRadius: '14px', fontWeight: 'bold', boxShadow: '0 8px 20px rgba(212,175,55,0.3)' 
  },
  
  studentGrid: { 
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '30px' 
  },
  premiumCard: { 
    background: '#0c0c0c', 
    padding: '25px', 
    borderRadius: '28px', 
    border: '1px solid #1a1a1a', 
    display: 'flex', 
    flexDirection: 'column', 
    boxShadow: '0 20px 45px rgba(0,0,0,0.6)',
    marginBottom: '20px',
    overflow: 'hidden'
  },
  
  // فيديو ملموم واحترافي
  videoWrapper: { 
    position: 'relative', 
    width: '100%', 
    background: '#000', 
    borderRadius: '20px', 
    overflow: 'hidden', 
    border: '1px solid #222', 
    margin: '20px 0',
    boxShadow: '0 5px 15px rgba(0,0,0,0.5)'
  },
  videoElement: { 
    width: '100%', 
    maxHeight: '240px', 
    display: 'block', 
    objectFit: 'contain',
    background: '#000'
  },
  watermarkFloating: { 
    position: 'absolute', 
    color: 'rgba(255, 255, 255, 0.08)', 
    pointerEvents: 'none', 
    zIndex: 10, 
    fontSize: '12px',
    textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
  },
  
  actionRow: { marginTop: '15px', display: 'flex', gap: '10px' },
  qArea: { display: 'flex', gap: '10px', marginTop: '20px', alignItems: 'center' },
  
  goldBtnSmall: { 
    background: 'linear-gradient(45deg, #D4AF37, #B8860B)', 
    border: 'none', 
    padding: '10px 22px', 
    borderRadius: '12px', 
    fontWeight: 'bold', 
    cursor: 'pointer', 
    color: '#000', 
    fontSize: '0.9rem' 
  },
  logoutBtn: { 
    display: 'block', 
    margin: '50px auto 0', 
    background: 'none', 
    color: '#ff4d4d', 
    border: '1px solid #ff4d4d', 
    padding: '12px 40px', 
    borderRadius: '14px', 
    cursor: 'pointer', 
    transition: '0.3s' 
  },
  logoutBtnMain: { 
    marginTop: 'auto', 
    background: 'none', 
    color: '#ff4d4d', 
    border: '1px solid #ff4d4d', 
    padding: '12px', 
    borderRadius: '12px', 
    cursor: 'pointer',
    textAlign: 'center'
  },

  // --- 4. العناصر العامة (General) ---
  goldText: { color: '#D4AF37', fontWeight: 'bold', fontSize: '1.4rem', marginBottom: '15px' },
  card: { 
    background: '#0a0a0a', 
    padding: '30px', 
    borderRadius: '24px', 
    border: '1px solid #1a1a1a', 
    marginBottom: '25px' 
  },
  adminTable: { width: '100%', textAlign: 'right', borderCollapse: 'collapse', color: '#fff' },
  tableHeaderRow: { color: '#D4AF37', borderBottom: '2px solid #222', height: '50px' },
  tableBodyRow: { borderBottom: '1px solid #111', height: '60px' },
  
  adminLessonsGrid: { 
    display: 'grid', 
    gap: '20px', 
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' 
  },
  lessonCardSmall: { 
    background: '#0f0f0f', 
    border: '1px solid #1a1a1a', 
    padding: '18px', 
    borderRadius: '22px' 
  },
  videoPreview: { 
    width: '100%', 
    height: '160px', 
    background: '#000', 
    borderRadius: '14px', 
    overflow: 'hidden', 
    marginBottom: '12px' 
  },

  noMargin: { margin: 0, color: '#fff' },
  subText: { margin: 0, color: '#888', fontSize: '0.9rem' },
  codesGrid: { 
    display: 'grid', 
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
    gap: '12px', 
    marginTop: '20px' 
  },
  codeItem: { 
    background: 'rgba(212, 175, 55, 0.05)', 
    padding: '12px', 
    borderRadius: '10px', 
    textAlign: 'center', 
    border: '1px solid #D4AF37', 
    color: '#D4AF37', 
    fontWeight: 'bold' 
  },
  resetBtn: { color: '#00c8ff', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' },
  deleteBtn: { color: '#ff4d4d', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }, 
  adminLayout: {
    display: 'flex',
    flexDirection: window.innerWidth < 768 ? 'column' : 'row', // يقلب عمودي في الموبايل
    minHeight: '100vh',
    background: '#050505',
    color: '#fff',
    fontFamily: "'Cairo', sans-serif",
  },
  
  sidebar: {
    width: window.innerWidth < 768 ? '100%' : '260px',
    height: window.innerWidth < 768 ? 'auto' : '100vh',
    background: '#0a0a0a',
    borderLeft: window.innerWidth < 768 ? 'none' : '2px solid #D4AF37',
    borderBottom: window.innerWidth < 768 ? '2px solid #D4AF37' : 'none',
    padding: '20px',
    display: 'flex',
    flexDirection: window.innerWidth < 768 ? 'row' : 'column', // الأزرار جنب بعض في الموبايل
    overflowX: window.innerWidth < 768 ? 'auto' : 'unset', // سكرول عرضي للأزرار في الموبايل
    gap: '10px',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
  },

  content: {
    flex: 1,
    padding: window.innerWidth < 768 ? '15px' : '40px',
    paddingBottom: '80px', // مساحة عشان الموبايل
  },

  // تعديل الجداول لتكون مستجيبة
  adminTable: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '20px',
    fontSize: window.innerWidth < 768 ? '12px' : '16px',
    display: window.innerWidth < 768 ? 'block' : 'table',
    overflowX: 'auto',
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns: window.innerWidth < 768 ? '1fr' : '1fr 1fr 1fr', // عمود واحد في الموبايل
    gap: '15px',
    marginBottom: '30px',
  },

  uploadGrid: {
    display: 'grid',
    gridTemplateColumns: window.innerWidth < 768 ? '1fr' : '1fr 1fr',
    gap: '15px',
    marginBottom: '20px',
  }

};
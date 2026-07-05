import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { app, auth, db, storage } from './firebase';
import ThemeToggle from './ThemeToggle';
import {
  logDeviceResetRequest,
  keepEnglishDigitsOnly,
  normalizeEnglishDigits,
  registerStudentWithCode,
  SharedAuthError,
  signInWithSharedCredentials,
} from './services/auth-service';

const Login = ({ setUser, theme, themeMode, toggleTheme }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [regData, setRegData] = useState({ 
    name: '', username: '', phone: '', password: '', year: 'الفرقة الأولى', code: '' 
  });

  const getDeviceType = () => {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return "Android";
    if (/iPad|iPhone|iPod/.test(ua)) return "iOS";
    if (/windows/i.test(ua)) return "Windows";
    if (/Macintosh/i.test(ua)) return "MacOS";
    return "Unknown";
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signInWithSharedCredentials(
        { app, auth, db, storage },
        {
          identifier: normalizeEnglishDigits(formData.username),
          password: formData.password,
          device: {
            id: navigator.userAgent + "_" + navigator.platform,
            type: getDeviceType(),
            info: navigator.userAgent.includes("Mobi") ? "Mobile" : "PC / Laptop",
          },
        }
      );

      setUser(result.user);
    } catch (err) {
      if (err instanceof SharedAuthError && err.code === "DEVICE_MISMATCH") {
        const result = await Swal.fire({
          title: 'جهاز غير مصرح به',
          text: 'هذا الحساب مسجل على جهاز آخر. هل تريد إرسال طلب تصفير للإدارة؟',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'إرسال طلب تصفير',
          cancelButtonText: 'إلغاء',
          background: theme.surface,
          color: theme.text,
          confirmButtonColor: theme.accent,
        });

        if (result.isConfirmed) {
          await logDeviceResetRequest(
            { app, auth, db, storage },
            {
              studentId: err.details?.profile?.id,
              studentName: err.details?.profile?.data?.name,
              deviceType: getDeviceType(),
            }
          );

          await Swal.fire({
            title: 'تم الإرسال',
            text: 'تم إرسال طلبك للإدارة بنجاح.',
            icon: 'success',
            background: theme.surface,
            color: theme.text,
          });
        }

        return;
      }

      Swal.fire({ icon: 'error', title: 'تنبيه', text: err.message, background: theme.surface, color: theme.text, confirmButtonColor: theme.accent });
    } finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regData.name || !regData.phone || !regData.username || !regData.password) {
        return Swal.fire({ icon: 'warning', title: 'بيانات ناقصة', text: 'برجاء كتابة كافة البيانات' });
    }
    setLoading(true);
    try {
      const result = await registerStudentWithCode(
        { app, auth, db, storage },
        {
          ...regData,
          device: {
            id: navigator.userAgent + "_" + navigator.platform,
            type: getDeviceType(),
            info: navigator.userAgent.includes("Mobi") ? "Mobile" : "PC / Laptop",
          },
        }
      );

      Swal.fire({ icon: 'success', title: 'تم إنشاء الحساب', text: 'يمكنك الآن إرسال كودك من داخل المنصة وسيتم مراجعته من الإدارة.', background: theme.surface, color: theme.text });
      setUser(result.user);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'فشل التفعيل', text: err.message, background: theme.surface, color: theme.text });
    } finally { setLoading(false); }
  };

  return (
    <div className="login-container">
      <div className="login-card fade-in">
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '16px' }}>
          <ThemeToggle mode={themeMode} onToggle={toggleTheme} theme={theme} />
        </div>
        <div className="logo-section">
          <img className="brand-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="El Hadidy" />
          <h1>د. محمد الحديدي</h1>
          <p>{isRegistering ? 'إنشاء حساب طالب جديد' : 'منصة الحديدي التعليمية'}</p>
        </div>

        {!isRegistering ? (
          <form onSubmit={handleLogin}>
            <div className="input-group">
              <i className="fas fa-user"></i>
              <input type="text" placeholder="اسم المستخدم" required value={formData.username} onChange={e => setFormData({...formData, username: normalizeEnglishDigits(e.target.value)})} />
            </div>
            <div className="input-group">
              <i className="fas fa-lock"></i>
              <input type="password" placeholder="كلمة المرور" required onChange={e => setFormData({...formData, password: e.target.value})} />
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'جاري التحقق...' : 'دخول للمنصة'}
            </button>
            <p className="switch-text" onClick={() => setIsRegistering(true)}>ليس لديك حساب؟ <span>إنشاء حساب جديد</span></p>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <div className="input-group">
                <i className="fas fa-id-card"></i>
                <input placeholder="الاسم الكامل (ثلاثي أو رباعي)" required onChange={e => setRegData({...regData, name: e.target.value})} />
            </div>
            <div className="input-group">
                <i className="fas fa-user-plus"></i>
                <input placeholder="اسم مستخدم (للدخول به)" required value={regData.username} onChange={e => setRegData({...regData, username: normalizeEnglishDigits(e.target.value)})} />
            </div>
            <div className="input-group">
                <i className="fas fa-phone-alt"></i>
                <input type="tel" inputMode="numeric" dir="ltr" placeholder="رقم الهاتف" required value={regData.phone} onChange={e => setRegData({...regData, phone: keepEnglishDigitsOnly(e.target.value)})} />
            </div>
            <div className="input-group">
                <i className="fas fa-key"></i>
                <input type="password" placeholder="كلمة مرور قوية" required onChange={e => setRegData({...regData, password: e.target.value})} />
            </div>
            <div className="input-group">
                <i className="fas fa-layer-group"></i>
                <select className="gold-select" value={regData.year} onChange={e => setRegData({...regData, year: e.target.value})}>
                    <option value="الفرقة الأولى">الفرقة الأولى</option>
                    <option value="الفرقة الثانية">الفرقة الثانية</option>
                    <option value="الفرقة الثالثة">الفرقة الثالثة</option>
                    <option value="الفرقة الرابعة">الفرقة الرابعة</option>
                </select>
            </div>
            <button type="submit" className="login-btn" disabled={loading}>إنشاء الحساب</button>
            <p className="switch-text" onClick={() => setIsRegistering(false)}>لديك حساب بالفعل؟ <span>سجل دخول</span></p>
          </form>
        )}
        <div className="legal-links">
          <a href={`${import.meta.env.BASE_URL}privacy`}>سياسة الخصوصية</a>
          <span>•</span>
          <a href={`${import.meta.env.BASE_URL}terms`}>الشروط والأحكام</a>
          <span>•</span>
          <a href={`${import.meta.env.BASE_URL}delete-account`}>حذف الحساب</a>
        </div>
      </div>

      <style>{`
        .login-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: ${theme.bg}; font-family: 'Cairo', sans-serif; direction: rtl; padding: 20px; transition: 0.3s; }
        .login-card { background: ${theme.surface}; padding: 42px; border-radius: 25px; width: 100%; max-width: 460px; border: 1px solid ${theme.border}; box-shadow: 0 10px 40px rgba(0,0,0,0.18); text-align: center; }
        .brand-logo { width: 148px; height: 148px; object-fit: cover; border-radius: 36px; margin-bottom: 20px; border: 1px solid ${theme.border}; box-shadow: 0 18px 45px rgba(0,0,0,0.30); }
        h1 { 
        color: ${theme.text}; font-size: 30px; margin-bottom: 5px; font-weight: 900; }
        p { color: ${theme.subText}; font-size: 14px; margin-bottom: 30px; }
        .input-group { position: relative; margin-bottom: 15px; }
        .input-group i { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); color: ${theme.accent}; }
        .input-group input, .gold-select { width: 100%; padding: 14px 45px 14px 15px; background: ${theme.surfaceAlt}; border: 1px solid ${theme.borderSoft}; border-radius: 12px; color: ${theme.text}; outline: none; box-sizing: border-box; font-family: 'Cairo'; font-size: 14px; transition: 0.3s; }
        .input-group input:focus { border-color: ${theme.accent}; }
        .gold-select { appearance: none; cursor: pointer; }
        .code-input { border-color: ${theme.accent} !important; font-weight: bold; }
        .login-btn { width: 100%; padding: 16px; background: ${theme.gradient}; border: none; border-radius: 12px; color: ${theme.buttonText}; font-weight: 800; font-size: 16px; cursor: pointer; transition: 0.3s; margin-top: 10px; font-family: 'Cairo'; }
        .login-btn:hover { transform: translateY(-2px); box-shadow: 0 5px 15px ${theme.accent}44; }
        .switch-text { color: ${theme.muted}; margin-top: 25px; font-size: 13px; cursor: pointer; }
        .switch-text span { color: ${theme.accent}; text-decoration: underline; font-weight: bold; }
        .legal-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 22px; color: ${theme.subText}; font-size: 12px; }
        .legal-links a { color: ${theme.accent}; text-decoration: none; font-weight: 700; }
        .fade-in { animation: fadeIn 0.8s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 480px) {
          .brand-logo { width: 128px; height: 128px; border-radius: 32px; }
          .login-card { padding: 32px 22px; }
        }
      `}</style>
    </div>
  );
};

export default Login;

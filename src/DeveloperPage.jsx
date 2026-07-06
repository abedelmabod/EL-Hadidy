import React from 'react';
import { resolveWebTheme, THEME_STORAGE_KEY } from './theme/theme-config';

const contributions = [
  { icon: 'fa-code', title: 'برمجة وتطوير المنصة', text: 'بناء موقع الإدارة وتجربة تطبيق الهاتف وربط جميع أجزاء النظام.' },
  { icon: 'fa-palette', title: 'تصميم وتجهيز الواجهات', text: 'تنظيم تجربة الطالب والمدرس والدعم الفني بما يناسب الاستخدام اليومي.' },
  { icon: 'fa-database', title: 'إعداد النظام والبيانات', text: 'ربط Firebase وإدارة الحسابات والمحتوى والأكواد وطلبات الدعم.' },
  { icon: 'fa-circle-play', title: 'تشغيل المحتوى التعليمي', text: 'تجهيز تكامل Bunny Stream لعرض الفيديوهات والملفات بطريقة مستقرة.' },
];

export default function DeveloperPage() {
  const theme = resolveWebTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
  const baseUrl = import.meta.env.BASE_URL;

  return (
    <main className="developer-page" dir="rtl">
      <nav className="developer-nav">
        <a href={baseUrl} className="back-link"><i className="fas fa-arrow-right"></i> العودة للمنصة</a>
        <img src={`${baseUrl}logo.png`} alt="منصة الحديدي" />
      </nav>

      <section className="developer-hero">
        <div className="developer-mark"><i className="fas fa-laptop-code"></i></div>
        <span className="eyebrow">عن مطوّر المنصة</span>
        <h1>عبدالمعبود احمد</h1>
        <p>مطور تطبيقات ومواقع، والمسؤول عن برمجة وإعداد وتطوير منصة د. محمد الحديدي التعليمية.</p>
        <a className="contact-number" href="https://wa.me/201206785079" target="_blank" rel="noreferrer">
          <i className="fab fa-whatsapp"></i>
          <span dir="ltr">01206785079</span>
        </a>
        <div className="role-badges">
          <span>تطوير الويب</span>
          <span>تطوير تطبيق الهاتف</span>
          <span>إعداد النظام</span>
        </div>
      </section>

      <section className="developer-content">
        <div className="profile-details">
          <div><i className="fas fa-briefcase"></i><span>المسمى الوظيفي</span><strong>مطور تطبيقات ومواقع</strong></div>
          <div><i className="fas fa-envelope"></i><span>البريد الإلكتروني</span><a href="mailto:biboaboshady2002@gmail.com">biboaboshady2002@gmail.com</a></div>
          <div><i className="fas fa-calendar-check"></i><span>سنة التنفيذ</span><strong>2026</strong></div>
        </div>

        <div className="services-panel">
          <div className="section-heading">
            <span>الخدمات</span>
            <h2>خدمات التطوير والبرمجة</h2>
          </div>
          <div className="service-list">
            <span><i className="fas fa-globe"></i> تطوير المواقع</span>
            <span><i className="fas fa-mobile-screen-button"></i> تطبيقات الهاتف</span>
            <span><i className="fas fa-chart-line"></i> لوحات التحكم</span>
            <span><i className="fas fa-cloud"></i> ربط الخدمات السحابية</span>
          </div>
        </div>

        <div className="section-heading">
          <span>ما تم تنفيذه</span>
          <h2>من الفكرة إلى منصة تعليمية متكاملة</h2>
        </div>

        <div className="contribution-grid">
          {contributions.map((item) => (
            <article key={item.title} className="contribution-card">
              <div className="card-icon"><i className={`fas ${item.icon}`}></i></div>
              <div><h3>{item.title}</h3><p>{item.text}</p></div>
            </article>
          ))}
        </div>

        <div className="credit-line">
          <i className="fas fa-code"></i>
          <p>تمت البرمجة والتجهيز بعناية لخدمة طلاب منصة د. محمد الحديدي.</p>
        </div>
      </section>

      <style>{`
        * { box-sizing: border-box; }
        .developer-page { min-height: 100vh; background: ${theme.bg}; color: ${theme.text}; font-family: 'Cairo', Arial, sans-serif; padding: 24px; }
        .developer-nav { width: min(1080px, 100%); margin: 0 auto 26px; min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .developer-nav img { width: 62px; height: 62px; border-radius: 16px; object-fit: cover; }
        .back-link { display: inline-flex; align-items: center; gap: 9px; color: ${theme.accent}; text-decoration: none; font-weight: 900; border: 1px solid ${theme.borderSoft}; background: ${theme.surface}; padding: 10px 15px; border-radius: 8px; }
        .developer-hero { width: min(1080px, 100%); margin: 0 auto; text-align: center; padding: 58px 24px; border: 1px solid ${theme.borderSoft}; border-radius: 8px; background: ${theme.panelGradient}; position: relative; overflow: hidden; }
        .developer-hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(120deg, transparent, ${theme.accent}0D, transparent); pointer-events: none; }
        .developer-mark { width: 82px; height: 82px; margin: 0 auto 18px; display: grid; place-items: center; border-radius: 8px; color: ${theme.buttonText}; background: ${theme.gradient}; font-size: 34px; box-shadow: 0 18px 40px ${theme.accent}25; }
        .eyebrow { color: ${theme.accent}; font-size: 13px; font-weight: 900; }
        .developer-hero h1 { margin: 9px 0; font-size: clamp(32px, 5vw, 52px); line-height: 1.2; }
        .developer-hero p { max-width: 650px; margin: 0 auto; color: ${theme.subText}; font-size: 17px; line-height: 1.9; }
        .contact-number { width: fit-content; margin: 18px auto 0; display: flex; align-items: center; gap: 9px; color: ${theme.accent}; background: ${theme.accent}12; border: 1px solid ${theme.accent}44; border-radius: 8px; padding: 10px 15px; text-decoration: none; font-weight: 900; letter-spacing: 0; }
        .contact-number:hover { border-color: ${theme.accent}; background: ${theme.accent}1F; }
        .role-badges { display: flex; justify-content: center; flex-wrap: wrap; gap: 9px; margin-top: 24px; }
        .role-badges span { border: 1px solid ${theme.accent}44; background: ${theme.accent}12; color: ${theme.accent}; border-radius: 999px; padding: 8px 13px; font-weight: 800; font-size: 12px; }
        .developer-content { width: min(1080px, 100%); margin: 46px auto 0; }
        .profile-details { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
        .profile-details > div { min-width: 0; padding: 18px; background: ${theme.surface}; border: 1px solid ${theme.borderSoft}; border-radius: 8px; display: grid; gap: 5px; }
        .profile-details i { color: ${theme.accent}; font-size: 19px; margin-bottom: 5px; }
        .profile-details span { color: ${theme.subText}; font-size: 12px; font-weight: 800; }
        .profile-details strong, .profile-details a { color: ${theme.text}; font-size: 14px; font-weight: 900; text-decoration: none; overflow-wrap: anywhere; }
        .profile-details a:hover { color: ${theme.accent}; }
        .services-panel { margin-bottom: 38px; padding: 22px; background: ${theme.surface}; border: 1px solid ${theme.borderSoft}; border-radius: 8px; }
        .services-panel .section-heading { margin-bottom: 16px; }
        .service-list { display: flex; flex-wrap: wrap; gap: 9px; }
        .service-list span { display: inline-flex; align-items: center; gap: 8px; padding: 10px 13px; color: ${theme.text}; background: ${theme.surfaceAlt}; border: 1px solid ${theme.borderSoft}; border-radius: 8px; font-size: 13px; font-weight: 800; }
        .service-list i { color: ${theme.accent}; }
        .section-heading { margin-bottom: 20px; }
        .section-heading span { color: ${theme.accent}; font-weight: 900; font-size: 13px; }
        .section-heading h2, .technology-panel h2 { margin: 5px 0 0; font-size: 25px; }
        .contribution-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .contribution-card { background: ${theme.surface}; border: 1px solid ${theme.borderSoft}; border-radius: 8px; padding: 20px; display: flex; align-items: flex-start; gap: 15px; transition: transform .2s ease, border-color .2s ease; }
        .contribution-card:hover { transform: translateY(-3px); border-color: ${theme.accent}88; }
        .card-icon { width: 48px; height: 48px; flex: 0 0 48px; display: grid; place-items: center; border-radius: 8px; color: ${theme.accent}; background: ${theme.accent}14; font-size: 20px; }
        .contribution-card h3 { margin: 0 0 7px; font-size: 17px; }
        .contribution-card p { margin: 0; color: ${theme.subText}; line-height: 1.8; font-size: 13px; }
        .credit-line { margin: 28px 0 8px; padding: 20px; border-top: 1px solid ${theme.borderSoft}; display: flex; justify-content: center; align-items: center; gap: 10px; color: ${theme.subText}; text-align: center; }
        .credit-line i { color: ${theme.accent}; }
        .credit-line p { margin: 0; }
        @media (max-width: 720px) {
          .developer-page { padding: 16px; }
          .developer-hero { padding: 42px 18px; }
          .profile-details { grid-template-columns: 1fr; }
          .contribution-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}

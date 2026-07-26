import React from 'react';
import { resolveWebTheme } from './theme/theme-config';

const APP_NAME = 'منصة الحديدي التعليمية';
const CONTACT_EMAIL = 'elhadidiyplatform@gmail.com';
const SUPPORT_PHONE = '+201044811399';
const LAST_UPDATED = '25 يوليو 2026';
const OFFICIAL_LINKS = {
  privacy: 'https://el-hadidy-ei6w.vercel.app/privacy',
  terms: 'https://el-hadidy-ei6w.vercel.app/terms',
  deleteAccount: 'https://el-hadidy-ei6w.vercel.app/delete-account',
};

function LegalLayout({ title, subtitle, children }) {
  const theme = resolveWebTheme(localStorage.getItem('elhadidy-web-theme-mode') || 'dark');
  const baseUrl = import.meta.env.BASE_URL || '/';

  return (
    <main style={{
      minHeight: '100vh',
      background: theme.bg,
      color: theme.text,
      direction: 'rtl',
      fontFamily: 'Cairo, Arial, sans-serif',
      padding: '32px 18px',
    }}>
      <section style={{
        maxWidth: '920px',
        margin: '0 auto',
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: '22px',
        padding: '30px',
        lineHeight: 1.95,
        boxShadow: '0 18px 45px rgba(0,0,0,0.16)',
      }}>
        <a href={baseUrl} style={{ color: theme.accent, textDecoration: 'none', fontWeight: 900 }}>العودة للمنصة</a>
        <h1 style={{ color: theme.accent, margin: '18px 0 8px', fontSize: '32px' }}>{title}</h1>
        {subtitle && <p style={{ color: theme.subText, marginTop: 0 }}>{subtitle}</p>}
        <p style={{ color: theme.subText, marginTop: 0 }}>آخر تحديث: {LAST_UPDATED}</p>
        <div style={{ display: 'grid', gap: '18px' }}>
          {children}
        </div>
        <div style={{
          marginTop: '28px',
          paddingTop: '18px',
          borderTop: `1px solid ${theme.border}`,
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
        }}>
          <a href={OFFICIAL_LINKS.privacy} style={linkStyle(theme)}>سياسة الخصوصية</a>
          <a href={OFFICIAL_LINKS.deleteAccount} style={linkStyle(theme)}>حذف الحساب</a>
          <a href={OFFICIAL_LINKS.terms} style={linkStyle(theme)}>الشروط والأحكام</a>
        </div>
      </section>
    </main>
  );
}

function linkStyle(theme) {
  return {
    color: theme.accent,
    border: `1px solid ${theme.border}`,
    borderRadius: '12px',
    padding: '8px 12px',
    textDecoration: 'none',
    fontWeight: 800,
  };
}

function Section({ title, children }) {
  return (
    <section>
      <h2 style={{ margin: '0 0 8px', fontSize: '21px' }}>{title}</h2>
      <div style={{ color: 'inherit' }}>{children}</div>
    </section>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalLayout
      title="سياسة الخصوصية"
      subtitle={`توضح هذه الصفحة كيفية جمع واستخدام وحماية بيانات الطلاب داخل ${APP_NAME}.`}
    >
      <Section title="البيانات التي نجمعها">
        <p>
          نجمع البيانات اللازمة لتشغيل الحساب التعليمي فقط، وتشمل: الاسم، اسم المستخدم، البريد الإلكتروني،
          رقم الهاتف، الفرقة الدراسية، رمز التسجيل، حالة التسجيل، طلبات الدعم، نوع الجهاز، ومعرف الجهاز
          المستخدم لتقييد الحساب بعدد الأجهزة المسموح به من الإدارة.
        </p>
        <p>
          قد نحفظ رمز إشعارات الموبايل Expo Push Token لإرسال تنبيهات تعليمية عند إضافة محتوى جديد،
          وسجل مشاهدة الفيديو لمساعدة الطالب على المتابعة من حيث توقف.
        </p>
      </Section>

      <Section title="كيف نستخدم البيانات">
        <p>
          نستخدم البيانات لإنشاء الحساب، تسجيل الدخول، تأكيد التسجيل، عرض محتوى الفرقة المناسبة،
          تقديم الدعم الفني، حماية الفيديوهات والملفات، منع مشاركة الحساب، ومراجعة محاولات مخالفة
          سياسة الأمان مثل تصوير الشاشة أو استخدام الحساب من جهاز غير مصرح به.
        </p>
      </Section>

      <Section title="الخدمات الخارجية">
        <p>
          يتم تخزين بيانات التطبيق وتشغيلها عبر خدمات Firebase/Google السحابية. تتم معالجة وتشغيل وسائط
          الفيديو التعليمية عبر Bunny Stream لتقديم المحاضرات بشكل آمن وسريع.
        </p>
      </Section>

      <Section title="مشاركة البيانات">
        <p>
          لا نبيع بيانات الطلاب ولا نستخدمها للإعلانات أو التتبع الإعلاني. لا تتم مشاركة البيانات إلا
          بالقدر اللازم لتشغيل التطبيق وتقديم المحتوى التعليمي والدعم الفني.
        </p>
      </Section>

      <Section title="الاحتفاظ والحذف">
        <p>
          نحتفظ بالبيانات طالما كان الحساب نشطًا أو طالما كانت مطلوبة للدعم والحماية والالتزامات
          التشغيلية. يمكن للطالب طلب حذف الحساب والبيانات المرتبطة به من صفحة حذف الحساب أو من خلال
          الدعم الفني.
        </p>
      </Section>

      <Section title="التواصل">
        <p>
          لأي طلب متعلق بالخصوصية أو تصحيح البيانات أو حذف الحساب، تواصل معنا عبر البريد:
          {' '}<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          {' '}أو رقم الدعم: {SUPPORT_PHONE}.
        </p>
      </Section>
    </LegalLayout>
  );
}

export function DeleteAccountPage() {
  const mailSubject = encodeURIComponent('طلب حذف حساب - منصة الحديدي');
  const mailBody = encodeURIComponent('أرغب في حذف حسابي والبيانات المرتبطة به نهائيًا.\n\nالاسم:\nاسم المستخدم:\nالبريد الإلكتروني:\nرقم الهاتف:\nالفرقة الدراسية:');

  return (
    <LegalLayout
      title="طلب حذف الحساب"
      subtitle="هذه الصفحة مخصصة لطلبات حذف حساب الطالب والبيانات المرتبطة به."
    >
      <Section title="طريقة طلب الحذف">
        <p>
          يمكن طلب حذف الحساب من داخل التطبيق عبر صفحة حسابي أو الدعم واختيار "طلب حذف الحساب"، أو من خلال
          إرسال بريد إلكتروني إلى فريق الدعم يحتوي على بيانات التحقق الأساسية.
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${mailSubject}&body=${mailBody}`}
          style={{
            display: 'inline-flex',
            marginTop: '8px',
            background: '#7A4E2F',
            color: '#fff',
            borderRadius: '14px',
            padding: '11px 16px',
            textDecoration: 'none',
            fontWeight: 900,
          }}
        >
          إرسال طلب حذف الحساب بالبريد
        </a>
      </Section>

      <Section title="البيانات المطلوبة للتحقق">
        <p>
          يرجى تضمين الاسم، اسم المستخدم، البريد الإلكتروني، رقم الهاتف المسجل، والفرقة الدراسية. قد يطلب
          الدعم الفني معلومات إضافية للتأكد من هوية صاحب الحساب قبل تنفيذ الحذف.
        </p>
      </Section>

      <Section title="ماذا يحدث بعد الطلب؟">
        <p>
          بعد التحقق من الهوية، سيتم حذف الحساب والبيانات المرتبطة به نهائيًا خلال 7 إلى 30 يومًا،
          ما لم نكن ملزمين قانونيًا أو أمنيًا بالاحتفاظ ببعض بيانات السجلات. قد تشمل السجلات التي
          نحتفظ بها عند الضرورة سجلات منع إساءة الاستخدام أو حماية المحتوى.
        </p>
      </Section>

      <Section title="بيانات التواصل">
        <p>
          البريد: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <br />
          رقم الدعم: {SUPPORT_PHONE}
        </p>
      </Section>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="الشروط والأحكام" subtitle={`شروط استخدام ${APP_NAME}.`}>
      <Section title="استخدام الحساب">
        <p>
          الحساب مخصص للاستخدام الشخصي للطالب فقط، ولا يجوز مشاركة بيانات الدخول أو رموز التسجيل مع أي
          طرف آخر.
        </p>
      </Section>
      <Section title="حماية المحتوى">
        <p>
          يمنع تصوير الشاشة أو تسجيل الفيديوهات أو إعادة نشر المحاضرات والملفات. أي مخالفة قد تؤدي
          إلى حظر الحساب أو إيقاف الوصول للمحتوى.
        </p>
      </Section>
      <Section title="رموز التسجيل والدعم">
        <p>
          رمز التسجيل يربط الطالب المسجل مسبقًا بمحتوى الفرقة المرتبطة به. يمكن للدعم الفني تصفير الجهاز
          أو مراجعة الحساب بعد التحقق من هوية الطالب.
        </p>
      </Section>
    </LegalLayout>
  );
}

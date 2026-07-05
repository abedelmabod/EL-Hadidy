import React from 'react';

const FAQ_ITEMS = [
  {
    question: 'كود التفعيل لا يعمل؟',
    answer:
      'تأكد من كتابة الكود بحروف إنجليزية كبيرة، وأن الكود مخصص لنفس الفرقة الدراسية الخاصة بك.',
  },
  {
    question: 'تم حظر الحساب تلقائياً؟',
    answer:
      'يحدث ذلك عند رصد محاولة تصوير محتوى المنصة. تواصل مع الدعم الفني لمراجعة الحالة.',
  },
];

const SUPPORT_PHONE = '01000000000';
const SUPPORT_WHATSAPP = '201000000000';
const SUPPORT_MESSAGE =
  'السلام عليكم، أحتاج مساعدة في منصة د. محمد الحديدي';

function ContactSupport({ compact = false, theme }) {
  const openWhatsApp = () => {
    window.open(
      `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
        SUPPORT_MESSAGE
      )}`,
      '_blank'
    );
  };

  const makeCall = () => {
    window.location.href = `tel:${SUPPORT_PHONE}`;
  };

  return (
    <section
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: '26px',
        padding: compact ? '22px' : '30px',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '22px' }}>
        <div
          style={{
            width: '72px',
            height: '72px',
            margin: '0 auto 12px',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: theme.panelGradient,
            border: `1px solid ${theme.border}`,
            color: theme.accent,
            fontSize: '30px',
          }}
        >
          <i className="fas fa-headset"></i>
        </div>
        <h3 style={{ color: theme.text, margin: '0 0 6px', fontSize: '22px' }}>
          الدعم الفني
        </h3>
        <p style={{ color: theme.subText, margin: 0, fontSize: '14px' }}>
          نحن هنا لمساعدتك في أي مشكلة تخص الحساب أو الكود أو الوصول للمحتوى.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '22px',
        }}
      >
        <button
          onClick={openWhatsApp}
          style={{
            background: theme.surfaceAlt,
            border: `1px solid ${theme.success}`,
            borderRadius: '18px',
            padding: '18px',
            color: theme.text,
            cursor: 'pointer',
          }}
        >
          <div style={{ color: theme.success, fontSize: '26px', marginBottom: '10px' }}>
            <i className="fab fa-whatsapp"></i>
          </div>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>واتساب</div>
          <div style={{ color: theme.subText, fontSize: '13px' }}>تواصل فوري مع الدعم</div>
        </button>

        <button
          onClick={makeCall}
          style={{
            background: theme.surfaceAlt,
            border: `1px solid ${theme.border}`,
            borderRadius: '18px',
            padding: '18px',
            color: theme.text,
            cursor: 'pointer',
          }}
        >
          <div style={{ color: theme.accent, fontSize: '24px', marginBottom: '10px' }}>
            <i className="fas fa-phone-alt"></i>
          </div>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>اتصال هاتفي</div>
          <div style={{ color: theme.subText, fontSize: '13px' }}>{SUPPORT_PHONE}</div>
        </button>
      </div>

      <div>
        <h4 style={{ color: theme.accent, margin: '0 0 12px', fontSize: '16px' }}>
          الأسئلة الشائعة
        </h4>
        <div style={{ display: 'grid', gap: '10px' }}>
          {FAQ_ITEMS.map((item) => (
            <div
              key={item.question}
              style={{
                background: theme.surfaceAlt,
                border: `1px solid ${theme.border}`,
                borderRadius: '16px',
                padding: '14px',
              }}
            >
              <div style={{ color: theme.accent, fontWeight: 'bold', marginBottom: '6px' }}>
                {item.question}
              </div>
              <div style={{ color: theme.subText, fontSize: '13px', lineHeight: 1.7 }}>
                {item.answer}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ContactSupport;

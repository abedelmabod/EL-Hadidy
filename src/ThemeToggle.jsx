import React from 'react';

function ThemeToggle({ mode = 'dark', onToggle, theme }) {
  const isDark = mode === 'dark';
  const lightModeLabel = '\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u0641\u0627\u062a\u062d';
  const darkModeLabel = '\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u062f\u0627\u0643\u0646';

  return (
    <button
      onClick={onToggle}
      type="button"
      style={{
        background: theme?.surfaceAlt || (isDark ? '#20242D' : '#F1F4F8'),
        color: theme?.accent || (isDark ? '#C9A24D' : '#9A5F00'),
        border: `1px solid ${theme?.borderSoft || (isDark ? '#2A2F3A' : '#DDE3EC')}`,
        borderRadius: '999px',
        padding: '10px 14px',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        fontWeight: 'bold',
        boxShadow: isDark ? 'none' : '0 8px 20px rgba(15, 23, 42, 0.06)',
        transition: '0.2s ease',
        whiteSpace: 'nowrap',
      }}
    >
      <i className={`fas ${isDark ? 'fa-sun' : 'fa-moon'}`}></i>
      {isDark ? lightModeLabel : darkModeLabel}
    </button>
  );
}

export default ThemeToggle;

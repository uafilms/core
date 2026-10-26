import React from 'react';

export default function AuthTabSwitch({ tab, onTabChange }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        backgroundColor: 'var(--surface-container-highest, rgba(255, 255, 255, 0.08))',
        borderRadius: '12px',
        padding: '4px',
        gap: '4px',
        marginBottom: '8px',
      }}
    >
      <button
        type="button"
        onClick={() => onTabChange('login')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '8px 16px',
          borderRadius: '9px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500,
          backgroundColor: tab === 'login' ? 'var(--primary)' : 'transparent',
          color: tab === 'login' ? 'var(--on-primary, #ffffff)' : 'var(--on-surface-variant, #cac4d0)',
          transition: 'all 0.2s cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
        <i style={{ fontSize: '18px' }}>login</i>
        <span>Вхід</span>
      </button>
      <button
        type="button"
        onClick={() => onTabChange('register')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '8px 16px',
          borderRadius: '9px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500,
          backgroundColor: tab === 'register' ? 'var(--primary)' : 'transparent',
          color: tab === 'register' ? 'var(--on-primary, #ffffff)' : 'var(--on-surface-variant, #cac4d0)',
          transition: 'all 0.2s cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
        <i style={{ fontSize: '18px' }}>person_add</i>
        <span>Реєстрація</span>
      </button>
    </div>
  );
}

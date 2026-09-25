import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext.jsx';

const TRUSTED_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'ukr.net',
  'pm.me',
  'proton.me',
  'protonmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'ymail.com',
  'zoho.com',
]);

function isTrustedEmailDomain(email) {
  const parts = (email || '').trim().toLowerCase().split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1];
  if (TRUSTED_DOMAINS.has(domain)) return true;
  if (/^(outlook|hotmail|live|msn)\.[a-z]{2,4}(\.[a-z]{2})?$/.test(domain)) return true;
  if (/^yahoo\.[a-z]{2,4}(\.[a-z]{2})?$/.test(domain)) return true;
  return false;
}

const AuthModal = () => {
  const { isAuthModalOpen, setIsAuthModalOpen, login, register } = useAuth();
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsAuthModalOpen(false);
      setIsClosing(false);
      setError('');
    }, 200);
  };

  if ((!isAuthModalOpen && !isClosing) || typeof document === 'undefined') return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Заповніть усі поля');
      return;
    }

    if (tab === 'register' && !isTrustedEmailDomain(email)) {
      setError('Дозволені лише надійні поштові сервіси: Gmail, Outlook, Proton, Yahoo, iCloud, Ukr.net');
      return;
    }

    if (password.length < 6) {
      setError('Пароль має містити мінімум 6 символів');
      return;
    }

    setLoading(true);
    const action = tab === 'login' ? login : register;
    const res = await action(email, password);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Помилка виконання');
    } else {
      setEmail('');
      setPassword('');
      setError('');
    }
  };

  return createPortal(
    <div
      className={`modal-overlay ${isClosing ? 'closing' : ''}`}
      onClick={handleClose}
    >
      <div
        className={`surface-container round medium-elevate modal-dialog ${isClosing ? 'closing' : ''}`}
        style={{
          padding: '28px',
          maxWidth: '440px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header & Close */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="primary-text" style={{ fontSize: '28px' }}>
              {tab === 'login' ? 'login' : 'person_add'}
            </i>
            <h5 style={{ margin: 0, fontWeight: 500 }}>
              {tab === 'login' ? 'Вхід в акаунт' : 'Реєстрація'}
            </h5>
          </div>
          <button
            type="button"
            className="circle transparent"
            onClick={handleClose}
            style={{ margin: 0 }}
          >
            <i>close</i>
          </button>
        </div>

        {/* Tab switchers - Material 3 Segmented Control */}
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
            onClick={() => {
              setTab('login');
              setError('');
            }}
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
            onClick={() => {
              setTab('register');
              setError('');
            }}
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

        {error && (
          <article className="border error-border round no-margin error-shake" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="error-text">error</i>
              <span className="error-text small-text">{error}</span>
            </div>
          </article>
        )}

        <div key={tab} className="tab-content-enter">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="field label prefix border round">
              <i>mail</i>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=" "
                required
                autoFocus
              />
              <label>Електронна пошта</label>
            </div>

            <div className="field label prefix border round">
              <i>lock</i>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=" "
                required
              />
              <label>Пароль</label>
            </div>

            <button
              type="submit"
              className="round primary max"
              disabled={loading}
              style={{ marginTop: '8px', transition: 'all 0.2s cubic-bezier(0.2, 0, 0, 1)' }}
            >
              {loading ? (
                <progress className="circle small indeterminate" style={{ marginRight: '8px' }}></progress>
              ) : (
                <i>{tab === 'login' ? 'check' : 'arrow_forward'}</i>
              )}
              <span>{tab === 'login' ? 'Увійти' : 'Зареєструватися'}</span>
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: '4px' }}>
          <button
            type="button"
            className="link transparent small-text"
            onClick={() => {
              setTab(tab === 'login' ? 'register' : 'login');
              setError('');
            }}
          >
            {tab === 'login'
              ? 'Немає акаунта? Зареєструватися'
              : 'Вже маєте акаунт? Увійти'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AuthModal;

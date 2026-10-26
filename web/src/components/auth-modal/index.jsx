import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { isTrustedEmailDomain } from './utils/validation';
import AuthTabSwitch from './AuthTabSwitch';
import AuthForm from './AuthForm';

export default function AuthModal() {
  const {
    isAuthModalOpen,
    setIsAuthModalOpen,
    login,
    register,
    startTelegramVerification,
    checkTelegramVerification,
  } = useAuth();
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Telegram verification states
  const [tgSession, setTgSession] = useState(null); // { token, link, botUsername }
  const [tgVerified, setTgVerified] = useState(false);
  const [tgUsername, setTgUsername] = useState('');
  const [tgLoading, setTgLoading] = useState(false);
  const pollTimerRef = useRef(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Polling for Telegram verification
  useEffect(() => {
    if (tgSession && !tgVerified && tab === 'register') {
      const poll = async () => {
        const res = await checkTelegramVerification(tgSession.token);
        if (res.success && res.data) {
          if (res.data.verified) {
            setTgVerified(true);
            setTgUsername(res.data.username || '');
            setError('');
          } else if (res.data.error) {
            setError(res.data.error);
          }
        }
      };

      poll();
      pollTimerRef.current = setInterval(poll, 2000);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [tgSession, tgVerified, tab]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsAuthModalOpen(false);
      setIsClosing(false);
      setError('');
    }, 200);
  };

  if ((!isAuthModalOpen && !isClosing) || typeof document === 'undefined') return null;

  const handleStartTelegram = async () => {
    setError('');
    setTgLoading(true);
    const res = await startTelegramVerification();
    setTgLoading(false);

    if (res.success && res.data) {
      setTgSession(res.data);
      setTgVerified(false);
      // Open Telegram link in new window/app
      window.open(res.data.link, '_blank');
    } else {
      setError(res.error || 'Не вдалося підключитися до Telegram-бота');
    }
  };

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

    if (tab === 'register' && !tgVerified) {
      setError('Необхідно підтвердити акаунт через Telegram перед реєстрацією');
      return;
    }

    setLoading(true);
    const res =
      tab === 'login'
        ? await login(email, password)
        : await register(email, password, tgSession?.token);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Помилка виконання');
    } else {
      setEmail('');
      setPassword('');
      setTgSession(null);
      setTgVerified(false);
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

        <AuthTabSwitch
          tab={tab}
          onTabChange={(nextTab) => {
            setTab(nextTab);
            setError('');
          }}
        />

        {error && (
          <article className="border error-border round no-margin error-shake" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="error-text">error</i>
              <span className="error-text small-text">{error}</span>
            </div>
          </article>
        )}

        <AuthForm
          tab={tab}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          tgSession={tgSession}
          tgVerified={tgVerified}
          tgUsername={tgUsername}
          tgLoading={tgLoading}
          onStartTelegram={handleStartTelegram}
          loading={loading}
          onSubmit={handleSubmit}
        />

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
}

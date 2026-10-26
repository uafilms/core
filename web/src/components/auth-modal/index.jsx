import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { isTrustedEmailDomain } from './utils/validation';
import AuthTabSwitch from './AuthTabSwitch';
import AuthForm from './AuthForm';

export default function AuthModal() {
  const { isAuthModalOpen, setIsAuthModalOpen, login, register, sendVerificationCode } = useAuth();
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    let timer;
    if (codeCountdown > 0) {
      timer = setTimeout(() => {
        setCodeCountdown((c) => c - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [codeCountdown]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsAuthModalOpen(false);
      setIsClosing(false);
      setError('');
    }, 200);
  };

  if ((!isAuthModalOpen && !isClosing) || typeof document === 'undefined') return null;

  const handleSendCode = async () => {
    setError('');
    if (!email || !email.includes('@')) {
      setError('Введіть коректну електронну пошту');
      return;
    }

    if (!isTrustedEmailDomain(email)) {
      setError('Дозволені лише надійні поштові сервіси: Gmail, Outlook, Proton, Yahoo, iCloud, Ukr.net');
      return;
    }

    setSendingCode(true);
    const res = await sendVerificationCode(email);
    setSendingCode(false);

    if (res.success) {
      setCodeSent(true);
      setCodeCountdown(60);
    } else {
      setError(res.error || 'Не вдалося надіслати код');
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

    if (tab === 'register' && (!code || code.length < 6)) {
      setError('Введіть 6-значний код підтвердження з пошти');
      return;
    }

    setLoading(true);
    const res = tab === 'login' ? await login(email, password) : await register(email, password, code);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Помилка виконання');
    } else {
      setEmail('');
      setPassword('');
      setCode('');
      setCodeSent(false);
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
          code={code}
          setCode={setCode}
          onSendCode={handleSendCode}
          sendingCode={sendingCode}
          codeSent={codeSent}
          codeCountdown={codeCountdown}
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

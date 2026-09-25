import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { PALETTES, applyPalette, applyPureDark } from '../utils/palette.js';
import Dropdown from '../components/Dropdown.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const SEGMENT_OPTIONS = [
  { value: 'off', label: 'Вимкнути' },
  { value: 'timeline', label: 'Показувати на повзунку' },
  { value: 'manual', label: 'Ручний скіп' },
  { value: 'auto', label: 'Авто скіп' },
];

const SEGMENT_TYPES = [
  {
    key: 'intro',
    title: 'Інтро',
    description: 'Вступна заставка / опенінг',
    color: '#00c853',
  },
  {
    key: 'credits',
    title: 'Титри',
    description: 'Фінальні титри / закінчення',
    color: '#7c4dff',
  },
  {
    key: 'recap',
    title: 'Переказ',
    description: 'Короткий зміст попередніх серій',
    color: '#00b0ff',
  },
  {
    key: 'preview',
    title: 'Анонс',
    description: 'Анонс наступної серії',
    color: '#ff9100',
  },
];

const DEFAULT_SEGMENTS = {
  intro: 'manual',
  credits: 'manual',
  recap: 'manual',
  preview: 'manual',
};

const Settings = () => {
  const navigate = useNavigate();
  const { user, logout, setIsAuthModalOpen, changePassword, deleteAccount, isSyncing, syncNow } = useAuth();
  const [filterProfanity, setFilterProfanity] = useState(false);
  const [showAdult, setShowAdult] = useState(false);
  const [theme, setThemeState] = useState('dark');
  const [palette, setPalette] = useState('default');
  const [customColor, setCustomColor] = useState('#5B8DEF');
  const [pureDark, setPureDark] = useState(false);
  const [segmentSettings, setSegmentSettings] = useState(DEFAULT_SEGMENTS);

  // Account form state
  const [showPwForm, setShowPwForm] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState({ text: '', type: '' });

  // Delete account state
  const [showDelDialog, setShowDelDialog] = useState(false);
  const [isClosingDelDialog, setIsClosingDelDialog] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [delLoading, setDelLoading] = useState(false);
  const [delError, setDelError] = useState('');

  const handleCloseDelDialog = () => {
    setIsClosingDelDialog(true);
    setTimeout(() => {
      setShowDelDialog(false);
      setIsClosingDelDialog(false);
      setDelPw('');
      setDelError('');
    }, 200);
  };

  const savePalette = useCallback((id, hex) => {
    setPalette(id);
    localStorage.setItem('uafilms_palette', id);
    if (hex) {
      setCustomColor(hex);
      localStorage.setItem('uafilms_custom_color', hex);
    }
    applyPalette(id, hex || customColor);
    applyPureDark(pureDark);
  }, [customColor, pureDark]);

  useEffect(() => {
    const settings = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
    setFilterProfanity(settings.filterProfanity || false);
    setShowAdult(settings.showAdult || false);

    const savedTheme = localStorage.getItem('uafilms_theme') || 'dark';
    setThemeState(savedTheme);
    document.body.className = savedTheme;

    const savedPalette = localStorage.getItem('uafilms_palette') || 'default';
    const savedCustom = localStorage.getItem('uafilms_custom_color');
    setPalette(savedPalette);
    if (savedCustom) setCustomColor(savedCustom);
    applyPalette(savedPalette, savedCustom || '#5B8DEF');

    const savedPureDark = settings.pureDark || false;
    setPureDark(savedPureDark);
    applyPureDark(savedPureDark);

    const savedSegments = { ...DEFAULT_SEGMENTS, ...(settings.segments || {}) };
    setSegmentSettings(savedSegments);
  }, []);

  const handleThemeChange = (newTheme) => {
    setThemeState(newTheme);
    localStorage.setItem('uafilms_theme', newTheme);

    const apply = () => {
      if (typeof window !== 'undefined' && typeof window.ui === 'function') {
        window.ui('mode', newTheme);
      } else {
        document.body.classList.remove('light', 'dark');
        document.body.classList.add(newTheme);
      }
    };

    if (typeof document !== 'undefined' && document.startViewTransition) {
      document.startViewTransition(() => {
        apply();
      });
    } else {
      apply();
    }
  };

  const saveSettings = (key, value) => {
    const current = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
    const updated = { ...current, [key]: value };
    localStorage.setItem('uafilms_settings', JSON.stringify(updated));

    if (key === 'filterProfanity') setFilterProfanity(value);
    if (key === 'showAdult') setShowAdult(value);
    if (key === 'pureDark') {
      setPureDark(value);
      applyPureDark(value);
    }
    if (key === 'segments') {
      setSegmentSettings(value);
    }
  };

  const handleSegmentChange = (type, action) => {
    const current = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
    const updatedSegments = { ...DEFAULT_SEGMENTS, ...(current.segments || {}), [type]: action };
    saveSettings('segments', updatedSegments);
    window.dispatchEvent(new CustomEvent('uafilms_settings_updated', { detail: { ...current, segments: updatedSegments } }));
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwMsg({ text: '', type: '' });
    if (!curPw || !newPw) {
      setPwMsg({ text: 'Заповніть усі обов’язкові поля', type: 'error' });
      return;
    }
    if (newPw.length < 6) {
      setPwMsg({ text: 'Новий пароль має містити мінімум 6 символів', type: 'error' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ text: 'Нові паролі не співпадають', type: 'error' });
      return;
    }
    setPwLoading(true);
    const res = await changePassword(curPw, newPw);
    setPwLoading(false);
    if (res.success) {
      setPwMsg({ text: 'Пароль успішно оновлено!', type: 'success' });
      setCurPw('');
      setNewPw('');
      setConfirmPw('');
      setTimeout(() => setShowPwForm(false), 2000);
    } else {
      setPwMsg({ text: res.error || 'Не вдалося змінити пароль', type: 'error' });
    }
  };

  const handleDeleteAccount = async () => {
    setDelError('');
    if (!delPw) {
      setDelError('Введіть пароль для підтвердження');
      return;
    }
    setDelLoading(true);
    const res = await deleteAccount(delPw);
    setDelLoading(false);
    if (!res.success) {
      setDelError(res.error || 'Помилка видалення акаунту');
    } else {
      setShowDelDialog(false);
      navigate('/');
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h4 className="primary-text" style={{ fontWeight: 500, marginBottom: '24px' }}>
        Налаштування
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* ===== Block 0: Обліковий запис (Account Settings) ===== */}
        <article className="round surface-container no-margin" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                className="circle primary-container"
                style={{
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <i className="primary-text" style={{ fontSize: '28px' }}>
                  {user ? 'account_circle' : 'person_outline'}
                </i>
              </div>
              <div>
                <h6 style={{ margin: 0, fontWeight: 500, fontSize: '17px' }}>
                  {user ? 'Обліковий запис' : 'Авторизація'}
                </h6>
                <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
                  {user ? user.email : 'Увійдіть для синхронізації обраного, таймстампів і доступу до API.'}
                </p>
              </div>
            </div>

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="button round border no-margin"
                  onClick={syncNow}
                  disabled={isSyncing}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                  title="Синхронізувати обране та таймстампи"
                >
                  <i style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>sync</i>
                  <span>{isSyncing ? 'Синхронізація...' : 'Синхронізувати'}</span>
                </button>
                <button
                  type="button"
                  className="button round primary-container no-margin"
                  onClick={() => navigate('/dashboard')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                >
                  <i>api</i>
                  <span>API</span>
                </button>
                <button
                  type="button"
                  className="button round border no-margin"
                  onClick={() => {
                    setShowPwForm((prev) => !prev);
                    setPwMsg({ text: '', type: '' });
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                >
                  <i>lock</i>
                  <span>{showPwForm ? 'Сховати' : 'Змінити пароль'}</span>
                </button>
                <button
                  type="button"
                  className="button round transparent error-text no-margin"
                  onClick={logout}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                >
                  <i>logout</i>
                  <span>Вийти</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="button round primary no-margin"
                onClick={() => setIsAuthModalOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <i>login</i>
                <span>Увійти / Реєстрація</span>
              </button>
            )}
          </div>

          {/* Form to change password */}
          {user && showPwForm && (
            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--outline-variant, rgba(128,128,128,0.2))' }}>
              <h6 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 500 }}>
                Зміна паролю
              </h6>

              {pwMsg.text && (
                <article
                  className={`round border no-margin ${pwMsg.type === 'success' ? 'primary-container' : 'error-border'}`}
                  style={{ padding: '10px 14px', marginBottom: '16px' }}
                >
                  <span className={pwMsg.type === 'success' ? 'primary-text' : 'error-text'} style={{ fontSize: '13px' }}>
                    {pwMsg.text}
                  </span>
                </article>
              )}

              <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '400px' }}>
                <div className="field label border round no-margin">
                  <input
                    type="password"
                    value={curPw}
                    onChange={(e) => setCurPw(e.target.value)}
                    placeholder=" "
                    required
                  />
                  <label>Поточний пароль</label>
                </div>

                <div className="field label border round no-margin">
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder=" "
                    required
                  />
                  <label>Новий пароль (мін. 6 символів)</label>
                </div>

                <div className="field label border round no-margin">
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder=" "
                    required
                  />
                  <label>Підтвердження нового паролю</label>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="submit"
                    className="button round primary"
                    disabled={pwLoading}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {pwLoading && <progress className="circle small indeterminate"></progress>}
                    <span>Зберегти пароль</span>
                  </button>
                  <button
                    type="button"
                    className="button round transparent"
                    onClick={() => setShowPwForm(false)}
                  >
                    Скасувати
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Danger zone / delete account */}
          {user && (
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="button transparent error-text"
                onClick={() => {
                  setShowDelDialog(true);
                  setDelError('');
                  setDelPw('');
                }}
                style={{ fontSize: '12px', padding: '4px 8px', textDecoration: 'underline' }}
              >
                Видалити обліковий запис
              </button>
            </div>
          )}
        </article>

        {/* Delete Confirmation Modal */}
        {(showDelDialog || isClosingDelDialog) && typeof document !== 'undefined' && createPortal(
          <div
            className={`modal-overlay ${isClosingDelDialog ? 'closing' : ''}`}
            onClick={handleCloseDelDialog}
          >
            <div
              className={`surface-container round medium-elevate modal-dialog ${isClosingDelDialog ? 'closing' : ''}`}
              style={{ padding: '24px', maxWidth: '420px', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h5 className="error-text" style={{ margin: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i>warning</i> Видалення акаунту
              </h5>
              <p className="small-text surface-variant-text" style={{ margin: 0 }}>
                Ця дія незворотна. Усі ваші персональні API-ключі та статистика запитів будуть назавжди видалені.
              </p>

              {delError && (
                <article className="border error-border round no-margin error-shake" style={{ padding: '10px 14px' }}>
                  <span className="error-text small-text">{delError}</span>
                </article>
              )}

              <div className="field label border round no-margin">
                <input
                  type="password"
                  value={delPw}
                  onChange={(e) => setDelPw(e.target.value)}
                  placeholder=" "
                  required
                />
                <label>Введіть ваш пароль для підтвердження</label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="button round transparent"
                  onClick={handleCloseDelDialog}
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  className="button round error"
                  onClick={handleDeleteAccount}
                  disabled={delLoading}
                >
                  {delLoading && <progress className="circle small indeterminate"></progress>}
                  <span>Підтвердити видалення</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* ===== Block 1: Тема ===== */}
        <article className="round surface-container no-margin" style={{ padding: '20px 24px', overflow: 'visible' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <h6 style={{ margin: 0, fontWeight: 500, fontSize: '16px' }}>Тема оформлення</h6>
              <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
                Оберіть вигляд інтерфейсу.
              </p>
            </div>
            <Dropdown
              value={theme}
              options={[
                { value: 'dark', label: 'Темна' },
                { value: 'light', label: 'Світла' },
              ]}
              onChange={handleThemeChange}
            />
          </div>
        </article>

        {/* ===== Block 2: Палітра + Pure dark ===== */}
        <article className="round surface-container no-margin" style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h6 style={{ margin: 0, fontWeight: 500, fontSize: '16px' }}>Колірна палітра</h6>
            <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
              {palette === 'custom' ? 'Кастомна' : PALETTES[palette]?.name || 'Стандартна'}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: '14px', marginBottom: '20px', justifyItems: 'center' }}>
            {Object.entries(PALETTES).map(([id, p]) => {
              const isActive = palette === id;
              const swatchBg = p.hex || (id === 'custom' ? customColor : null);
              return (
                <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', width: '52px' }}>
                  <div
                    onClick={() => (id === 'custom' ? null : savePalette(id))}
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      cursor: id === 'custom' ? 'default' : 'pointer',
                      border: isActive ? '2px solid var(--on-surface)' : '2px solid transparent',
                      outline: isActive ? '2px solid var(--primary)' : 'none',
                      outlineOffset: '2px',
                      transition: 'border-color 0.2s, transform 0.15s',
                      background: swatchBg ? swatchBg : 'linear-gradient(135deg, #5B8DEF, #E96BAF, #F5923E)',
                      position: 'relative',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title={p.name}
                  >
                    {id === 'default' && (
                      <i style={{ fontSize: '20px', opacity: 0.7 }}>palette</i>
                    )}
                    {id === 'custom' && (
                      <input
                        type="color"
                        value={customColor}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomColor(val);
                          localStorage.setItem('uafilms_custom_color', val);
                          applyPalette('custom', val);
                        }}
                        style={{
                          width: '44px',
                          height: '44px',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          background: 'none',
                          position: 'absolute',
                          opacity: 0,
                        }}
                      />
                    )}
                    {id === 'custom' && (
                      <span style={{ fontSize: '18px', fontWeight: 500, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
                        +
                      </span>
                    )}
                  </div>
                  <span className="small-text surface-variant-text" style={{ fontSize: '10px', textAlign: 'center', opacity: isActive ? 1 : 0.6 }}>
                    {p.name}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="divider" style={{ margin: '20px 0' }}></div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <h6 style={{ margin: 0, fontWeight: 500, fontSize: '16px' }}>Pure dark</h6>
              <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
                Абсолютно чорний фон для AMOLED-екранів.
              </p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={pureDark}
                onChange={(e) => saveSettings('pureDark', e.target.checked)}
              />
              <span></span>
            </label>
          </div>
        </article>

        {/* ===== Block 3: Сегменти плеєра ===== */}
        <article className="round surface-container no-margin" style={{ padding: '20px 24px', overflow: 'visible' }}>
          <div style={{ marginBottom: '20px' }}>
            <h6 style={{ margin: 0, fontWeight: 500, fontSize: '16px' }}>Сегменти</h6>
            <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
              Налаштування відображення та пропуску заставок, титрів і фрагментів серій.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {SEGMENT_TYPES.map((seg, idx) => (
              <React.Fragment key={seg.key}>
                {idx > 0 && <div className="divider" style={{ margin: 0 }}></div>}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '180px' }}>
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: seg.color,
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '15px' }}>{seg.title}</div>
                      <div className="small-text surface-variant-text" style={{ fontSize: '12px' }}>
                        {seg.description}
                      </div>
                    </div>
                  </div>
                  <Dropdown
                    value={segmentSettings[seg.key] || 'manual'}
                    options={SEGMENT_OPTIONS}
                    onChange={(val) => handleSegmentChange(seg.key, val)}
                  />
                </div>
              </React.Fragment>
            ))}
          </div>
        </article>

        {/* ===== Block 4: Контент ===== */}
        <article className="round surface-container no-margin" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
            <div style={{ flex: 1 }}>
              <h6 style={{ margin: 0, fontWeight: 500, fontSize: '16px' }}>Фільтрувати нецензурну лексику</h6>
              <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
                Замінює матюки в коментарях на зірочки.
              </p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={filterProfanity}
                onChange={(e) => saveSettings('filterProfanity', e.target.checked)}
              />
              <span></span>
            </label>
          </div>

          <div className="divider" style={{ margin: '20px 0' }}></div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <h6 style={{ margin: 0, fontWeight: 500, fontSize: '16px' }}>Показувати контент 18+</h6>
              <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
                Додає результати для дорослих у пошук та рекомендації.
              </p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={showAdult}
                onChange={(e) => saveSettings('showAdult', e.target.checked)}
              />
              <span></span>
            </label>
          </div>
        </article>

        {/* ===== Block 4: Спільнота & Підтримка ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <article
            className="round primary-container no-margin padding"
            style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', boxSizing: 'border-box' }}
          >
            <div>
              <h6 style={{ margin: '0 0 8px 0', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i>groups</i> Спільнота
              </h6>
              <p className="small-text" style={{ margin: '0 0 20px 0', opacity: 0.9, lineHeight: '1.5' }}>
                Обговорення, новини та оновлення проекту в Telegram.
              </p>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <button className="primary" onClick={() => window.open('https://t.me/uafilms_official', '_blank')}>
                Приєднатися
              </button>
            </div>
          </article>

          <article
            className="round tertiary-container no-margin padding"
            style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', boxSizing: 'border-box' }}
          >
            <div>
              <h6 style={{ margin: '0 0 8px 0', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i>volunteer_activism</i> Підтримка
              </h6>
              <p className="small-text" style={{ margin: '0 0 20px 0', opacity: 0.9, lineHeight: '1.5' }}>
                Подобається проект? Ви можете підтримати розробку.
              </p>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <button className="tertiary" onClick={() => window.open('https://t.me/migor1103_donate', '_blank')}>
                Підтримати автора
              </button>
            </div>
          </article>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Settings;

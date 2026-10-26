import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { applyPalette, applyPureDark } from '../../utils/palette.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { DEFAULT_SEGMENTS } from './constants';

import AccountSection from './components/AccountSection';
import AppearanceSection from './components/AppearanceSection';
import SegmentsSection from './components/SegmentsSection';
import ContentSection from './components/ContentSection';
import CommunitySection from './components/CommunitySection';
import DeleteAccountModal from './components/DeleteAccountModal';

export default function Settings() {
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
        <AccountSection
          user={user}
          logout={logout}
          setIsAuthModalOpen={setIsAuthModalOpen}
          isSyncing={isSyncing}
          syncNow={syncNow}
          onNavigateDashboard={() => navigate('/dashboard')}
          showPwForm={showPwForm}
          setShowPwForm={setShowPwForm}
          curPw={curPw}
          setCurPw={setCurPw}
          newPw={newPw}
          setNewPw={setNewPw}
          confirmPw={confirmPw}
          setConfirmPw={setConfirmPw}
          pwLoading={pwLoading}
          pwMsg={pwMsg}
          setPwMsg={setPwMsg}
          onPasswordChange={handlePasswordChange}
          onOpenDeleteDialog={() => {
            setShowDelDialog(true);
            setDelError('');
            setDelPw('');
          }}
        />

        <DeleteAccountModal
          isOpen={showDelDialog}
          isClosing={isClosingDelDialog}
          onClose={handleCloseDelDialog}
          onConfirm={handleDeleteAccount}
          password={delPw}
          setPassword={setDelPw}
          loading={delLoading}
          error={delError}
        />

        <AppearanceSection
          theme={theme}
          onThemeChange={handleThemeChange}
          palette={palette}
          customColor={customColor}
          setCustomColor={setCustomColor}
          onSavePalette={savePalette}
          pureDark={pureDark}
          onPureDarkChange={(val) => saveSettings('pureDark', val)}
        />

        <SegmentsSection
          segmentSettings={segmentSettings}
          onSegmentChange={handleSegmentChange}
        />

        <ContentSection
          filterProfanity={filterProfanity}
          showAdult={showAdult}
          onProfanityChange={(val) => saveSettings('filterProfanity', val)}
          onShowAdultChange={(val) => saveSettings('showAdult', val)}
        />

        <CommunitySection />
      </div>

      <style>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

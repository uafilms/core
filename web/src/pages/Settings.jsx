import React, { useState, useEffect, useCallback } from 'react';
import { PALETTES, applyPalette, applyPureDark } from '../utils/palette.js';

const Settings = () => {
  const [filterProfanity, setFilterProfanity] = useState(false);
  const [showAdult, setShowAdult] = useState(false);
  const [engSource, setEngSource] = useState(false);
  const [engMode, setEngMode] = useState('mixed');
  const [theme, setThemeState] = useState('dark');
  const [palette, setPalette] = useState('default');
  const [customColor, setCustomColor] = useState('#5B8DEF');
  const [pureDark, setPureDark] = useState(false);

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
    setEngSource(settings.engSource || false);
    setEngMode(settings.engMode || 'mixed');

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
  }, []);

  const handleThemeChange = (newTheme) => {
    setThemeState(newTheme);
    localStorage.setItem('uafilms_theme', newTheme);
    if (typeof window !== 'undefined' && typeof window.ui === 'function') {
      window.ui('mode', newTheme);
    } else {
      document.body.classList.remove('light', 'dark');
      document.body.classList.add(newTheme);
    }
  };

  const saveSettings = (key, value) => {
    const current = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
    const updated = { ...current, [key]: value };
    localStorage.setItem('uafilms_settings', JSON.stringify(updated));

    if (key === 'filterProfanity') setFilterProfanity(value);
    if (key === 'showAdult') setShowAdult(value);
    if (key === 'engSource') setEngSource(value);
    if (key === 'pureDark') {
      setPureDark(value);
      applyPureDark(value);
    }
    if (key === 'engMode') setEngMode(value);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h4 className="primary-text" style={{ fontWeight: 700, marginBottom: '24px' }}>
        Налаштування
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* ===== Block 1: Тема ===== */}
        <article className="round surface-container no-margin">
          <div className="row middle-align">
            <div className="max">
              <h6 style={{ margin: 0, fontWeight: 600 }}>Тема оформлення</h6>
              <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
                Оберіть вигляд інтерфейсу.
              </p>
            </div>
            <div className="field suffix round fill surface-container-high no-margin" style={{ minWidth: '140px' }}>
              <select
                value={theme}
                onChange={(e) => handleThemeChange(e.target.value)}
                style={{ cursor: 'pointer', paddingRight: '2.5rem' }}
              >
                <option value="dark">Темна</option>
                <option value="light">Світла</option>
              </select>
              <i>arrow_drop_down</i>
            </div>
          </div>
        </article>

        {/* ===== Block 2: Палітра + Pure dark ===== */}
        <article className="round surface-container no-margin">
          <div style={{ marginBottom: '16px' }}>
            <h6 style={{ margin: 0, fontWeight: 600 }}>Колірна палітра</h6>
            <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
              {palette === 'custom' ? 'Кастомна' : PALETTES[palette]?.name || 'Стандартна'}
            </p>
          </div>

          <div className="row wrap" style={{ gap: '12px', marginBottom: '20px' }}>
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
                      <span style={{ fontSize: '18px', fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
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

          <div className="divider"></div>

          <div className="row middle-align" style={{ marginTop: '16px' }}>
            <div className="max">
              <h6 style={{ margin: 0, fontWeight: 600 }}>Pure dark</h6>
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

        {/* ===== Block 3: Контент ===== */}
        <article className="round surface-container no-margin">
          <div className="row middle-align" style={{ marginBottom: '16px' }}>
            <div className="max">
              <h6 style={{ margin: 0, fontWeight: 600 }}>Фільтрувати нецензурну лексику</h6>
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

          <div className="divider"></div>

          <div className="row middle-align" style={{ marginTop: '16px' }}>
            <div className="max">
              <h6 style={{ margin: 0, fontWeight: 600 }}>Показувати контент 18+</h6>
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
          <article className="round primary-container no-margin padding">
            <h6 style={{ margin: '0 0 8px 0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i>groups</i> Спільнота
            </h6>
            <p className="small-text" style={{ margin: '0 0 20px 0', opacity: 0.9, lineHeight: '1.5' }}>
              Обговорення, новини та оновлення проекту в Telegram.
            </p>
            <button className="primary" onClick={() => window.open('https://t.me/uafilms_official', '_blank')}>
              Приєднатися
            </button>
          </article>

          <article className="round tertiary-container no-margin padding">
            <h6 style={{ margin: '0 0 8px 0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i>volunteer_activism</i> Підтримка
            </h6>
            <p className="small-text" style={{ margin: '0 0 20px 0', opacity: 0.9, lineHeight: '1.5' }}>
              Подобається проект? Ви можете підтримати розробку.
            </p>
            <button className="tertiary" onClick={() => window.open('https://t.me/migor1103_donate', '_blank')}>
              Підтримати автора
            </button>
          </article>
        </div>
      </div>
    </div>
  );
};

export default Settings;

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { setTheme as setMduiTheme } from 'mdui/functions/setTheme.js';
import 'mdui/components/switch.js';
import 'mdui/components/button.js';
import 'mdui/components/icon.js';
import 'mdui/components/select.js';
import 'mdui/components/menu-item.js';
import { PALETTES, applyPalette, applyPureDark } from '../utils/palette.js';

// ===== Component =====

const Settings = () => {
  const [filterProfanity, setFilterProfanity] = useState(false);
  const [showAdult, setShowAdult] = useState(false);
  const [engSource, setEngSource] = useState(false);
  const [engMode, setEngMode] = useState('mixed');
  const [theme, setThemeState] = useState('dark');
  const [palette, setPalette] = useState('default');
  const [customColor, setCustomColor] = useState('#5B8DEF');
  const [pureDark, setPureDark] = useState(false);
  const themeSelectRef = useRef(null);
  const engModeSelectRef = useRef(null);
  const profanityRef = useRef(null);
  const adultRef = useRef(null);
  const engRef = useRef(null);
  const pureDarkRef = useRef(null);

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
    setMduiTheme(savedTheme);

    const savedPalette = localStorage.getItem('uafilms_palette') || 'default';
    const savedCustom = localStorage.getItem('uafilms_custom_color');
    setPalette(savedPalette);
    if (savedCustom) setCustomColor(savedCustom);
    applyPalette(savedPalette, savedCustom || '#5B8DEF');

    const savedPureDark = settings.pureDark || false;
    setPureDark(savedPureDark);
    applyPureDark(savedPureDark);
  }, []);

  useEffect(() => {
    const el = themeSelectRef.current;
    if (!el) return;
    const handler = (e) => {
      const newTheme = e.target.value;
      setThemeState(newTheme);
      localStorage.setItem('uafilms_theme', newTheme);

      if (document.startViewTransition) {
        document.startViewTransition(() => {
          setMduiTheme(newTheme);
        });
      } else {
        setMduiTheme(newTheme);
      }
    };
    el.addEventListener('change', handler);
    return () => el.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const el = engModeSelectRef.current;
    if (!el) return;
    const handler = (e) => saveSettings('engMode', e.target.value);
    el.addEventListener('change', handler);
    return () => el.removeEventListener('change', handler);
  }, []);

  // Sync mdui-switch checked property (React only sets attribute, not property)
  useEffect(() => {
    if (profanityRef.current) profanityRef.current.checked = filterProfanity;
  }, [filterProfanity]);
  useEffect(() => {
    if (adultRef.current) adultRef.current.checked = showAdult;
  }, [showAdult]);
  useEffect(() => {
    if (engRef.current) engRef.current.checked = engSource;
  }, [engSource]);
  useEffect(() => {
    if (pureDarkRef.current) pureDarkRef.current.checked = pureDark;
  }, [pureDark]);

  // mdui-switch fires custom 'change' event — React synthetic onClick doesn't work
  useEffect(() => {
    const p = profanityRef.current;
    const a = adultRef.current;
    const e = engRef.current;
    const pd = pureDarkRef.current;
    const hP = (ev) => saveSettings('filterProfanity', ev.target.checked);
    const hA = (ev) => saveSettings('showAdult', ev.target.checked);
    const hE = (ev) => saveSettings('engSource', ev.target.checked);
    const hPD = (ev) => saveSettings('pureDark', ev.target.checked);
    p?.addEventListener('change', hP);
    a?.addEventListener('change', hA);
    e?.addEventListener('change', hE);
    pd?.addEventListener('change', hPD);
    return () => {
      p?.removeEventListener('change', hP);
      a?.removeEventListener('change', hA);
      e?.removeEventListener('change', hE);
      pd?.removeEventListener('change', hPD);
    };
  }, []);

  const saveSettings = (key, value) => {
    const current = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
    const updated = { ...current, [key]: value };
    localStorage.setItem('uafilms_settings', JSON.stringify(updated));
    
    if (key === 'filterProfanity') setFilterProfanity(value);
    if (key === 'showAdult') {
        setShowAdult(value);
    }
    if (key === 'engSource') setEngSource(value);
    if (key === 'pureDark') {
      setPureDark(value);
      applyPureDark(value);
    }
    if (key === 'engMode') setEngMode(value);
  };

  const itemStyle = {
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      background: 'rgb(var(--mdui-color-surface-container))', 
      padding: '16px',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', color: 'rgb(var(--mdui-color-on-surface))' }}>
      <h1 style={{ fontSize: '28px', color: 'rgb(var(--mdui-color-primary))', marginBottom: '12px' }}>Налаштування</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* ===== Block 1: Тема ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ ...itemStyle }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Тема оформлення</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'rgb(var(--mdui-color-outline))' }}>
                  Оберіть вигляд інтерфейсу.
              </p>
            </div>
            <mdui-select value={theme} ref={themeSelectRef} style={{ minWidth: '150px' }} variant="outlined">
              <mdui-menu-item value="dark">Темна</mdui-menu-item>
              <mdui-menu-item value="light">Світла</mdui-menu-item>
            </mdui-select>
          </div>
        </div>

        {/* ===== Block 2: Палітра + Pure dark ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ ...itemStyle, flexDirection: 'column', alignItems: 'stretch', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px' }}>Колірна палітра</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'rgb(var(--mdui-color-outline))' }}>
                  {palette === 'custom' ? 'Кастомна' : PALETTES[palette]?.name || 'Стандартна'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {Object.entries(PALETTES).map(([id, p]) => {
                const isActive = palette === id;
                const swatchBg = p.hex || (id === 'custom' ? customColor : null);
                return (
                  <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', width: '52px' }}>
                    <div onClick={() => id === 'custom' ? null : savePalette(id)}
                      style={{
                        width: '36px', height: '36px', borderRadius: '50%', cursor: id === 'custom' ? 'default' : 'pointer',
                        border: isActive ? '2px solid rgb(var(--mdui-color-on-surface))' : '2px solid transparent',
                        outline: isActive ? '2px solid rgb(var(--mdui-color-primary))' : 'none', outlineOffset: '2px',
                        transition: 'border-color 0.2s, transform 0.15s',
                        background: swatchBg ? swatchBg : 'linear-gradient(135deg, #5B8DEF, #E96BAF, #F5923E)',
                        position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }} title={p.name}
                    >
                      {id === 'default' && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6 }}>
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" opacity="0.3"/>
                          <circle cx="12" cy="12" r="4" fill="currentColor"/>
                        </svg>
                      )}
                      {id === 'custom' && (
                        <input type="color" value={customColor}
                          onInput={(e) => { const val = e.target.value; setCustomColor(val); localStorage.setItem('uafilms_custom_color', val); applyPalette('custom', val); }}
                          style={{ width: '44px', height: '44px', border: 'none', padding: 0, cursor: 'pointer', background: 'none', position: 'absolute', opacity: 0 }}
                        />
                      )}
                      {id === 'custom' && <span style={{ fontSize: '18px', fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>+</span>}
                    </div>
                    <span style={{ fontSize: '10px', color: 'rgb(var(--mdui-color-outline))', whiteSpace: 'nowrap', textAlign: 'center', opacity: isActive ? 1 : 0.6 }}>{p.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ ...itemStyle }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Pure dark</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'rgb(var(--mdui-color-outline))' }}>
                  Абсолютно чорний фон для AMOLED-екранів.
              </p>
            </div>
            <mdui-switch ref={pureDarkRef} checked={pureDark ? true : undefined}></mdui-switch>
          </div>
        </div>

        {/* ===== Block 3: Контент ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ ...itemStyle }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Фільтрувати нецензурну лексику</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'rgb(var(--mdui-color-outline))' }}>Замінює матюки в коментарях на зірочки.</p>
            </div>
            <mdui-switch ref={profanityRef} checked={filterProfanity ? true : undefined}></mdui-switch>
          </div>
          <div style={{ ...itemStyle }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Показувати контент 18+</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'rgb(var(--mdui-color-outline))' }}>Додає результати для дорослих у пошук та рекомендації.</p>
            </div>
            <mdui-switch ref={adultRef} checked={showAdult ? true : undefined}></mdui-switch>
          </div>
          <div style={{ ...itemStyle }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Англомовні джерела</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'rgb(var(--mdui-color-outline))' }}>Додає провайдерів з англійською озвучкою.</p>
            </div>
            <mdui-switch ref={engRef} checked={engSource ? true : undefined}></mdui-switch>
          </div>
          {engSource && (
            <div style={{ ...itemStyle, background: 'rgb(var(--mdui-color-surface-container-high))' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px' }}>Режим відображення</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'rgb(var(--mdui-color-outline))' }}>Оберіть, які джерела показувати.</p>
              </div>
              <mdui-select value={engMode} ref={engModeSelectRef} style={{ minWidth: '180px' }} variant="outlined">
                <mdui-menu-item value="mixed">UA + ENG</mdui-menu-item>
                <mdui-menu-item value="only_eng">Тільки ENG</mdui-menu-item>
              </mdui-select>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'rgb(var(--mdui-color-primary-container))', color: 'rgb(var(--mdui-color-on-primary-container))', padding: '24px', borderRadius: '24px' }}>
                <div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <mdui-icon name="groups"></mdui-icon> Спільнота
                    </h3>
                    <p style={{ margin: '0 0 24px 0', fontSize: '14px', opacity: 0.9, lineHeight: '1.5' }}>
                        Обговорення, новини та оновлення проекту в нашому Telegram каналі.
                    </p>
                </div>
                <mdui-button variant="filled" onClick={() => window.open('https://t.me/uafilms_official', '_blank')} style={{ alignSelf: 'flex-start' }}>
                    Приєднатися
                </mdui-button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'rgb(var(--mdui-color-tertiary-container))', color: 'rgb(var(--mdui-color-on-tertiary-container))', padding: '24px', borderRadius: '24px' }}>
                <div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <mdui-icon name="volunteer_activism"></mdui-icon> Підтримка
                    </h3>
                    <p style={{ margin: '0 0 24px 0', fontSize: '14px', opacity: 0.9, lineHeight: '1.5' }}>
                        Подобається проект? Ви можете підтримати розробку фінансово.
                    </p>
                </div>
                <mdui-button 
                    variant="filled"
                    onClick={() => window.open('https://t.me/migor1103_donate', '_blank')}
                    style={{ alignSelf: 'flex-start' }}
                >
                    Підтримати автора
                </mdui-button>
            </div>

            <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-between', 
                background: 'rgb(var(--mdui-color-secondary-container))', 
                color: 'rgb(var(--mdui-color-on-secondary-container))', 
                padding: '24px', 
                borderRadius: '24px',
                gridColumn: '1 / -1'
            }}>
                <div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <mdui-icon name="api"></mdui-icon> API Документація
                    </h3>
                    <p style={{ margin: '0 0 24px 0', fontSize: '14px', opacity: 0.9, lineHeight: '1.5' }}>
                        Створюйте власні рішення на базі нашого сервісу за допомогою публічного API.
                    </p>
                </div>
                <mdui-button 
                    variant="filled"
                    onClick={() => window.open('https://bfilms.aartzz.pp.ua', '_blank')}
                    style={{ 
                        alignSelf: 'flex-start', 
                    }}
                >
                    Відкрити
                </mdui-button>
            </div>
        </div>

      </div>
    </div>
  );
};

export default Settings;

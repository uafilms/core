import React from 'react';
import { PALETTES, applyPalette } from '../../../utils/palette.js';
import Dropdown from '../../../components/Dropdown.jsx';

export default function AppearanceSection({
  theme,
  onThemeChange,
  palette,
  customColor,
  setCustomColor,
  onSavePalette,
  pureDark,
  onPureDarkChange,
}) {
  return (
    <>
      {/* Theme Selection */}
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
            onChange={onThemeChange}
          />
        </div>
      </article>

      {/* Palette & Pure Dark */}
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
                  onClick={() => (id === 'custom' ? null : onSavePalette(id))}
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
              onChange={(e) => onPureDarkChange(e.target.checked)}
            />
            <span></span>
          </label>
        </div>
      </article>
    </>
  );
}

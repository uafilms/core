import React from 'react';

export default function CodecMenu({
  navDirection,
  switchMenu,
  selectedCodec,
  autoCodec,
  applyCodec,
  codecOptions,
}) {
  return (
    <div className={`vjs-menu-page ${navDirection === 'back' ? 'vjs-page-back' : ''}`}>
      <div className="vjs-submenu-header" onClick={() => switchMenu('main', 'back')}>
        <i className="material-symbols-rounded">arrow_back</i>
        <span>Кодек відео</span>
      </div>
      <div className="vjs-submenu-scroll">
        <div
          className={`vjs-submenu-option ${selectedCodec === null ? 'selected' : ''}`}
          onClick={() => applyCodec(null)}
        >
          {autoCodec
            ? `Auto · ${codecOptions.find((option) => option.id === autoCodec)?.label || ''}`.trim()
            : 'Auto'}
        </div>
        {codecOptions.map((option) => (
          <div
            key={option.id}
            className={`vjs-submenu-option ${selectedCodec === option.id ? 'selected' : ''}`}
            style={option.supported ? undefined : { opacity: 0.45, pointerEvents: 'none' }}
            onClick={() => option.supported && applyCodec(option)}
          >
            {option.label}
            {option.maxHeight > 0 ? ` · ${option.maxHeight}p` : ''}
            {option.supported ? '' : ' (не підтримується)'}
          </div>
        ))}
      </div>
    </div>
  );
}

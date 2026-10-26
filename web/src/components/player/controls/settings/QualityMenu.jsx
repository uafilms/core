import React from 'react';

export default function QualityMenu({
  navDirection,
  switchMenu,
  selectedQuality,
  setQuality,
  qualities,
}) {
  return (
    <div className={`vjs-menu-page ${navDirection === 'back' ? 'vjs-page-back' : ''}`}>
      <div className="vjs-submenu-header" onClick={() => switchMenu('main', 'back')}>
        <i className="material-symbols-rounded">arrow_back</i>
        <span>Якість відео</span>
      </div>
      <div className="vjs-submenu-scroll">
        <div
          className={`vjs-submenu-option ${selectedQuality === -1 ? 'selected' : ''}`}
          onClick={() => setQuality(-1)}
        >
          Auto
        </div>
        {qualities.map((q) => (
          <div
            key={q.index}
            className={`vjs-submenu-option ${selectedQuality === q.index ? 'selected' : ''}`}
            onClick={() => setQuality(q.index)}
          >
            {q.label}
          </div>
        ))}
      </div>
    </div>
  );
}

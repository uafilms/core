import React from 'react';

export default function SpeedMenu({
  navDirection,
  switchMenu,
  playbackRate,
  setRate,
}) {
  return (
    <div className={`vjs-menu-page ${navDirection === 'back' ? 'vjs-page-back' : ''}`}>
      <div className="vjs-submenu-header" onClick={() => switchMenu('main', 'back')}>
        <i className="material-symbols-rounded">arrow_back</i>
        <span>Швидкість відтворення</span>
      </div>
      <div className="vjs-submenu-scroll">
        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
          <div
            key={rate}
            className={`vjs-submenu-option ${playbackRate === rate ? 'selected' : ''}`}
            onClick={() => setRate(rate)}
          >
            {rate}x
          </div>
        ))}
      </div>
    </div>
  );
}

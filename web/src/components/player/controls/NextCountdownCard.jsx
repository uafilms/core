import React from 'react';

export default function NextCountdownCard({
  nextCountdown,
  nextEpisodeLabel,
  title,
  onCancel,
  onPlayNow,
}) {
  if (nextCountdown === null) return null;

  return (
    <div
      className="vjs-next-countdown-card"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="vjs-next-countdown-header">
        <div className="vjs-next-countdown-tag">
          <i className="material-symbols-rounded">skip_next</i>
          <span>Наступна серія</span>
        </div>
        <span className="vjs-next-badge">{nextCountdown} с</span>
      </div>
      <div className="vjs-next-countdown-content">
        <div className="vjs-next-countdown-title">
          {nextEpisodeLabel || 'Наступний епізод'}
        </div>
        {title && (
          <div className="vjs-next-countdown-label">
            {title}
          </div>
        )}
      </div>
      <div className="vjs-next-countdown-actions">
        <button
          type="button"
          className="vjs-next-btn-cancel"
          onClick={onCancel}
        >
          Скасувати
        </button>
        <button
          type="button"
          className="vjs-next-btn-play"
          onClick={onPlayNow}
        >
          <i className="material-symbols-rounded">play_arrow</i>
          <span>Зараз</span>
        </button>
      </div>
      <div className="vjs-next-progress-track">
        <div
          className="vjs-next-progress-bar"
          style={{ animationDuration: '5s' }}
        />
      </div>
    </div>
  );
}

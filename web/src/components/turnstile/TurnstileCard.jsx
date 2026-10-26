import React from 'react';

const STATUS_LABELS = {
  interactive: 'Я не робот',
  checking: 'Перевірка...',
  success: 'Пройдено',
  error: 'Помилка',
};

export default function TurnstileCard({
  state,
  animPhase,
  onAnimEnd,
  onClick,
}) {
  if (animPhase === 'hidden') return null;

  return (
    <div
      className={`turnstile-card state-${state} anim-${animPhase}`}
      onAnimationEnd={onAnimEnd}
      onClick={onClick}
    >
      <div className="pill-inner">
        <div className="pill-left">
          <div className="icon-slot">
            <div className={`icon-layer${state === 'interactive' ? ' visible' : ' hidden'}`}>
              <div className="checkbox-box" />
            </div>
            <div className={`icon-layer${state === 'checking' ? ' visible' : ' hidden'}`}>
              <div className="spinner-wrap">
                <progress className="circle small indeterminate" style={{ width: '18px', height: '18px' }} />
              </div>
            </div>
            <div className={`icon-layer${state === 'success' ? ' visible' : ' hidden'}`}>
              <i className="primary-text" style={{ fontSize: '20px' }}>check_circle</i>
            </div>
            <div className={`icon-layer${state === 'error' ? ' visible' : ' hidden'}`}>
              <i className="error-text" style={{ fontSize: '20px' }}>error</i>
            </div>
          </div>

          <span className="status-label">
            {state === 'error' ? (
              <>
                Помилка
                <span className="error-hint">&nbsp;· натисніть ще раз</span>
              </>
            ) : (
              <span className="label-anim" key={state}>
                {STATUS_LABELS[state]}
              </span>
            )}
          </span>
        </div>

        <div className="pill-brand" title="Cloudflare Turnstile">
          <i style={{ fontSize: '16px' }}>shield</i>
        </div>
      </div>
    </div>
  );
}

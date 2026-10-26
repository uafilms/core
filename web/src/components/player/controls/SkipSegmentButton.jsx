import React from 'react';

export default function SkipSegmentButton({
  showSkipButton,
  displaySegment,
  skipButtonKey,
  isClosingSkipButton,
  onSkip,
  skipNotice,
  onUndoSkip,
}) {
  return (
    <>
      {/* Floating Skip Segment Button (hides after 10s, can also skip via Enter key) */}
      {showSkipButton && displaySegment && (
        <button
          key={skipButtonKey}
          type="button"
          className={`vjs-skip-segment-btn ${isClosingSkipButton ? 'closing' : ''}`}
          style={{
            backgroundColor: '#14151a',
            borderRadius: '9999px',
            padding: '10px 22px 12px 20px',
            gap: '10px',
            border: '1px solid rgba(255, 255, 255, 0.22)',
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.8)',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            minWidth: 'max-content',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSkip?.();
          }}
        >
          <i className="material-symbols-rounded">fast_forward</i>
          <span>Пропустити {displaySegment.label}</span>
          <kbd className="vjs-skip-kbd">Enter</kbd>

          {/* Countdown progress indicator at bottom of button */}
          <div
            className="vjs-skip-progress-track"
            style={{
              borderBottomLeftRadius: '9999px',
              borderBottomRightRadius: '9999px',
              overflow: 'hidden',
            }}
          >
            <div
              className="vjs-skip-progress-bar"
              style={{
                borderBottomLeftRadius: '9999px',
                borderBottomRightRadius: '9999px',
              }}
            />
          </div>
        </button>
      )}

      {/* Auto-skip Undo Toast */}
      {skipNotice && (
        <div className="vjs-skip-notice" onClick={(e) => e.stopPropagation()}>
          <div className="vjs-skip-notice-text">
            <i className="material-symbols-rounded">fast_forward</i>
            <span>Пропущено: {skipNotice.label}</span>
          </div>
          <button
            type="button"
            className="vjs-skip-notice-undo"
            onClick={(e) => {
              e.stopPropagation();
              onUndoSkip?.();
            }}
          >
            Скасувати
          </button>
        </div>
      )}
    </>
  );
}

import React, { useEffect, useRef, useState } from 'react';

const TurnstileWidget = () => {
  const widgetId = useRef(null);
  const hideTimerRef = useRef(null);
  const overlayRef = useRef(null);
  const [config, setConfig] = useState(null);
  const [state, setState] = useState('checking');
  const [cardVisible, setCardVisible] = useState(true);
  const [animPhase, setAnimPhase] = useState('entering');
  const checkInterval = useRef(null);
  const tokenReadyFired = useRef(false);

  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'ts-api-overlay';
    document.body.appendChild(el);
    overlayRef.current = el;

    return () => {
      if (overlayRef.current) {
        document.body.removeChild(overlayRef.current);
        overlayRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadConfig = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_BASE_URL || '/api';
        const res = await fetch(`${apiUrl}/`);
        if (!res.ok) throw new Error('API unavailable');
        const data = await res.json();
        if (cancelled) return;
        setConfig(data.turnstile);
      } catch {
        if (cancelled) return;
        setConfig({ enabled: false, siteKey: '' });
      }
    };
    loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!config || !overlayRef.current) return;

    if (!config.enabled) {
      window.cfToken = 'disabled';
      window.dispatchEvent(new Event('cf_token_ready'));
      return;
    }

    window.cfToken = null;
    tokenReadyFired.current = false;

    const initTurnstile = () => {
      if (widgetId.current !== null) return;
      if (!window.turnstile) return;
      if (checkInterval.current) clearInterval(checkInterval.current);

      try {
        widgetId.current = window.turnstile.render(overlayRef.current, {
          sitekey: config.siteKey,
          theme: 'dark',
          execution: 'execute',
          appearance: 'interaction-only',
          callback: (token) => {
            window.cfToken = token;
            if (!tokenReadyFired.current) {
              tokenReadyFired.current = true;
              window.dispatchEvent(new Event('cf_token_ready'));
            }
            setState('success');
            setCardVisible(true);
            if (overlayRef.current) overlayRef.current.style.display = '';

            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            hideTimerRef.current = setTimeout(() => {
              setCardVisible(false);
            }, 2000);
          },
          'before-interactive-callback': () => {
            setState('interactive');
            setCardVisible(true);
            if (overlayRef.current) overlayRef.current.style.display = 'none';
          },
          'after-interactive-callback': () => {
            setCardVisible(true);
            if (overlayRef.current) overlayRef.current.style.display = '';
          },
          'expired-callback': () => {
            window.cfToken = null;
            tokenReadyFired.current = false;
            setState('checking');
            setCardVisible(true);
            if (overlayRef.current) overlayRef.current.style.display = '';
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            if (window.turnstile && widgetId.current !== null) {
              window.turnstile.reset(widgetId.current);
              setTimeout(() => window.turnstile.execute(widgetId.current), 100);
            }
          },
          'error-callback': () => {
            setState('error');
            setCardVisible(true);
            if (overlayRef.current) overlayRef.current.style.display = '';
          },
        });

        if (widgetId.current && window.turnstile) {
          window.turnstile.execute(widgetId.current);
        }
      } catch (e) {
        console.error('Turnstile render error:', e);
      }
    };

    if (window.turnstile) {
      initTurnstile();
    } else {
      checkInterval.current = setInterval(() => {
        if (window.turnstile) {
          initTurnstile();
        }
      }, 100);
    }

    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (widgetId.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          // ignore
        }
        widgetId.current = null;
      }
    };
  }, [config]);

  useEffect(() => {
    if (cardVisible) {
      setAnimPhase('entering');
    } else {
      setAnimPhase('exiting');
    }
  }, [cardVisible]);

  const handleAnimEnd = () => {
    if (animPhase === 'exiting') {
      setAnimPhase('hidden');
    }
  };

  const handleClick = () => {
    if (state === 'interactive' && overlayRef.current) {
      overlayRef.current.style.display = '';
    } else if (state === 'error' && widgetId.current !== null && window.turnstile) {
      setState('checking');
      window.turnstile.reset(widgetId.current);
      window.turnstile.execute(widgetId.current);
    }
  };

  if (!config || !config.enabled) return null;

  const statusLabels = {
    checking: 'Перевірка безпеки...',
    interactive: 'Підтвердіть дію',
    success: 'Перевірку пройдено',
    error: 'Помилка перевірки',
  };

  return (
    <>
      {animPhase !== 'hidden' && (
        <div
          className={`turnstile-card state-${state} anim-${animPhase}`}
          onAnimationEnd={handleAnimEnd}
          onClick={handleClick}
        >
          <div className="pill-inner">
            <div className="pill-left">
              <div className="icon-slot">
                <div className={`icon-layer${state === 'interactive' ? ' visible' : ' hidden'}`}>
                  <div className="checkbox-box" />
                </div>
                <div className={`icon-layer${state === 'checking' ? ' visible' : ' hidden'}`}>
                  <div className="spinner-wrap">
                    <progress className="circle small indeterminate" />
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
                    {statusLabels[state]}
                  </span>
                )}
              </span>
            </div>

            <div className="pill-brand" title="Cloudflare Turnstile">
              <i style={{ fontSize: '16px' }}>shield</i>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .ts-api-overlay {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .ts-api-overlay iframe {
          pointer-events: auto;
        }

        .turnstile-card {
          width: 248px;
          height: 48px;
          padding: 0 14px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          border-radius: 9999px;
          border: 1.5px solid var(--outline);
          background: var(--surface-container-low);
        }

        .turnstile-card.state-interactive { cursor: pointer; }
        .turnstile-card.state-interactive:hover { border-color: var(--primary); transition: border-color 0.3s ease; }
        .turnstile-card.state-success { border-color: var(--primary); transition: border-color 0.3s ease; }
        .turnstile-card.state-error { border-color: var(--error); cursor: pointer; transition: border-color 0.3s ease; }

        .anim-entering {
          animation: cardEnter 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }

        .anim-exiting {
          animation: cardExit 0.18s ease both;
        }

        @keyframes cardEnter {
          from { opacity: 0; transform: translateY(16px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes cardExit {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to   { opacity: 0; transform: translateY(8px) scale(0.94); }
        }

        .pill-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          height: 100%;
        }

        .pill-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          height: 100%;
        }

        .icon-slot {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
          position: relative;
        }

        .icon-layer {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.2s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .icon-layer.hidden  { opacity: 0; transform: scale(0.5); pointer-events: none; }
        .icon-layer.visible { opacity: 1; transform: scale(1); }

        .checkbox-box {
          width: 16px;
          height: 16px;
          border-radius: 3px;
          border: 1.5px solid var(--outline);
        }

        .spinner-wrap {
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .status-label {
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.1px;
          color: var(--on-surface);
          white-space: nowrap;
          line-height: 1;
        }

        .label-anim {
          display: inline-block;
          animation: labelIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }

        @keyframes labelIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .error-hint {
          font-size: 11px;
          color: var(--primary);
          opacity: 0.7;
          margin-left: 4px;
        }

        .pill-brand {
          display: flex;
          align-items: center;
          opacity: 0.4;
          color: var(--on-surface-variant);
          transition: opacity 0.2s;
          flex-shrink: 0;
        }

        .turnstile-card:hover .pill-brand { opacity: 0.7; }
      `}</style>
    </>
  );
};

export default TurnstileWidget;

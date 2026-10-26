import { useState, useEffect, useRef, useCallback } from 'react';

export function useTurnstile() {
  const widgetId = useRef(null);
  const hideTimerRef = useRef(null);
  const overlayRef = useRef(null);
  const [config, setConfig] = useState(null);
  const [state, setState] = useState('checking');
  const [cardVisible, setCardVisible] = useState(true);
  const [animPhase, setAnimPhase] = useState('entering');
  const checkInterval = useRef(null);
  const tokenReadyFired = useRef(false);

  // Create overlay in body
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

  // Load config
  useEffect(() => {
    let cancelled = false;
    const loadConfig = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_BASE_URL || '/api';
        const res = await fetch(`${apiUrl}/config`);
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

  // Render Turnstile
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
      checkInterval.current = setInterval(initTurnstile, 100);
    }

    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (window.turnstile && widgetId.current !== null) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {}
        widgetId.current = null;
      }
    };
  }, [config]);

  useEffect(() => {
    if (cardVisible) {
      setAnimPhase((prev) => (prev === 'hidden' || prev === 'exiting' ? 'entering' : prev));
    } else {
      setAnimPhase((prev) => (prev === 'visible' || prev === 'entering' ? 'exiting' : prev));
    }
  }, [cardVisible]);

  const handleAnimEnd = useCallback(() => {
    if (animPhase === 'entering') setAnimPhase('visible');
    else if (animPhase === 'exiting') setAnimPhase('hidden');
  }, [animPhase]);

  const handleClick = useCallback(() => {
    if (state === 'interactive') {
      if (overlayRef.current) overlayRef.current.style.display = '';
      setState('checking');
    } else if (state === 'error') {
      setState('checking');
      window.cfToken = null;
      tokenReadyFired.current = false;
      if (window.turnstile && widgetId.current !== null) {
        window.turnstile.reset(widgetId.current);
        setTimeout(() => window.turnstile.execute(widgetId.current), 100);
      }
    }
  }, [state]);

  return {
    config,
    state,
    animPhase,
    handleAnimEnd,
    handleClick,
  };
}

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
  const refreshPromiseRef = useRef(null);

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

  // Turnstile tokens are single-use: expose a way to obtain a fresh one.
  // Requests that were rejected with TURNSTILE_VERIFICATION_FAILED can retry
  // after calling window.refreshCfToken().
  const requestFreshToken = useCallback(() => {
    if (!config) return Promise.resolve(window.cfToken || null);
    if (!config.enabled) return Promise.resolve('disabled');
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const promise = new Promise((resolve) => {
      if (!window.turnstile || widgetId.current === null) {
        resolve(window.cfToken || null);
        return;
      }

      let settled = false;
      let timer = null;

      const finish = (nextToken) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('cf_token_ready', onReady);
        if (timer) clearTimeout(timer);
        refreshPromiseRef.current = null;
        resolve(nextToken || null);
      };

      const onReady = () => finish(window.cfToken);

      window.addEventListener('cf_token_ready', onReady);
      timer = setTimeout(() => finish(null), 15000);

      window.cfToken = null;
      tokenReadyFired.current = false;
      if (overlayRef.current) overlayRef.current.style.display = '';
      try {
        window.turnstile.reset(widgetId.current);
        window.turnstile.execute(widgetId.current);
      } catch {
        finish(null);
      }
    });

    refreshPromiseRef.current = promise;
    return promise;
  }, [config]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.refreshCfToken = requestFreshToken;
    return () => {
      if (window.refreshCfToken === requestFreshToken) {
        delete window.refreshCfToken;
      }
    };
  }, [requestFreshToken]);

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

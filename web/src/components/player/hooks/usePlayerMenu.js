import { useState, useRef, useEffect, useCallback } from 'react';

export function usePlayerMenu(playerRef) {
  const [activeMenu, setActiveMenu] = useState(null);
  const activeMenuRef = useRef(null);
  const [renderedMenu, setRenderedMenu] = useState(null);
  const renderedMenuRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);
  const [navDirection, setNavDirection] = useState('forward');
  const closeTimeoutRef = useRef(null);
  const openTimeRef = useRef(0);
  const settingsMenuRef = useRef(null);

  const openMenu = useCallback((menu) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    openTimeRef.current = Date.now();
    setIsClosing(false);
    setNavDirection('forward');
    setActiveMenu(menu);
    activeMenuRef.current = menu;
    setRenderedMenu(menu);
    if (playerRef.current) {
      playerRef.current.userActive(true);
    }
  }, [playerRef]);

  const switchMenu = useCallback((menu, direction = 'forward') => {
    setNavDirection(direction);
    setActiveMenu(menu);
    activeMenuRef.current = menu;
    setRenderedMenu(menu);
  }, []);

  const closeMenu = useCallback(() => {
    if (!activeMenuRef.current) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
      activeMenuRef.current = null;
      setRenderedMenu(null);
      setIsClosing(false);
    }, 200);
  }, []);

  const closeMenuRef = useRef(closeMenu);
  closeMenuRef.current = closeMenu;

  // Close settings menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (Date.now() - openTimeRef.current < 250) return;
      if (activeMenuRef.current) {
        const settingsMenuEl = document.querySelector('.vjs-settings-menu');
        const settingsBtnEl = document.querySelector('.vjs-settings-btn');
        if (
          settingsMenuEl && !settingsMenuEl.contains(e.target) &&
          settingsBtnEl && !settingsBtnEl.contains(e.target)
        ) {
          closeMenu();
        }
      }
    };
    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick, { passive: true });
    return () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [closeMenu]);

  // Sync renderedMenuRef for outside event handlers
  useEffect(() => {
    renderedMenuRef.current = renderedMenu;
  }, [renderedMenu]);

  // Smooth wheel scrolling in submenu lists
  useEffect(() => {
    const el = settingsMenuRef.current;
    if (!el || !renderedMenu) return;

    const animations = new Map();
    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    const animateTo = (scroller, targetTop) => {
      const pending = animations.get(scroller);
      if (pending) cancelAnimationFrame(pending.raf);

      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const goal = Math.min(max, Math.max(0, targetTop));

      if (reduceMotion) {
        scroller.scrollTop = goal;
        animations.delete(scroller);
        return;
      }

      const step = () => {
        const diff = goal - scroller.scrollTop;
        if (Math.abs(diff) < 0.5) {
          scroller.scrollTop = goal;
          animations.delete(scroller);
          return;
        }
        scroller.scrollTop += diff * 0.22;
        const raf = requestAnimationFrame(step);
        animations.set(scroller, { raf, goal });
      };

      const raf = requestAnimationFrame(step);
      animations.set(scroller, { raf, goal });
    };

    const onWheel = (event) => {
      const target = event.target instanceof Element
        ? event.target.closest('.vjs-submenu-scroll, .vjs-menu-page, .vjs-settings-menu')
        : null;
      const scroller = target || el;
      if (scroller.scrollHeight > scroller.clientHeight + 1) {
        const pending = animations.get(scroller);
        animateTo(scroller, (pending ? pending.goal : scroller.scrollTop) + event.deltaY);
      }
      event.preventDefault();
      event.stopPropagation();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      for (const { raf } of animations.values()) cancelAnimationFrame(raf);
      animations.clear();
    };
  }, [renderedMenu]);

  // Keep controls and player active while settings menu is open
  useEffect(() => {
    if (!renderedMenu || !playerRef.current) return;
    playerRef.current.userActive(true);
    const interval = setInterval(() => {
      if (playerRef.current) {
        playerRef.current.userActive(true);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [renderedMenu, playerRef]);

  return {
    activeMenu,
    activeMenuRef,
    renderedMenu,
    renderedMenuRef,
    isClosing,
    navDirection,
    settingsMenuRef,
    openMenu,
    switchMenu,
    closeMenu,
    closeMenuRef,
  };
}

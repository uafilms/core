import { useState, useRef, useEffect, useCallback } from 'react';

export function useSegments({
  tmdbId,
  imdbId,
  mediaType,
  season,
  episode,
  title,
  duration,
  playerRef,
}) {
  const [segments, setSegments] = useState([]);
  const segmentsRef = useRef([]);
  const [activeSegment, setActiveSegment] = useState(null);
  const activeSegmentRef = useRef(null);
  const activeSegmentKeyRef = useRef(null);

  const [showSkipButton, setShowSkipButton] = useState(false);
  const showSkipButtonRef = useRef(false);
  const [isClosingSkipButton, setIsClosingSkipButton] = useState(false);
  const isClosingSkipButtonRef = useRef(false);
  const [displaySegment, setDisplaySegment] = useState(null);
  const displaySegmentRef = useRef(null);
  const [skipButtonKey, setSkipButtonKey] = useState(0);

  const skipBtnTimeoutRef = useRef(null);
  const closeSkipTimeoutRef = useRef(null);
  const [skipNotice, setSkipNotice] = useState(null);
  const skipNoticeTimeoutRef = useRef(null);
  const skippedSegmentsRef = useRef(new Set());
  const dismissedSegmentsRef = useRef(new Set());
  const lastCurTimeRef = useRef(0);

  const dismissSkipButton = useCallback((immediate = false) => {
    if (skipBtnTimeoutRef.current) {
      clearTimeout(skipBtnTimeoutRef.current);
      skipBtnTimeoutRef.current = null;
    }
    if (closeSkipTimeoutRef.current) {
      clearTimeout(closeSkipTimeoutRef.current);
      closeSkipTimeoutRef.current = null;
    }

    if (immediate) {
      showSkipButtonRef.current = false;
      isClosingSkipButtonRef.current = false;
      displaySegmentRef.current = null;
      setShowSkipButton(false);
      setIsClosingSkipButton(false);
      setDisplaySegment(null);
      return;
    }

    if (isClosingSkipButtonRef.current) return;

    isClosingSkipButtonRef.current = true;
    setIsClosingSkipButton(true);
    closeSkipTimeoutRef.current = setTimeout(() => {
      showSkipButtonRef.current = false;
      isClosingSkipButtonRef.current = false;
      displaySegmentRef.current = null;
      setShowSkipButton(false);
      setIsClosingSkipButton(false);
      setDisplaySegment(null);
      closeSkipTimeoutRef.current = null;
    }, 350);
  }, []);

  const dismissSkipButtonRef = useRef(dismissSkipButton);
  useEffect(() => {
    dismissSkipButtonRef.current = dismissSkipButton;
  }, [dismissSkipButton]);

  const [segmentSettings, setSegmentSettings] = useState(() => {
    try {
      const settings = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
      return {
        intro: 'manual',
        credits: 'manual',
        recap: 'manual',
        preview: 'manual',
        ...(settings.segments || {}),
      };
    } catch {
      return {
        intro: 'manual',
        credits: 'manual',
        recap: 'manual',
        preview: 'manual',
      };
    }
  });
  const segmentSettingsRef = useRef(segmentSettings);

  useEffect(() => {
    segmentSettingsRef.current = segmentSettings;
  }, [segmentSettings]);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      try {
        const settings = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
        const next = {
          intro: 'manual',
          credits: 'manual',
          recap: 'manual',
          preview: 'manual',
          ...(settings.segments || {}),
        };
        segmentSettingsRef.current = next;
        setSegmentSettings(next);
      } catch {}
    };

    window.addEventListener('uafilms_settings_updated', handleSettingsUpdated);
    window.addEventListener('storage', handleSettingsUpdated);
    return () => {
      window.removeEventListener('uafilms_settings_updated', handleSettingsUpdated);
      window.removeEventListener('storage', handleSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    activeSegmentRef.current = activeSegment;
  }, [activeSegment]);

  useEffect(() => {
    if (!tmdbId && !imdbId) {
      setSegments([]);
      return;
    }
    const params = new URLSearchParams();
    if (tmdbId) params.set('id', tmdbId);
    if (imdbId) params.set('imdb_id', imdbId);
    if (mediaType) params.set('type', mediaType);
    if (season != null) params.set('season', season);
    if (episode != null) params.set('episode', episode);
    if (title) params.set('title', title);
    if (duration > 0) params.set('duration', Math.round(duration));

    fetch(`/segments?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { segments: [] }))
      .then((data) => {
        const list = Array.isArray(data.segments) ? data.segments : [];
        setSegments(list);
      })
      .catch(() => {
        setSegments([]);
      });
  }, [tmdbId, imdbId, mediaType, season, episode, title, duration]);

  // Keyboard shortcut: Enter to skip active segment
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;

        if (activeSegmentRef.current && playerRef.current) {
          const action = segmentSettingsRef.current[activeSegmentRef.current.type] || 'manual';
          if (action === 'manual') {
            e.preventDefault();
            e.stopPropagation();
            const dur = playerRef.current.duration() || 0;
            const targetTime = activeSegmentRef.current.endSec !== null
              ? activeSegmentRef.current.endSec
              : Math.max(0, dur - 1);
            playerRef.current.currentTime(targetTime);
            setActiveSegment(null);
            dismissSkipButtonRef.current(true);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playerRef]);

  const onSegmentTimeUpdate = useCallback((cur, dur, player) => {
    if (cur < lastCurTimeRef.current - 3) {
      skippedSegmentsRef.current.clear();
      dismissedSegmentsRef.current.clear();
    }
    lastCurTimeRef.current = cur;

    // Force hide skip button if the segment it was displayed for has ended or playback moved outside it
    if (showSkipButtonRef.current && !isClosingSkipButtonRef.current && displaySegmentRef.current) {
      const segEnd = displaySegmentRef.current.endSec !== null ? displaySegmentRef.current.endSec : dur;
      const segStart = displaySegmentRef.current.startSec || 0;
      if (cur >= segEnd || cur < segStart - 1) {
        dismissSkipButtonRef.current(false);
      }
    }

    if (segmentsRef.current.length > 0) {
      const match = segmentsRef.current.find((s) => {
        const start = s.startSec;
        const end = s.endSec !== null ? s.endSec : dur;
        return cur >= start && cur < end;
      });

      if (match) {
        const segKey = `${match.type}_${match.startSec}_${match.endSec}`;
        const action = segmentSettingsRef.current[match.type] || 'manual';

        if (action === 'off' || action === 'timeline') {
          setActiveSegment(null);
          activeSegmentKeyRef.current = null;
          if (showSkipButtonRef.current && !isClosingSkipButtonRef.current) {
            dismissSkipButtonRef.current(false);
          }
        } else if (action === 'auto') {
          if (!skippedSegmentsRef.current.has(segKey)) {
            skippedSegmentsRef.current.add(segKey);
            const targetTime = match.endSec !== null ? match.endSec : Math.max(0, dur - 1);
            player.currentTime(targetTime);

            setSkipNotice({ label: match.label, from: cur, to: targetTime, key: segKey });
            if (skipNoticeTimeoutRef.current) clearTimeout(skipNoticeTimeoutRef.current);
            skipNoticeTimeoutRef.current = setTimeout(() => {
              setSkipNotice(null);
            }, 4500);
          }
          setActiveSegment(null);
          activeSegmentKeyRef.current = null;
          dismissSkipButtonRef.current(true);
        } else {
          // action === 'manual' (default)
          setActiveSegment(match);
          if (!dismissedSegmentsRef.current.has(segKey)) {
            dismissedSegmentsRef.current.add(segKey);
            activeSegmentKeyRef.current = segKey;
            displaySegmentRef.current = match;
            setDisplaySegment(match);
            if (closeSkipTimeoutRef.current) {
              clearTimeout(closeSkipTimeoutRef.current);
              closeSkipTimeoutRef.current = null;
            }
            isClosingSkipButtonRef.current = false;
            setIsClosingSkipButton(false);
            showSkipButtonRef.current = true;
            setShowSkipButton(true);
            setSkipButtonKey(Date.now());

            if (skipBtnTimeoutRef.current) clearTimeout(skipBtnTimeoutRef.current);
            skipBtnTimeoutRef.current = setTimeout(() => {
              dismissSkipButtonRef.current(false);
            }, 10000);
          }
        }
      } else {
        setActiveSegment(null);
        activeSegmentKeyRef.current = null;
        if (showSkipButtonRef.current && !isClosingSkipButtonRef.current) {
          dismissSkipButtonRef.current(false);
        }
      }
    } else {
      setActiveSegment(null);
      activeSegmentKeyRef.current = null;
      if (showSkipButtonRef.current && !isClosingSkipButtonRef.current) {
        dismissSkipButtonRef.current(false);
      }
    }
  }, []);

  const handleSkipCurrentSegment = useCallback(() => {
    if (!playerRef.current || !displaySegment) return;
    const dur = playerRef.current.duration() || 0;
    const targetTime = displaySegment.endSec !== null ? displaySegment.endSec : Math.max(0, dur - 1);
    playerRef.current.currentTime(targetTime);
    setActiveSegment(null);
    dismissSkipButton(false);
  }, [displaySegment, dismissSkipButton, playerRef]);

  const handleUndoSkip = useCallback(() => {
    if (!playerRef.current || !skipNotice) return;
    playerRef.current.currentTime(skipNotice.from);
    if (skipNotice.key) {
      skippedSegmentsRef.current.add(skipNotice.key);
    }
    setSkipNotice(null);
  }, [skipNotice, playerRef]);

  const cleanupSegments = useCallback(() => {
    if (skipBtnTimeoutRef.current) clearTimeout(skipBtnTimeoutRef.current);
    if (closeSkipTimeoutRef.current) clearTimeout(closeSkipTimeoutRef.current);
    if (skipNoticeTimeoutRef.current) clearTimeout(skipNoticeTimeoutRef.current);
  }, []);

  return {
    segments,
    segmentSettings,
    showSkipButton,
    isClosingSkipButton,
    displaySegment,
    skipButtonKey,
    skipNotice,
    setSkipNotice,
    dismissSkipButton,
    onSegmentTimeUpdate,
    handleSkipCurrentSegment,
    handleUndoSkip,
    cleanupSegments,
  };
}

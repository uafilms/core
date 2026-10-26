import { useState, useRef, useEffect, useCallback } from 'react';
import jassubWorkerUrl from 'jassub/dist/worker/worker.js?worker&url';
import jassubWasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import jassubModernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import jassubDefaultFontUrl from 'jassub/dist/default.woff2?url';

export function useJassub({
  styledSubtitles = [],
  src,
  playerRef,
  setSelectedTrackIndex,
}) {
  const [styledTracks, setStyledTracks] = useState([]);
  const [activeStyledUrl, setActiveStyledUrl] = useState(null);
  const jassubRef = useRef(null);
  const styledTracksRef = useRef(styledTracks);
  styledTracksRef.current = styledTracks;

  const styledKey = styledSubtitles.map((s) => s.url).join('|');

  useEffect(() => {
    const list = Array.isArray(styledSubtitles) ? styledSubtitles.filter((s) => s && s.url) : [];
    setStyledTracks(list);
    setActiveStyledUrl(null);

    if (list.length === 0) return;

    let pref = null;
    try {
      pref = localStorage.getItem('uafilms_pref_subs');
    } catch {
      pref = null;
    }
    if (pref === '__off__') return;

    const match = pref ? list.find((s) => s.label === pref) : null;
    setActiveStyledUrl((match || list[0]).url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styledKey]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (!activeStyledUrl) {
      if (jassubRef.current) {
        try {
          jassubRef.current.destroy();
        } catch {
          // ignore
        }
        jassubRef.current = null;
      }
      return;
    }

    const videoEl = player.el()?.querySelector('video');
    if (!videoEl) return;

    let cancelled = false;
    const activeUrl = activeStyledUrl;

    const tracks = player.textTracks();
    if (tracks) {
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = 'disabled';
      }
    }
    setSelectedTrackIndex(-1);

    (async () => {
      try {
        const { default: JASSUB } = await import('jassub');
        if (cancelled) return;
        if (jassubRef.current) {
          try {
            jassubRef.current.destroy();
          } catch {
            // ignore
          }
          jassubRef.current = null;
        }
        jassubRef.current = new JASSUB({
          video: videoEl,
          subUrl: activeUrl,
          workerUrl: jassubWorkerUrl,
          wasmUrl: jassubWasmUrl,
          modernWasmUrl: jassubModernWasmUrl,
          defaultFont: jassubDefaultFontUrl,
          queryFonts: 'local',
        });
      } catch (err) {
        console.warn('JASSUB init failed, falling back to native subtitles:', err);
        if (cancelled) return;
        const failed = styledTracksRef.current.find((t) => t.url === activeUrl);
        setActiveStyledUrl(null);
        if (failed?.label) {
          const list = player.textTracks();
          if (list) {
            for (let i = 0; i < list.length; i++) {
              const t = list[i];
              if ((t.kind === 'subtitles' || t.kind === 'captions') && t.label === failed.label) {
                t.mode = 'showing';
                setSelectedTrackIndex(i);
                break;
              }
            }
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStyledUrl, src]);

  useEffect(() => () => {
    if (jassubRef.current) {
      try {
        jassubRef.current.destroy();
      } catch {
        // ignore
      }
      jassubRef.current = null;
    }
  }, []);

  const setStyledSubtitleTrack = useCallback((url) => {
    setActiveStyledUrl(url);
    try {
      const label = url ? styledTracksRef.current.find((t) => t.url === url)?.label || url : '__off__';
      localStorage.setItem('uafilms_pref_subs', label);
    } catch {
      // ignore
    }
  }, []);

  return {
    styledTracks,
    activeStyledUrl,
    setActiveStyledUrl,
    setStyledSubtitleTrack,
  };
}

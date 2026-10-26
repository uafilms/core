import { useState, useEffect, useRef, useCallback } from 'react';
import api, { waitForToken } from '../../../api/axios';
import {
  sortWithFavoriteCdns,
  getSourceVoice,
  sharedVideoKey,
} from '../utils/sources';

export function useOmssSources({ data, type, id, season, episode }) {
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [loadingSources, setLoadingSources] = useState(true);
  const [subtitles, setSubtitles] = useState([]);

  const selectedCdnRef = useRef(localStorage.getItem('uafilms_pref_provider') || null);
  const selectedVoiceRef = useRef(localStorage.getItem('uafilms_pref_voice') || null);
  const userPickedSourceRef = useRef(false);
  const [desiredAudioLabel, setDesiredAudioLabel] = useState(null);
  const nativeAudioCountRef = useRef(0);

  const savePreferences = useCallback((providerId, voiceName) => {
    if (providerId) {
      selectedCdnRef.current = providerId;
      localStorage.setItem('uafilms_pref_provider', providerId);
    }
    if (voiceName) {
      selectedVoiceRef.current = voiceName;
      localStorage.setItem('uafilms_pref_voice', voiceName);
    }
  }, []);

  const sourcePreferenceScore = useCallback((src) => {
    if (!src) return -1;
    const prefProvider = selectedCdnRef.current;
    const prefVoice = selectedVoiceRef.current?.toLowerCase();
    let score = 0;
    if (prefProvider && src?.provider?.id === prefProvider) score += 1;
    if (prefVoice && getSourceVoice(src).toLowerCase() === prefVoice) score += 1;
    return score;
  }, []);

  const findBestSource = useCallback((candidateSources) => {
    if (!candidateSources || candidateSources.length === 0) return null;

    const prefProvider = selectedCdnRef.current;
    const prefVoice = selectedVoiceRef.current?.toLowerCase();

    if (prefProvider && prefVoice) {
      const match = candidateSources.find(
        (s) => s?.provider?.id === prefProvider && getSourceVoice(s).toLowerCase() === prefVoice
      );
      if (match) return match;
    }

    if (prefProvider) {
      const match = candidateSources.find((s) => s?.provider?.id === prefProvider);
      if (match) return match;
    }

    if (prefVoice) {
      const match = candidateSources.find(
        (s) => getSourceVoice(s).toLowerCase() === prefVoice
      );
      if (match) return match;
    }

    return candidateSources[0];
  }, []);

  const preferBetterSource = useCallback((current, candidate) => {
    if (!candidate) return current;
    if (!current) return candidate;
    if (userPickedSourceRef.current) return current;
    if (current.id === candidate.id || current.url === candidate.url) return current;
    return sourcePreferenceScore(candidate) > sourcePreferenceScore(current) ? candidate : current;
  }, [sourcePreferenceScore]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setLoadingSources(true);
    setSources([]);
    setSelectedSource(null);
    setSubtitles([]);
    userPickedSourceRef.current = false;

    const targetId = data.imdbId || id;
    const subpath = type === 'movie'
      ? `/v1/movies/${targetId}`
      : `/v1/tv/${targetId}/seasons/${season}/episodes/${episode}`;

    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    let eventSource = null;

    (async () => {
      let turnstileToken = window.cfToken;
      if (!turnstileToken) {
        turnstileToken = await waitForToken();
      }
      if (cancelled) return;

      const authToken = localStorage.getItem('uafilms_auth_token');
      const tokenParam = turnstileToken && turnstileToken !== 'disabled' ? `&turnstile_token=${encodeURIComponent(turnstileToken)}` : '';
      const authParam = authToken ? `&auth_token=${encodeURIComponent(authToken)}` : '';
      const sseUrl = `${baseUrl}${subpath}?sse=1${tokenParam}${authParam}`;

      try {
        eventSource = new EventSource(sseUrl);

        eventSource.addEventListener('provider', (event) => {
          if (cancelled) return;
          try {
            const chunk = JSON.parse(event.data);

            if (chunk.removed) {
              setSources((prev) => {
                const updated = prev.filter((s) => s.provider?.id !== chunk.provider);
                setSelectedSource((cur) => {
                  if (cur && cur.provider?.id !== chunk.provider) return cur;
                  return findBestSource(updated) || updated[0] || null;
                });
                return updated;
              });
              setSubtitles((prev) => prev.filter((s) => s.provider?.id !== chunk.provider));
              return;
            }

            if (chunk.subtitles && Array.isArray(chunk.subtitles) && chunk.subtitles.length > 0) {
              setSubtitles((prev) => {
                const seen = new Set(prev.map((s) => s.url));
                const fresh = chunk.subtitles.filter((s) => s?.url && !seen.has(s.url));
                return fresh.length > 0 ? [...prev, ...fresh] : prev;
              });
            }
            if (chunk.sources && Array.isArray(chunk.sources) && chunk.sources.length > 0) {
              setSources((prev) => {
                const existingIds = new Set(prev.map((s) => s.id || s.url));
                const newSources = chunk.sources.filter((s) => !existingIds.has(s.id || s.url));
                const updated = sortWithFavoriteCdns([...prev, ...newSources]);

                const best = findBestSource(updated) || updated[0];
                setSelectedSource((cur) => preferBetterSource(cur, best));
                return updated;
              });
            }
          } catch (e) {
            console.error('Error parsing SSE provider chunk:', e);
          }
        });

        eventSource.addEventListener('complete', () => {
          if (cancelled) return;
          setLoadingSources(false);
          if (eventSource) {
            eventSource.close();
          }
        });

        eventSource.onerror = () => {
          if (cancelled) return;
          setLoadingSources(false);
          if (eventSource) {
            eventSource.close();
          }
        };
      } catch (err) {
        console.warn('SSE not supported or failed, falling back to standard GET:', err);
        api.get(subpath)
          .then((res) => {
            if (cancelled) return;
            const list = sortWithFavoriteCdns(res.data?.sources || []);
            setSources(list);
            setSubtitles(Array.isArray(res.data?.subtitles) ? res.data.subtitles.filter((s) => s?.url) : []);
            if (list.length > 0) {
              const best = findBestSource(list) || list[0];
              setSelectedSource((cur) => preferBetterSource(cur, best));
            }
          })
          .finally(() => {
            if (!cancelled) setLoadingSources(false);
          });
      }
    })();

    return () => {
      cancelled = true;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [data, type, id, season, episode, findBestSource, preferBetterSource]);

  const handleSourceChange = useCallback((src) => {
    userPickedSourceRef.current = true;
    const label = getSourceVoice(src);
    const sameVideo =
      src?.sharedVideo &&
      selectedSource?.sharedVideo &&
      sharedVideoKey(src) &&
      sharedVideoKey(src) === sharedVideoKey(selectedSource);
    if (sameVideo && nativeAudioCountRef.current > 1) {
      savePreferences(src?.provider?.id, label);
      setDesiredAudioLabel(label);
      return;
    }
    setDesiredAudioLabel(null);
    setSelectedSource(src);
    savePreferences(src?.provider?.id, label);
  }, [selectedSource, savePreferences]);

  const handleAudioTrackChange = useCallback((label) => {
    savePreferences(selectedSource?.provider?.id, label);
  }, [selectedSource, savePreferences]);

  return {
    sources,
    selectedSource,
    setSelectedSource,
    loadingSources,
    subtitles,
    desiredAudioLabel,
    setDesiredAudioLabel,
    nativeAudioCountRef,
    handleSourceChange,
    handleAudioTrackChange,
    findBestSource,
    savePreferences,
  };
}

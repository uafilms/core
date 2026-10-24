import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import api, { waitForToken } from '../api/axios';
import VideoPlayer from '../components/player/VideoPlayer';
import Comments from '../components/Comments';
import Dropdown from '../components/Dropdown';
import CollectionModal from '../components/CollectionModal';
import { toggleFavoriteItem, getLocalFavorites } from '../utils/sync.js';

const formatSourceName = (source) => {
  const provider = source.provider?.name || source.provider?.id || 'Джерело';
  const quality = source.quality || '';

  const parts = [provider];
  if (quality && quality !== 'Auto') parts.push(quality);

  return parts.join(' • ');
};

// Фаворитні CDN: стоять першими у списку джерел і отримують зірочку біля назви.
// Порядок у масиві задає пріоритет (fenix вище за ashdi).
const FAVORITE_CDNS = ['fenix', 'ashdi'];
const favoriteCdnRank = (source) => {
  const id = source?.provider?.id || '';
  const index = FAVORITE_CDNS.indexOf(id);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
};
const sortWithFavoriteCdns = (list) => {
  return [...list].sort((a, b) => favoriteCdnRank(a) - favoriteCdnRank(b));
};

const Details = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const initialMovie = location.state?.movie;
  const initialSeason = parseInt(searchParams.get('s') || searchParams.get('season') || '1', 10);
  const initialEpisode = parseInt(searchParams.get('e') || searchParams.get('episode') || '1', 10);
  const [data, setData] = useState(() => {
    if (!initialMovie) return null;
    return {
      id: initialMovie.id,
      title: initialMovie.title || initialMovie.name,
      posterUrl: initialMovie.poster_path ? `https://image.tmdb.org/t/p/w500${initialMovie.poster_path}` : null,
      backdropUrl: initialMovie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${initialMovie.backdrop_path}` : null,
      year: initialMovie.release_date || initialMovie.first_air_date ? parseInt(initialMovie.release_date || initialMovie.first_air_date) : null,
      overview: initialMovie.overview || '',
    };
  });
  const [loadingMeta, setLoadingMeta] = useState(!initialMovie);
  const [error, setError] = useState(null);
  const [isFav, setIsFav] = useState(false);
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);

  // OMSS Streams State (live SSE streaming)
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [loadingSources, setLoadingSources] = useState(true);
  // Субтитри з провайдерів (ASS окремо рендерить плеєр через JASSUB)
  const [subtitles, setSubtitles] = useState([]);

  // TV Series Navigation & TMDB Season/Episode Stills
  const [season, setSeason] = useState(initialSeason > 0 ? initialSeason : 1);
  const [episode, setEpisode] = useState(initialEpisode > 0 ? initialEpisode : 1);
  const [autoPlayNext, setAutoPlayNext] = useState(false);
  const [episodesMap, setEpisodesMap] = useState({});
  const [loadingSeason, setLoadingSeason] = useState(false);
  const playerRef = useRef(null);

  // Preferred provider & voice preferences for seamless episode switching
  const selectedCdnRef = useRef(localStorage.getItem('uafilms_pref_provider') || null);
  const selectedVoiceRef = useRef(localStorage.getItem('uafilms_pref_voice') || null);
  // Якщо користувач сам перемкнув джерело — авто-підбір більше його не чіпає
  const userPickedSourceRef = useRef(false);
  // Голос, який просить перемкнути користувач, коли відео спільне (Fenix)
  const [desiredAudioLabel, setDesiredAudioLabel] = useState(null);
  // Скільки нативних доріжок у плеєра — якщо >1, голос перемикаємо без reload
  const nativeAudioCountRef = useRef(0);

  // Чи це те саме відео, лише інша озвучка (Fenix: cdn/type/id ті самі, voice різний)
  const sharedVideoKey = (source) => {
    if (!source?.url) return null;
    try {
      const parsed = new URL(source.url, window.location.origin);
      const cdn = parsed.searchParams.get('cdn');
      const type = parsed.searchParams.get('type');
      const id = parsed.searchParams.get('id') || parsed.searchParams.get('url');
      const ep = parsed.searchParams.get('ep') || parsed.searchParams.get('episode');
      return [cdn, type, id, ep].filter(Boolean).join('|');
    } catch {
      return null;
    }
  };

  const savePreferences = (providerId, voiceName) => {
    if (providerId) {
      selectedCdnRef.current = providerId;
      localStorage.setItem('uafilms_pref_provider', providerId);
    }
    if (voiceName) {
      selectedVoiceRef.current = voiceName;
      localStorage.setItem('uafilms_pref_voice', voiceName);
    }
  };

  const getSourceVoice = (src) => {
    return (
      src?.studio?.name ||
      src?.audioTracks?.[0] ||
      src?.title ||
      ''
    ).trim();
  };

  // Наскільки джерело відповідає збереженим преференціям: 2 — і провайдер, і
  // голос, 1 — щось одне, 0 — нічого.
  const sourcePreferenceScore = (src) => {
    if (!src) return -1;
    const prefProvider = selectedCdnRef.current;
    const prefVoice = selectedVoiceRef.current?.toLowerCase();
    let score = 0;
    if (prefProvider && src?.provider?.id === prefProvider) score += 1;
    if (prefVoice && getSourceVoice(src).toLowerCase() === prefVoice) score += 1;
    return score;
  };

  const findBestSource = useCallback((candidateSources) => {
    if (!candidateSources || candidateSources.length === 0) return null;

    const prefProvider = selectedCdnRef.current;
    const prefVoice = selectedVoiceRef.current?.toLowerCase();

    // Level 1: exact provider + exact voice
    if (prefProvider && prefVoice) {
      const match = candidateSources.find(
        (s) => s?.provider?.id === prefProvider && getSourceVoice(s).toLowerCase() === prefVoice
      );
      if (match) return match;
    }

    // Level 2: exact provider (any voice) — провайдер важливіший за голос,
    // інакше ashdi-чанк, що приходить першим, перебиває вибір користувача
    if (prefProvider) {
      const match = candidateSources.find((s) => s?.provider?.id === prefProvider);
      if (match) return match;
    }

    // Level 3: exact voice in any provider
    if (prefVoice) {
      const match = candidateSources.find(
        (s) => getSourceVoice(s).toLowerCase() === prefVoice
      );
      if (match) return match;
    }

    // Level 4: fallback to first source
    return candidateSources[0];
  }, []);

  // Апгрейд до кращого джерела, коли черговий SSE-чанк приніс бажаний
  // провайдер/голос. Ручний вибір користувача не чіпаємо.
  const preferBetterSource = (current, candidate) => {
    if (!candidate) return current;
    if (!current) return candidate;
    if (userPickedSourceRef.current) return current;
    if (current.id === candidate.id || current.url === candidate.url) return current;
    return sourcePreferenceScore(candidate) > sourcePreferenceScore(current) ? candidate : current;
  };

  // Calculate available seasons and episodes dynamically
  const availableSeasons = useMemo(() => {
    if (data?.seasons && Array.isArray(data.seasons) && data.seasons.length > 0) {
      return data.seasons;
    }
    const count = data?.numberOfSeasons || 1;
    return Array.from({ length: count }, (_, i) => ({
      seasonNumber: i + 1,
      name: `Сезон ${i + 1}`,
      episodeCount: 24,
    }));
  }, [data]);

  const currentSeasonObj = useMemo(() => {
    return availableSeasons.find((s) => s.seasonNumber === season) || availableSeasons[0] || { seasonNumber: 1, episodeCount: 1 };
  }, [availableSeasons, season]);

  const availableEpisodes = useMemo(() => {
    const count = currentSeasonObj?.episodeCount || 1;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [currentSeasonObj]);

  // Auto-resume: якщо серіал відкрито без явних ?s/?e, підхоплюємо серію,
  // на якій користувач зупинився (localStorage.uafilms_watch_progress). Один раз.
  const resumeAppliedRef = useRef(false);
  useEffect(() => {
    if (resumeAppliedRef.current || type !== 'tv' || !data) return;
    if (searchParams.get('s') || searchParams.get('season') || searchParams.get('e') || searchParams.get('episode')) {
      resumeAppliedRef.current = true;
      return;
    }

    let store = {};
    try {
      store = JSON.parse(localStorage.getItem('uafilms_watch_progress') || '{}') || {};
    } catch {
      store = {};
    }

    const showId = data?.id || id;
    const prefix = `tv_${showId}_s`;
    let best = null;

    for (const [mediaId, entry] of Object.entries(store)) {
      if (!mediaId.startsWith(prefix) || !entry) continue;
      const match = mediaId.match(/_s(\d+)_e(\d+)$/);
      if (!match) continue;
      const updated = entry.updated || 0;
      if (!best || updated > best.updated) {
        best = {
          updated,
          time: entry.time || 0,
          duration: entry.duration || 0,
          season: parseInt(match[1], 10) || 1,
          episode: parseInt(match[2], 10) || 1,
        };
      }
    }

    resumeAppliedRef.current = true;
    if (!best) return;

    let targetSeason = best.season;
    let targetEpisode = best.episode;

    // Серію додивились (>=95%) — підхоплюємо наступну
    if (best.duration > 0 && best.time / best.duration >= 0.95) {
      const seasonObj = availableSeasons.find((s) => s.seasonNumber === targetSeason);
      const count = seasonObj?.episodeCount || 0;
      if (!count || targetEpisode + 1 <= count) {
        targetEpisode += 1;
      } else {
        const nextSeason = availableSeasons.find((s) => s.seasonNumber === targetSeason + 1);
        if (nextSeason) {
          targetSeason += 1;
          targetEpisode = 1;
        }
      }
    }

    setSeason(targetSeason);
    setEpisode(targetEpisode);
  }, [data, type, id, searchParams, availableSeasons]);

  const nextEpisodeInfo = useMemo(() => {
    if (type !== 'tv') return null;

    // Check if next episode exists in current season
    const currentEpIndex = availableEpisodes.indexOf(episode);
    if (currentEpIndex !== -1 && currentEpIndex < availableEpisodes.length - 1) {
      const nextEp = availableEpisodes[currentEpIndex + 1];
      return {
        season,
        episode: nextEp,
        label: `Сезон ${season}, Серія ${nextEp}`,
      };
    }

    // Check next season
    const currentSeasonIndex = availableSeasons.findIndex((s) => s.seasonNumber === season);
    if (currentSeasonIndex !== -1 && currentSeasonIndex < availableSeasons.length - 1) {
      const nextSeasonObj = availableSeasons[currentSeasonIndex + 1];
      return {
        season: nextSeasonObj.seasonNumber,
        episode: 1,
        label: `${nextSeasonObj.name || `Сезон ${nextSeasonObj.seasonNumber}`}, Серія 1`,
      };
    }

    return null;
  }, [type, availableEpisodes, episode, availableSeasons, season]);

  const handleNextEpisode = useCallback(() => {
    if (!nextEpisodeInfo) return;
    setAutoPlayNext(true);
    setSeason(nextEpisodeInfo.season);
    setEpisode(nextEpisodeInfo.episode);
  }, [nextEpisodeInfo]);

  const currentEpisodeObj = useMemo(() => {
    const list = episodesMap[season] || data?.episodes || [];
    return list.find((e) => e.episodeNumber === episode);
  }, [episodesMap, data, season, episode]);

  const backdropUrl = data?.backdropUrl || data?.posterUrl || '';

  const playerPoster = useMemo(() => {
    if (type === 'tv') {
      return (
        currentEpisodeObj?.stillUrl ||
        currentSeasonObj?.posterUrl ||
        backdropUrl ||
        data?.posterUrl
      );
    }
    return backdropUrl || data?.posterUrl;
  }, [type, currentEpisodeObj, currentSeasonObj, backdropUrl, data]);

  useEffect(() => {
    if (episode > availableEpisodes.length) {
      setEpisode(1);
    }
  }, [availableEpisodes, episode]);

  // 1. Fetch Metadata
  useEffect(() => {
    let active = true;
    setLoadingMeta(true);
    setError(null);

    api.get(`/details?id=${id}&type=${type}`)
      .then((res) => {
        if (active) {
          setData(res.data);
          if (res.data?.episodes && Array.isArray(res.data.episodes)) {
            setEpisodesMap({ 1: res.data.episodes });
          }
          setLoadingMeta(false);
          const favorites = getLocalFavorites();
          setIsFav(favorites.some((f) => String(f.id) === String(res.data.id || id)));
        }
      })
      .catch((err) => {
        console.error('Meta fetch error:', err);
        if (active) {
          setError('Не вдалося завантажити інформацію про фільм');
          setLoadingMeta(false);
        }
      });

    return () => {
      active = false;
    };
  }, [id, type]);

  // 1b. Fetch TV Season Details (episodes and preview stills) on season change
  useEffect(() => {
    if (type !== 'tv' || !data) return;
    if (episodesMap[season]) return;

    let cancelled = false;
    setLoadingSeason(true);

    const targetId = data.imdbId || id;
    api.get(`/season?id=${targetId}&season=${season}`)
      .then((res) => {
        if (cancelled) return;
        if (res.data?.episodes) {
          setEpisodesMap((prev) => ({
            ...prev,
            [season]: res.data.episodes,
          }));
        }
      })
      .catch((err) => {
        console.warn('Failed to load season episodes:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingSeason(false);
      });

    return () => {
      cancelled = true;
    };
  }, [season, type, data, id, episodesMap]);

  // 2. Fetch OMSS Sources via SSE (on the fly)
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

            // CDN витіснив провайдер з вищим пріоритетом — прибираємо його джерела
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

                // Auto-select preferred source/voice, allowing later upgrade to it
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
  }, [data, type, id, season, episode]);

  useEffect(() => {
    const handleFavUpdate = () => {
      if (!data) return;
      const favorites = getLocalFavorites();
      setIsFav(favorites.some((f) => String(f.id) === String(data.id || id)));
    };
    window.addEventListener('uafilms_favorites_updated', handleFavUpdate);
    return () => window.removeEventListener('uafilms_favorites_updated', handleFavUpdate);
  }, [data, id]);

  const toggleFavorite = () => {
    if (!data) return;
    const nextFav = !isFav;
    setIsFav(nextFav);
    toggleFavoriteItem(
      {
        id: data.id || id,
        title: data.title || data.originalTitle,
        poster_path: data.posterUrl,
        release_date: data.year ? `${data.year}-` : '',
        media_type: type,
      },
      nextFav
    );
  };

  if (loadingMeta) {
    return (
      <div className="page-loader">
        <progress className="circle large indeterminate"></progress>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="page-loader" style={{ flexDirection: 'column' }}>
        <i className="error-text" style={{ fontSize: '48px', marginBottom: '16px' }}>error</i>
        <p>{error}</p>
        <button className="secondary" onClick={() => navigate(-1)} style={{ marginTop: '16px' }}>
          <i>arrow_back</i>
          <span>Назад</span>
        </button>
      </div>
    );
  }

  return (
    <div className="page-transition" style={{ minHeight: '100vh' }}>
      {/* Hero Header */}
      <div style={{ position: 'relative', height: '350px', width: '100%', overflow: 'hidden' }}>
        <img
          src={backdropUrl}
          alt="Cover"
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            background: 'linear-gradient(to top, var(--surface), transparent)',
            height: '220px',
          }}
        />

        {/* Back button aligned with content container */}
        <div style={{ position: 'absolute', top: 16, left: 0, right: 0, zIndex: 10 }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 24px' }}>
            <button
              className="circle surface-container"
              onClick={() => navigate(-1)}
              style={{ cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
            >
              <i>arrow_back</i>
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 24px 40px 24px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', margin: '20px 0 16px 0' }}>
          <h4 style={{ margin: 0, fontWeight: 500, fontSize: '1.75rem', lineHeight: 1.25 }}>{data.title}</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              className="circle surface-container"
              onClick={() => setIsCollectionModalOpen(true)}
              style={{ cursor: 'pointer' }}
              title="Додати в колекцію"
            >
              <i>playlist_add</i>
            </button>
            <button
              className={`circle ${isFav ? 'secondary' : 'surface-container'}`}
              onClick={toggleFavorite}
              style={{ cursor: 'pointer' }}
              title={isFav ? 'Видалити з обраного' : 'Додати в обране'}
            >
              <i>{isFav ? 'favorite' : 'favorite_border'}</i>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <span className="chip border surface-container-low">{data.year?.toString() || '-'}</span>
          <span className="chip border surface-container-low">{type === 'movie' ? 'Фільм' : 'Серіал'}</span>

          {data.imdbRating && (
            <span className="chip border surface-container-low" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <i style={{ fontSize: '16px', color: '#f59e0b' }}>star</i>
              <span>{data.imdbRating.toString()}</span>
            </span>
          )}

          {data.genres && data.genres.map((genre) => (
            <span key={genre} className="chip border surface-container-low">{genre}</span>
          ))}
        </div>

        <div style={{ marginBottom: '32px' }}>
          <h6 className="primary-text" style={{ fontWeight: 500, marginBottom: '8px' }}>
            Про тайтл
          </h6>
          <p style={{ lineHeight: '1.6', opacity: 0.9, margin: 0, fontSize: '0.95rem' }}>
            {data.overview || 'Опис відсутній.'}
          </p>
        </div>

        {/* TV Series Season & Episode Navigation */}
        {type === 'tv' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span className="small-text surface-variant-text" style={{ fontWeight: 500 }}>Сезон</span>
              <Dropdown
                value={season}
                options={availableSeasons.map((s) => ({
                  value: s.seasonNumber,
                  label: s.name || `Сезон ${s.seasonNumber}`,
                }))}
                onChange={(s) => {
                  setSeason(s);
                  setEpisode(1);
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span className="small-text surface-variant-text" style={{ fontWeight: 500 }}>Серія</span>
              <Dropdown
                value={episode}
                options={availableEpisodes.map((e) => ({
                  value: e,
                  label: `Серія ${e}`,
                }))}
                onChange={(e) => setEpisode(e)}
              />
            </div>
          </div>
        )}

        {/* Sources / Providers Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <h6 style={{ fontWeight: 500, margin: 0 }}>
            Джерела {type === 'tv' && `(Сезон ${season}, Серія ${episode})`}
          </h6>
          {loadingSources && <progress className="circle small indeterminate"></progress>}
        </div>

        {(() => {
          // Group unique CDNs / providers
          const cdnMap = new Map();
          for (const s of sources) {
            const key = s.provider?.id || s.provider?.name || 'unknown';
            if (!cdnMap.has(key)) {
              cdnMap.set(key, s);
            }
          }
          const uniqueCdns = Array.from(cdnMap.values())
            .sort((a, b) => favoriteCdnRank(a) - favoriteCdnRank(b));

          if (uniqueCdns.length > 0) {
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {uniqueCdns.map((src, index) => {
                  const isSelected = selectedSource?.provider?.id === src.provider?.id;
                  const isFavorite = favoriteCdnRank(src) !== Number.POSITIVE_INFINITY;
                  return (
                    <button
                      key={src.provider?.id || index}
                      className={`chip ${isSelected ? 'primary' : 'border surface-container-low'}`}
                      onClick={() => {
                        // Switch to preferred source of this CDN or keep current if same
                        if (selectedSource?.provider?.id !== src.provider?.id) {
                          const cdnSources = sources.filter((s) => s.provider?.id === src.provider?.id);
                          const best = findBestSource(cdnSources) || src;
                          setSelectedSource(best);
                          savePreferences(best.provider?.id, getSourceVoice(best));
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {isFavorite && (
                        <span className="provider-favorite-star" title="Улюблений CDN" aria-label="Улюблений CDN">★</span>
                      )}
                      <span>{src.provider?.name || src.provider?.id}</span>
                    </button>
                  );
                })}
              </div>
            );
          }

          return (
            !loadingSources && (
              <div className="error-text" style={{ marginBottom: '16px' }}>
                Джерела не знайдені або недоступні
              </div>
            )
          );
        })()}

        {/* BeerCSS M3 Video.js Player */}
        <div
          ref={playerRef}
          style={{
            width: '100%',
            maxWidth: '1000px',
            aspectRatio: '16/9',
            backgroundColor: '#000',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            marginTop: '16px',
            position: 'relative',
          }}
        >
          {selectedSource ? (
            <VideoPlayer
              key={type === 'tv' ? `${data?.id || id}_s${season}_e${episode}` : `${data?.id || id}`}
              src={
                selectedSource.sharedVideo
                  ? `${selectedSource.url}${selectedSource.url.includes('?') ? '&' : '?'}mergeAudio=1`
                  : selectedSource.url
              }
              type={selectedSource.type || 'application/x-mpegURL'}
              poster={playerPoster || data?.posterUrl || data?.backdropUrl || ''}
              title={data?.title || initialMovie?.title || initialMovie?.name || ''}
              sources={sources}
              selectedSource={selectedSource}
              onSourceChange={(src) => {
                userPickedSourceRef.current = true;
                const label = getSourceVoice(src);
                // Спільне відео (Fenix): лише перемикаємо доріжку — плеєр не перезавантажується
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
              }}
              desiredAudioLabel={desiredAudioLabel}
              styledSubtitles={subtitles.filter(
                (s) => s.format === 'ass' && (!selectedSource?.provider?.id || s.provider?.id === selectedSource.provider.id)
              )}
              onNativeAudioTracksChange={(count) => {
                nativeAudioCountRef.current = count;
              }}
              onAudioTrackChange={(label) => {
                // Нативне перемикання доріжки в межах одного джерела (Fenix):
                // запам'ятовуємо голос, щоб наступна серія відкрилась із ним.
                savePreferences(selectedSource?.provider?.id, label);
              }}
              autoPlay={autoPlayNext}
              hasNextEpisode={type === 'tv' && Boolean(nextEpisodeInfo)}
              nextEpisodeLabel={nextEpisodeInfo?.label || ''}
              onNextEpisode={handleNextEpisode}
              mediaId={`${type}_${data?.id || id}${type === 'tv' ? `_s${season}_e${episode}` : ''}`}
              tmdbId={data?.id || id}
              imdbId={data?.imdbId}
              mediaType={type}
              season={type === 'tv' ? season : undefined}
              episode={type === 'tv' ? episode : undefined}
            />
          ) : (
            <div className="row center-align middle-align fill" style={{ opacity: 0.6, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {loadingSources ? 'Пошук джерел...' : 'Відео джерела недоступні'}
            </div>
          )}
        </div>

        <div style={{ marginTop: '40px' }}>
          <Comments
            title={data.title}
            originalTitle={data.originalTitle}
            year={data.year}
            imdbId={data.imdbId}
          />
        </div>
      </div>

      <CollectionModal
        isOpen={isCollectionModalOpen}
        onClose={() => setIsCollectionModalOpen(false)}
        item={{
          id: data?.id || id,
          title: data?.title || data?.originalTitle || 'Тайтл',
          poster_path: data?.posterUrl,
          release_date: data?.year ? `${data.year}-` : '',
          media_type: type,
        }}
      />
    </div>
  );
};

export default Details;

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

    // Level 2: exact voice in any provider
    if (prefVoice) {
      const match = candidateSources.find(
        (s) => getSourceVoice(s).toLowerCase() === prefVoice
      );
      if (match) return match;
    }

    // Level 3: exact provider (first available track)
    if (prefProvider) {
      const match = candidateSources.find((s) => s?.provider?.id === prefProvider);
      if (match) return match;
    }

    // Level 4: fallback to first source
    return candidateSources[0];
  }, []);

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

    const targetId = data.imdbId || id;
    const subpath = type === 'movie'
      ? `/v1/movies/${targetId}`
      : `/v1/tv/${targetId}/seasons/${season}/episodes/${episode}`;

    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    let eventSource = null;

    const isAshdi = (s) => s?.provider?.id === 'ashdi' || s?.url?.includes('cdn=ashdi') || s?.url?.includes('ashdi.vip');
    const sortWithAshdiFirst = (list) => {
      return [...list].sort((a, b) => {
        const aAsh = isAshdi(a);
        const bAsh = isAshdi(b);
        if (aAsh && !bAsh) return -1;
        if (!aAsh && bAsh) return 1;
        return 0;
      });
    };

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
            if (chunk.sources && Array.isArray(chunk.sources) && chunk.sources.length > 0) {
              setSources((prev) => {
                const existingIds = new Set(prev.map((s) => s.id || s.url));
                const newSources = chunk.sources.filter((s) => !existingIds.has(s.id || s.url));
                const updated = sortWithAshdiFirst([...prev, ...newSources]);

                // Auto-select preferred source/voice if nothing selected yet or upgrade
                setSelectedSource((cur) => {
                  if (cur) return cur;
                  return findBestSource(updated) || updated[0];
                });
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
            const list = sortWithAshdiFirst(res.data?.sources || []);
            setSources(list);
            if (list.length > 0) {
              setSelectedSource((cur) => cur || findBestSource(list) || list[0]);
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
          const uniqueCdns = Array.from(cdnMap.values());

          if (uniqueCdns.length > 0) {
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {uniqueCdns.map((src, index) => {
                  const isSelected = selectedSource?.provider?.id === src.provider?.id;
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
              src={selectedSource.url}
              type={selectedSource.type || 'application/x-mpegURL'}
              poster={playerPoster || data?.posterUrl || data?.backdropUrl || ''}
              title={data?.title || initialMovie?.title || initialMovie?.name || ''}
              sources={sources}
              selectedSource={selectedSource}
              onSourceChange={(src) => {
                setSelectedSource(src);
                savePreferences(src?.provider?.id, getSourceVoice(src));
              }}
              autoPlay={autoPlayNext}
              hasNextEpisode={Boolean(nextEpisodeInfo)}
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
          <Comments title={data.title} imdbId={data.imdbId} />
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

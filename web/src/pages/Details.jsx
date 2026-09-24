import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axios';
import VideoPlayer from '../components/player/VideoPlayer';
import Comments from '../components/Comments';
import Dropdown from '../components/Dropdown';

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

  const initialMovie = location.state?.movie;
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

  // OMSS Streams State (live SSE streaming)
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [loadingSources, setLoadingSources] = useState(true);

  // TV Series Navigation
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);

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
          setLoadingMeta(false);
          const favorites = JSON.parse(localStorage.getItem('uafilms_favorites') || '[]');
          setIsFav(favorites.some((f) => f.id == res.data.id));
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
    const sseUrl = `${baseUrl}${subpath}?sse=1`;

    let eventSource = null;

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
              const updated = [...prev, ...newSources];

              // Auto-select first source if nothing selected yet
              setSelectedSource((cur) => cur || updated[0]);
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
          const list = res.data?.sources || [];
          setSources(list);
          if (list.length > 0) {
            setSelectedSource(list[0]);
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingSources(false);
        });
    }

    return () => {
      cancelled = true;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [data, type, id, season, episode]);

  const toggleFavorite = () => {
    if (!data) return;
    const favorites = JSON.parse(localStorage.getItem('uafilms_favorites') || '[]');
    let newFavs;
    if (isFav) {
      newFavs = favorites.filter((f) => f.id != id);
    } else {
      const minData = {
        id: data.id,
        title: data.title || data.originalTitle,
        poster_path: data.posterUrl,
        release_date: data.year ? `${data.year}-` : '',
        media_type: type,
      };
      newFavs = [...favorites, minData];
    }
    localStorage.setItem('uafilms_favorites', JSON.stringify(newFavs));
    setIsFav(!isFav);
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

  const backdropUrl = data?.backdropUrl || data?.posterUrl || '';

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
          <button
            className={`circle ${isFav ? 'secondary' : 'surface-container'}`}
            onClick={toggleFavorite}
            style={{ cursor: 'pointer', flexShrink: 0 }}
            title={isFav ? 'Видалити з обраного' : 'Додати в обране'}
          >
            <i>{isFav ? 'favorite' : 'favorite_border'}</i>
          </button>
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
                        // Switch to first source of this CDN or keep current if same
                        if (selectedSource?.provider?.id !== src.provider?.id) {
                          setSelectedSource(src);
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
              key={selectedSource.id || selectedSource.url}
              src={selectedSource.url}
              type={selectedSource.type || 'application/x-mpegURL'}
              poster={backdropUrl}
              title={data.title}
              sources={sources}
              selectedSource={selectedSource}
              onSourceChange={setSelectedSource}
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
    </div>
  );
};

export default Details;

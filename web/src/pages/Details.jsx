import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import api from '../api/axios';
import Comments from '../components/Comments';

const formatSourceName = (source) => {
  const provider = source.provider?.name || source.provider?.id || 'Джерело';
  const quality = source.quality || '';
  const audio = source.audioTracks?.[0]?.label || '';

  const parts = [provider];
  if (quality && quality !== 'Auto') parts.push(quality);
  if (audio && audio !== 'Default' && audio !== 'Original') parts.push(audio);

  return parts.join(' • ');
};

const Details = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState(null);
  const [isFav, setIsFav] = useState(false);

  // OMSS Streams State
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [loadingSources, setLoadingSources] = useState(true);

  // TV Series Navigation
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);

  const videoRef = useRef(null);
  const hlsRef = useRef(null);

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

  // 2. Fetch OMSS Sources
  useEffect(() => {
    if (!data) return;
    let active = true;
    setLoadingSources(true);
    setSources([]);
    setSelectedSource(null);

    const targetId = data.imdbId || id;
    const endpoint = type === 'movie'
      ? `/v1/movies/${targetId}`
      : `/v1/tv/${targetId}/seasons/${season}/episodes/${episode}`;

    api.get(endpoint)
      .then((res) => {
        if (!active) return;
        const list = res.data?.sources || [];
        setSources(list);
        if (list.length > 0) {
          setSelectedSource(list[0]);
        }
      })
      .catch((err) => {
        console.warn('OMSS fetch sources error:', err);
      })
      .finally(() => {
        if (active) setLoadingSources(false);
      });

    return () => {
      active = false;
    };
  }, [data, type, id, season, episode]);

  // 3. Attach HLS.js video stream
  useEffect(() => {
    if (!selectedSource || !selectedSource.url) return;
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;

      hls.loadSource(selectedSource.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_, errorData) => {
        if (errorData.fatal) {
          console.warn('Hls fatal error, attempting recovery:', errorData.type);
          switch (errorData.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / iOS native HLS
      video.src = selectedSource.url;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [selectedSource]);

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
    <div style={{ minHeight: '100vh' }}>
      {/* Hero Header */}
      <div style={{ position: 'relative', height: '350px', width: '100%' }}>
        <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10 }}>
          <button className="circle surface-container" onClick={() => navigate(-1)} style={{ cursor: 'pointer' }}>
            <i>arrow_back</i>
          </button>
        </div>

        <img
          src={backdropUrl}
          alt="Cover"
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            width: '100%',
            background: 'linear-gradient(to top, var(--surface), transparent)',
            height: '200px',
          }}
        />
      </div>

      <div style={{ padding: '0 24px 40px 24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', margin: '20px 0 12px 0' }}>
          <h4 style={{ margin: 0, fontWeight: 500 }}>{data.title}</h4>
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

          {data.genres && data.genres.length > 0 && (
            <span className="chip border surface-container-low">{data.genres.join(', ')}</span>
          )}
        </div>

        <div style={{ marginBottom: '32px' }}>
          <h6 className="primary-text" style={{ fontWeight: 500, marginBottom: '8px' }}>
            Про тайтл
          </h6>
          <p style={{ lineHeight: '1.6', maxWidth: '800px', opacity: 0.9, margin: 0 }}>
            {data.overview || 'Опис відсутній.'}
          </p>
        </div>

        {/* TV Series Season & Episode Navigation */}
        {type === 'tv' && (
          <div style={{ marginBottom: '24px' }}>
            <h6 style={{ fontWeight: 500, marginBottom: '12px' }}>Сезон</h6>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '16px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <button
                  key={s}
                  className={`chip ${season === s ? 'primary' : 'border surface-container-low'}`}
                  onClick={() => {
                    setSeason(s);
                    setEpisode(1);
                  }}
                  style={{ flexShrink: 0, cursor: 'pointer' }}
                >
                  <span>Сезон {s}</span>
                </button>
              ))}
            </div>

            <h6 style={{ fontWeight: 500, marginBottom: '12px' }}>Серія</h6>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((e) => (
                <button
                  key={e}
                  className={`chip ${episode === e ? 'primary' : 'border surface-container-low'}`}
                  onClick={() => setEpisode(e)}
                  style={{ flexShrink: 0, minWidth: '42px', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <span>{e}</span>
                </button>
              ))}
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

        {sources.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {sources.map((src, index) => {
              const isSelected = selectedSource === src;
              return (
                <button
                  key={index}
                  className={`chip ${isSelected ? 'primary' : 'border surface-container-low'}`}
                  onClick={() => setSelectedSource(src)}
                  style={{ cursor: 'pointer' }}
                >
                  <span>{formatSourceName(src)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          !loadingSources && (
            <div className="error-text" style={{ marginBottom: '16px' }}>
              Джерела не знайдені або недоступні
            </div>
          )
        )}

        {/* Modern HLS Video Player */}
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
            <video
              ref={videoRef}
              controls
              playsInline
              poster={backdropUrl}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <div className="row center-align middle-align fill" style={{ opacity: 0.6 }}>
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

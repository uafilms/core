import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import api from '../api/axios';
import Comments from '../components/Comments';
import Downloader from '../components/Downloader';

import 'mdui/components/button.js';
import 'mdui/components/button-icon.js';
import 'mdui/components/icon.js';
import 'mdui/components/chip.js';
import 'mdui/components/circular-progress.js';

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
      .then(res => {
        if (active) {
          setData(res.data);
          setLoadingMeta(false);
          const favorites = JSON.parse(localStorage.getItem('uafilms_favorites') || '[]');
          setIsFav(favorites.some(f => f.id == res.data.id));
        }
      })
      .catch(err => {
        console.error('Meta fetch error:', err);
        if (active) {
          setError('Не вдалося завантажити інформацію про фільм');
          setLoadingMeta(false);
        }
      });

    return () => { active = false; };
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
      .then(res => {
        if (!active) return;
        const list = res.data?.sources || [];
        setSources(list);
        if (list.length > 0) {
          setSelectedSource(list[0]);
        }
      })
      .catch(err => {
        console.warn('OMSS fetch sources error:', err);
      })
      .finally(() => {
        if (active) setLoadingSources(false);
      });

    return () => { active = false; };
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
      newFavs = favorites.filter(f => f.id != id);
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
      <div style={{ minHeight: '100vh', background: 'rgb(var(--mdui-color-surface))', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <mdui-circular-progress indeterminate></mdui-circular-progress>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ minHeight: '100vh', background: 'rgb(var(--mdui-color-surface))', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'rgb(var(--mdui-color-error))' }}>
        <mdui-icon style={{ fontSize: '48px', marginBottom: '16px' }} name="error"></mdui-icon>
        <p>{error}</p>
        <mdui-button-icon variant="tonal" onClick={() => navigate(-1)} style={{ marginTop: '16px' }}>
          <mdui-icon name="arrow_back"></mdui-icon>
        </mdui-button-icon>
      </div>
    );
  }

  const backdropUrl = data?.backdropUrl || data?.posterUrl || '';

  return (
    <div style={{ minHeight: '100vh', background: 'rgb(var(--mdui-color-surface))', color: 'rgb(var(--mdui-color-on-surface))' }}>
      {/* Hero Header */}
      <div style={{ position: 'relative', height: '350px', width: '100%' }}>
        <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10 }}>
          <mdui-button-icon variant="tonal" onClick={() => navigate(-1)} style={{ cursor: 'pointer' }}>
            <mdui-icon name="arrow_back"></mdui-icon>
          </mdui-button-icon>
        </div>

        <div style={{ position: 'absolute', bottom: -28, right: 32, zIndex: 10 }}>
          <mdui-button-icon
            variant="tonal"
            selected={isFav ? true : undefined}
            onClick={toggleFavorite}
            style={{ width: '56px', height: '56px', cursor: 'pointer' }}
          >
            <mdui-icon name="favorite_border"></mdui-icon>
            <mdui-icon slot="selected" name="favorite"></mdui-icon>
          </mdui-button-icon>
        </div>

        <img
          src={backdropUrl}
          alt="Cover"
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
        />
        <div style={{
          position: 'absolute', bottom: 0, width: '100%',
          background: 'linear-gradient(to top, rgb(var(--mdui-color-surface)), transparent)',
          height: '200px'
        }} />
      </div>

      <div style={{ padding: '0 24px 40px 24px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '32px', margin: '16px 0 8px 0', fontFamily: 'Roboto' }}>{data.title}</h1>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', color: 'rgb(var(--mdui-color-outline))', marginBottom: '24px' }}>
          <mdui-chip variant="assist">{data.year?.toString() || '-'}</mdui-chip>
          <mdui-chip variant="assist">{type === 'movie' ? 'Фільм' : 'Серіал'}</mdui-chip>

          {data.imdbRating && (
            <mdui-chip variant="assist">
              <mdui-icon slot="icon" style={{ fontVariationSettings: "'FILL' 1" }} name="star"></mdui-icon>
              {data.imdbRating.toString()}
            </mdui-chip>
          )}

          {data.genres && data.genres.length > 0 && (
            <mdui-chip variant="assist">{data.genres.join(', ')}</mdui-chip>
          )}
        </div>

        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ fontSize: '18px', color: 'rgb(var(--mdui-color-primary))', marginBottom: '8px' }}>Про тайтл</h3>
          <p style={{ lineHeight: '1.6', fontSize: '16px', color: 'rgb(var(--mdui-color-on-surface-variant))', maxWidth: '800px' }}>
            {data.overview || 'Опис відсутній.'}
          </p>
        </div>

        {/* TV Series Season & Episode Navigation */}
        {type === 'tv' && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', color: 'rgb(var(--mdui-color-on-surface))', marginBottom: '12px' }}>Сезон</h3>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '16px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                <mdui-chip
                  key={s}
                  variant="filter"
                  selected={season === s ? true : undefined}
                  onClick={() => { setSeason(s); setEpisode(1); }}
                  style={{ cursor: 'pointer' }}
                >
                  Сезон {s}
                </mdui-chip>
              ))}
            </div>

            <h3 style={{ fontSize: '18px', color: 'rgb(var(--mdui-color-on-surface))', marginBottom: '12px' }}>Серія</h3>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map(e => (
                <mdui-chip
                  key={e}
                  variant="filter"
                  selected={episode === e ? true : undefined}
                  onClick={() => setEpisode(e)}
                  style={{ cursor: 'pointer', minWidth: '40px', justifyContent: 'center' }}
                >
                  {e}
                </mdui-chip>
              ))}
            </div>
          </div>
        )}

        {/* Sources / Providers Selector */}
        <h3 style={{ fontSize: '18px', color: 'rgb(var(--mdui-color-on-surface))', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          Джерела {type === 'tv' && `(Сезон ${season}, Серія ${episode})`}
          {loadingSources && <mdui-circular-progress indeterminate style={{ width: '18px', height: '18px' }}></mdui-circular-progress>}
        </h3>

        {sources.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {sources.map((src, index) => {
              const isSelected = selectedSource === src;
              return (
                <mdui-chip
                  key={index}
                  variant="filter"
                  selected={isSelected ? true : undefined}
                  onClick={() => setSelectedSource(src)}
                  style={{ cursor: 'pointer' }}
                >
                  {formatSourceName(src)}
                </mdui-chip>
              );
            })}
          </div>
        ) : (
          !loadingSources && (
            <div style={{ marginBottom: '16px', color: 'rgb(var(--mdui-color-error))' }}>
              Джерела не знайдені або недоступні
            </div>
          )
        )}

        {/* Modern HLS Video Player */}
        <div style={{
          width: '100%',
          maxWidth: '1000px',
          aspectRatio: '16/9',
          backgroundColor: '#000',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          marginTop: '16px',
          position: 'relative',
        }}>
          {selectedSource ? (
            <video
              ref={videoRef}
              controls
              playsInline
              poster={backdropUrl}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgb(var(--mdui-color-on-surface-variant))' }}>
              {loadingSources ? 'Пошук джерел OMSS...' : 'Відео джерела недоступні'}
            </div>
          )}
        </div>

        <Downloader
          id={data.id}
          type={type}
          title={data.title}
          originalTitle={data.originalTitle}
          year={data.year}
          providers={{}}
        />

        <div style={{ marginTop: '40px' }}>
          <Comments title={data.title} imdbId={data.imdbId} />
        </div>
      </div>
    </div>
  );
};

export default Details;

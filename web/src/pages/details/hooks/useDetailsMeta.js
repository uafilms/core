import { useState, useEffect, useCallback } from 'react';
import api from '../../../api/axios';
import { toggleFavoriteItem, getLocalFavorites } from '../../../utils/sync.js';

export function useDetailsMeta({ id, type, initialMovie }) {
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
  const [episodesMap, setEpisodesMap] = useState({});

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

  useEffect(() => {
    const handleFavUpdate = () => {
      if (!data) return;
      const favorites = getLocalFavorites();
      setIsFav(favorites.some((f) => String(f.id) === String(data.id || id)));
    };
    window.addEventListener('uafilms_favorites_updated', handleFavUpdate);
    return () => window.removeEventListener('uafilms_favorites_updated', handleFavUpdate);
  }, [data, id]);

  const toggleFavorite = useCallback(() => {
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
  }, [data, id, isFav, type]);

  const fetchSeasonEpisodes = useCallback((seasonNum) => {
    if (type !== 'tv' || !data || episodesMap[seasonNum]) return;
    const targetId = data.imdbId || id;
    api.get(`/season?id=${targetId}&season=${seasonNum}`)
      .then((res) => {
        if (res.data?.episodes) {
          setEpisodesMap((prev) => ({
            ...prev,
            [seasonNum]: res.data.episodes,
          }));
        }
      })
      .catch((err) => {
        console.warn('Failed to load season episodes:', err);
      });
  }, [type, data, id, episodesMap]);

  return {
    data,
    loadingMeta,
    error,
    episodesMap,
    isFav,
    toggleFavorite,
    fetchSeasonEpisodes,
  };
}

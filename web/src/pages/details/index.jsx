import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import Comments from '../../components/Comments';
import CollectionModal from '../../components/CollectionModal';

import { useDetailsMeta } from './hooks/useDetailsMeta';
import { useOmssSources } from './hooks/useOmssSources';
import HeroHeader from './components/HeroHeader';
import MetaInfo from './components/MetaInfo';
import TvNavigation from './components/TvNavigation';
import SourceChips from './components/SourceChips';
import PlayerContainer from './components/PlayerContainer';

export default function Details() {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const initialMovie = location.state?.movie;
  const initialSeason = parseInt(searchParams.get('s') || searchParams.get('season') || '1', 10);
  const initialEpisode = parseInt(searchParams.get('e') || searchParams.get('episode') || '1', 10);

  const [season, setSeason] = useState(initialSeason > 0 ? initialSeason : 1);
  const [episode, setEpisode] = useState(initialEpisode > 0 ? initialEpisode : 1);
  const [autoPlayNext, setAutoPlayNext] = useState(false);
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const playerRef = useRef(null);

  const {
    data,
    loadingMeta,
    error,
    episodesMap,
    isFav,
    toggleFavorite,
    fetchSeasonEpisodes,
  } = useDetailsMeta({ id, type, initialMovie });

  useEffect(() => {
    if (type === 'tv' && data) {
      fetchSeasonEpisodes(season);
    }
  }, [type, data, season, fetchSeasonEpisodes]);

  const {
    sources,
    selectedSource,
    setSelectedSource,
    loadingSources,
    subtitles,
    desiredAudioLabel,
    nativeAudioCountRef,
    handleSourceChange,
    handleAudioTrackChange,
    findBestSource,
    savePreferences,
  } = useOmssSources({ data, type, id, season, episode });

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

    const currentEpIndex = availableEpisodes.indexOf(episode);
    if (currentEpIndex !== -1 && currentEpIndex < availableEpisodes.length - 1) {
      const nextEp = availableEpisodes[currentEpIndex + 1];
      return {
        season,
        episode: nextEp,
        label: `Сезон ${season}, Серія ${nextEp}`,
      };
    }

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
      <HeroHeader backdropUrl={backdropUrl} onBack={() => navigate(-1)} />

      <div style={{ padding: '0 24px 40px 24px', maxWidth: '1000px', margin: '0 auto' }}>
        <MetaInfo
          data={data}
          type={type}
          isFav={isFav}
          onToggleFavorite={toggleFavorite}
          onOpenCollectionModal={() => setIsCollectionModalOpen(true)}
        />

        {type === 'tv' && (
          <TvNavigation
            season={season}
            setSeason={setSeason}
            episode={episode}
            setEpisode={setEpisode}
            availableSeasons={availableSeasons}
            availableEpisodes={availableEpisodes}
          />
        )}

        <SourceChips
          type={type}
          season={season}
          episode={episode}
          sources={sources}
          selectedSource={selectedSource}
          setSelectedSource={setSelectedSource}
          loadingSources={loadingSources}
          findBestSource={findBestSource}
          savePreferences={savePreferences}
        />

        <PlayerContainer
          playerRef={playerRef}
          selectedSource={selectedSource}
          type={type}
          data={data}
          id={id}
          season={season}
          episode={episode}
          initialMovie={initialMovie}
          playerPoster={playerPoster}
          sources={sources}
          onSourceChange={handleSourceChange}
          desiredAudioLabel={desiredAudioLabel}
          subtitles={subtitles}
          nativeAudioCountRef={nativeAudioCountRef}
          onAudioTrackChange={handleAudioTrackChange}
          autoPlayNext={autoPlayNext}
          nextEpisodeInfo={nextEpisodeInfo}
          onNextEpisode={handleNextEpisode}
          loadingSources={loadingSources}
        />

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
}

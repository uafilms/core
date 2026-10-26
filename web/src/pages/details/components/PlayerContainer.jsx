import React from 'react';
import VideoPlayer from '../../../components/player/VideoPlayer';

export default function PlayerContainer({
  playerRef,
  selectedSource,
  type,
  data,
  id,
  season,
  episode,
  initialMovie,
  playerPoster,
  sources,
  onSourceChange,
  desiredAudioLabel,
  subtitles,
  nativeAudioCountRef,
  onAudioTrackChange,
  autoPlayNext,
  nextEpisodeInfo,
  onNextEpisode,
  loadingSources,
}) {
  return (
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
          onSourceChange={onSourceChange}
          desiredAudioLabel={desiredAudioLabel}
          styledSubtitles={subtitles.filter(
            (s) => s.format === 'ass' && (!selectedSource?.provider?.id || s.provider?.id === selectedSource.provider.id)
          )}
          onNativeAudioTracksChange={(count) => {
            if (nativeAudioCountRef) {
              nativeAudioCountRef.current = count;
            }
          }}
          onAudioTrackChange={onAudioTrackChange}
          autoPlay={autoPlayNext}
          hasNextEpisode={type === 'tv' && Boolean(nextEpisodeInfo)}
          nextEpisodeLabel={nextEpisodeInfo?.label || ''}
          onNextEpisode={onNextEpisode}
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
  );
}

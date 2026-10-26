import React from 'react';

export default function SubsMenu({
  navDirection,
  switchMenu,
  selectedTrackIndex,
  activeStyledUrl,
  styledTracks,
  setStyledSubtitleTrack,
  textTracksList,
  setSubtitleTrack,
}) {
  return (
    <div className={`vjs-menu-page ${navDirection === 'back' ? 'vjs-page-back' : ''}`}>
      <div className="vjs-submenu-header" onClick={() => switchMenu('main', 'back')}>
        <i className="material-symbols-rounded">arrow_back</i>
        <span>Субтитри</span>
      </div>
      <div className="vjs-submenu-scroll">
        <div
          className={`vjs-submenu-option ${selectedTrackIndex === -1 && !activeStyledUrl ? 'selected' : ''}`}
          onClick={() => (activeStyledUrl ? setStyledSubtitleTrack(null) : setSubtitleTrack(-1))}
        >
          Вимкнено
        </div>
        {styledTracks.map((track) => (
          <div
            key={track.url}
            className={`vjs-submenu-option ${activeStyledUrl === track.url ? 'selected' : ''}`}
            onClick={() => setStyledSubtitleTrack(track.url)}
          >
            {track.label}
            <span className="vjs-submenu-badge">ASS</span>
          </div>
        ))}
        {textTracksList.map((track) => (
          <div
            key={track.index}
            className={`vjs-submenu-option ${selectedTrackIndex === track.index ? 'selected' : ''}`}
            onClick={() => setSubtitleTrack(track.index)}
          >
            {track.label}
          </div>
        ))}
      </div>
    </div>
  );
}

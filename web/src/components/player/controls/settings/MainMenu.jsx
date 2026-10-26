import React from 'react';

export default function MainMenu({
  navDirection,
  switchMenu,
  selectedQuality,
  qualities,
  codecOptions,
  selectedCodec,
  autoCodec,
  uniqueAudioCount,
  nativeAudioTracks,
  displayAudioLogo,
  displayAudioLabel,
  textTracksList,
  styledTracks,
  activeStyledUrl,
  selectedTrackIndex,
  playbackRate,
}) {
  return (
    <div className={`vjs-menu-page ${navDirection === 'back' ? 'vjs-page-back' : ''}`}>
      <div className="vjs-settings-item" onClick={() => switchMenu('quality', 'forward')}>
        <div className="vjs-settings-label">
          <i className="material-symbols-rounded">hd</i>
          <span>Якість</span>
        </div>
        <div className="vjs-settings-val">
          {selectedQuality === -1
            ? 'Auto'
            : qualities.find((q) => q.index === selectedQuality)?.label || 'Auto'}
        </div>
      </div>

      {codecOptions.length > 1 && (
        <div className="vjs-settings-item" onClick={() => switchMenu('codec', 'forward')}>
          <div className="vjs-settings-label">
            <i className="material-symbols-rounded">memory</i>
            <span>Кодек</span>
          </div>
          <div className="vjs-settings-val">
            {selectedCodec
              ? codecOptions.find((option) => option.id === selectedCodec)?.label || 'Auto'
              : autoCodec
                ? `Auto · ${codecOptions.find((option) => option.id === autoCodec)?.label || ''}`.trim()
                : 'Auto'}
          </div>
        </div>
      )}

      {(uniqueAudioCount > 1 || nativeAudioTracks.length > 1) && (
        <div className="vjs-settings-item" onClick={() => switchMenu('audio', 'forward')}>
          <div className="vjs-settings-label">
            <i className="material-symbols-rounded">mic</i>
            <span>Озвучка</span>
          </div>
          <div className="vjs-settings-val" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {displayAudioLogo && (
              <img
                src={displayAudioLogo}
                alt=""
                className="vjs-studio-logo-sm"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )}
            <span style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayAudioLabel}
            </span>
          </div>
        </div>
      )}

      {(textTracksList.length > 0 || styledTracks.length > 0) && (
        <div className="vjs-settings-item" onClick={() => switchMenu('subs', 'forward')}>
          <div className="vjs-settings-label">
            <i className="material-symbols-rounded">subtitles</i>
            <span>Субтитри</span>
          </div>
          <div className="vjs-settings-val">
            {activeStyledUrl
              ? styledTracks.find((t) => t.url === activeStyledUrl)?.label || 'Увімкнено'
              : selectedTrackIndex === -1
                ? 'Вимкнено'
                : textTracksList.find((t) => t.index === selectedTrackIndex)?.label || 'Увімкнено'}
          </div>
        </div>
      )}

      <div className="vjs-settings-item" onClick={() => switchMenu('speed', 'forward')}>
        <div className="vjs-settings-label">
          <i className="material-symbols-rounded">speed</i>
          <span>Швидкість</span>
        </div>
        <div className="vjs-settings-val">{playbackRate}x</div>
      </div>
    </div>
  );
}

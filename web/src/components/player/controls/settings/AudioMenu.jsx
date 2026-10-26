import React from 'react';
import { normalizeStudioLabel } from '../../utils/codec.js';

export default function AudioMenu({
  navDirection,
  switchMenu,
  nativeAudioTracks,
  selectNativeAudioTrack,
  studioLogoByLabel,
  sources,
  selectedSource,
  onSourceChange,
  closeMenu,
}) {
  return (
    <div className={`vjs-menu-page ${navDirection === 'back' ? 'vjs-page-back' : ''}`}>
      <div className="vjs-submenu-header" onClick={() => switchMenu('main', 'back')}>
        <i className="material-symbols-rounded">arrow_back</i>
        <span>Озвучка</span>
      </div>
      <div className="vjs-submenu-scroll">
        {nativeAudioTracks.length > 1 ? (
          nativeAudioTracks.map((track, trackIndex) => (
            <div
              key={`${track.label}-${trackIndex}`}
              className={`vjs-submenu-option vjs-audio-option ${track.enabled ? 'selected' : ''}`}
              onClick={() => selectNativeAudioTrack(trackIndex)}
            >
              {studioLogoByLabel.get(normalizeStudioLabel(track.label)) && (
                <div className="vjs-studio-logo-wrapper">
                  <img
                    src={studioLogoByLabel.get(normalizeStudioLabel(track.label))}
                    alt=""
                    className="vjs-studio-logo"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
              )}
              <div className="vjs-audio-text-group">
                <span className="vjs-audio-title">{track.label}</span>
                {track.language &&
                  normalizeStudioLabel(track.language) !== normalizeStudioLabel(track.label) &&
                  track.language.toLowerCase() !== 'uk' &&
                  track.language.toLowerCase() !== 'ukr' && (
                    <span className="vjs-audio-sub">
                      <span className="vjs-audio-badge">{track.language.toUpperCase()}</span>
                    </span>
                  )}
              </div>
            </div>
          ))
        ) : (() => {
          const currentProviderId = selectedSource?.provider?.id;
          const allSources = sources && sources.length > 0 ? sources : [selectedSource].filter(Boolean);
          // Filter sources strictly to the currently selected provider/CDN
          const filtered = currentProviderId
            ? allSources.filter((s) => s.provider?.id === currentProviderId)
            : allSources;
          const availableList = filtered.length > 0 ? filtered : allSources;

          // Deduplicate identical streams if multiple identical studio/urls appear
          const seenTracks = new Set();
          const uniqueList = [];
          for (const s of availableList) {
            const trackKey = `${s.studio?.name || s.audioTracks?.[0] || ''}:${s.url}`;
            if (!seenTracks.has(trackKey)) {
              seenTracks.add(trackKey);
              uniqueList.push(s);
            }
          }

          return uniqueList.map((srcOption) => {
            const isSelected = (srcOption.id || srcOption.url) === (selectedSource?.id || selectedSource?.url);
            const studioName = srcOption.studio?.name || srcOption.audioTracks?.[0] || 'Озвучення';
            const logoUrl = srcOption.studio?.logoUrl;
            const isSub = srcOption.lang && srcOption.lang !== 'uk';

            const hasQuality = srcOption.quality && srcOption.quality.toLowerCase() !== 'auto';

            return (
              <div
                key={srcOption.id || srcOption.url}
                className={`vjs-submenu-option vjs-audio-option ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  // Fenix: одне відео + кілька доріжок — перемикаємо нативно,
                  // без перезавантаження джерела (лише якщо доріжка вже доступна)
                  const voiceLabel = normalizeStudioLabel(srcOption.studio?.name || srcOption.audioTracks?.[0]);
                  const nativeIndex = nativeAudioTracks.findIndex((track) => {
                    const tNorm = normalizeStudioLabel(track.label);
                    return tNorm === voiceLabel || tNorm.includes(voiceLabel) || voiceLabel.includes(tNorm);
                  });
                  if (srcOption.sharedVideo && nativeAudioTracks.length > 1 && nativeIndex >= 0) {
                    selectNativeAudioTrack(nativeIndex);
                    return;
                  }
                  if (onSourceChange) {
                    onSourceChange(srcOption);
                  }
                  closeMenu();
                }}
              >
                {logoUrl ? (
                  <div className="vjs-studio-logo-wrapper">
                    <img
                      src={logoUrl}
                      alt=""
                      className="vjs-studio-logo"
                      onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                    />
                  </div>
                ) : null}
                <div className="vjs-audio-text-group">
                  <span className="vjs-audio-title">{studioName}</span>
                  {(isSub || hasQuality) && (
                    <span className="vjs-audio-sub">
                      {isSub && <span className="vjs-audio-badge">Субтитри</span>}
                      {hasQuality && <span className="vjs-audio-badge vjs-audio-badge-quality">{srcOption.quality}</span>}
                    </span>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

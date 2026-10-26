import React from 'react';
import MainMenu from './MainMenu';
import AudioMenu from './AudioMenu';
import SubsMenu from './SubsMenu';
import QualityMenu from './QualityMenu';
import CodecMenu from './CodecMenu';
import SpeedMenu from './SpeedMenu';

export default function SettingsMenu({
  renderedMenu,
  isClosing,
  navDirection,
  settingsMenuRef,
  playerRef,
  switchMenu,
  closeMenu,
  selectedQuality,
  qualities,
  setQuality,
  codecOptions,
  selectedCodec,
  autoCodec,
  applyCodec,
  uniqueAudioCount,
  nativeAudioTracks,
  displayAudioLogo,
  displayAudioLabel,
  selectNativeAudioTrack,
  studioLogoByLabel,
  sources,
  selectedSource,
  onSourceChange,
  textTracksList,
  styledTracks,
  activeStyledUrl,
  selectedTrackIndex,
  setSubtitleTrack,
  setStyledSubtitleTrack,
  playbackRate,
  setRate,
}) {
  if (!renderedMenu) return null;

  return (
    <div
      className={`vjs-settings-menu ${isClosing ? 'vjs-menu-closing' : 'vjs-menu-open'}`}
      ref={settingsMenuRef}
      onClick={(e) => e.stopPropagation()}
      onMouseMove={() => playerRef.current?.reportUserActivity()}
    >
      {renderedMenu === 'main' && (
        <MainMenu
          navDirection={navDirection}
          switchMenu={switchMenu}
          selectedQuality={selectedQuality}
          qualities={qualities}
          codecOptions={codecOptions}
          selectedCodec={selectedCodec}
          autoCodec={autoCodec}
          uniqueAudioCount={uniqueAudioCount}
          nativeAudioTracks={nativeAudioTracks}
          displayAudioLogo={displayAudioLogo}
          displayAudioLabel={displayAudioLabel}
          textTracksList={textTracksList}
          styledTracks={styledTracks}
          activeStyledUrl={activeStyledUrl}
          selectedTrackIndex={selectedTrackIndex}
          playbackRate={playbackRate}
        />
      )}

      {renderedMenu === 'audio' && (
        <AudioMenu
          navDirection={navDirection}
          switchMenu={switchMenu}
          nativeAudioTracks={nativeAudioTracks}
          selectNativeAudioTrack={selectNativeAudioTrack}
          studioLogoByLabel={studioLogoByLabel}
          sources={sources}
          selectedSource={selectedSource}
          onSourceChange={onSourceChange}
          closeMenu={closeMenu}
        />
      )}

      {renderedMenu === 'subs' && (
        <SubsMenu
          navDirection={navDirection}
          switchMenu={switchMenu}
          selectedTrackIndex={selectedTrackIndex}
          activeStyledUrl={activeStyledUrl}
          styledTracks={styledTracks}
          setStyledSubtitleTrack={setStyledSubtitleTrack}
          textTracksList={textTracksList}
          setSubtitleTrack={setSubtitleTrack}
        />
      )}

      {renderedMenu === 'quality' && (
        <QualityMenu
          navDirection={navDirection}
          switchMenu={switchMenu}
          selectedQuality={selectedQuality}
          setQuality={setQuality}
          qualities={qualities}
        />
      )}

      {renderedMenu === 'codec' && (
        <CodecMenu
          navDirection={navDirection}
          switchMenu={switchMenu}
          selectedCodec={selectedCodec}
          autoCodec={autoCodec}
          applyCodec={applyCodec}
          codecOptions={codecOptions}
        />
      )}

      {renderedMenu === 'speed' && (
        <SpeedMenu
          navDirection={navDirection}
          switchMenu={switchMenu}
          playbackRate={playbackRate}
          setRate={setRate}
        />
      )}
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'videojs-hotkeys';
import 'videojs-mobile-ui';
import 'videojs-mobile-ui/dist/videojs-mobile-ui.css';
import './player-style.css';

export default function VideoPlayer({
  src,
  type = 'application/x-mpegURL',
  poster,
  subtitles = [],
  sources = [],
  selectedSource = null,
  onSourceChange = null,
}) {
  const videoNode = useRef(null);
  const playerRef = useRef(null);

  const [activeMenu, setActiveMenu] = useState(null); // null | 'main' | 'quality' | 'audio' | 'speed' | 'subs'
  const activeMenuRef = useRef(null);
  const [renderedMenu, setRenderedMenu] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [navDirection, setNavDirection] = useState('forward'); // 'forward' | 'back'
  const [qualities, setQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(-1); // -1 = Auto
  const [playbackRate, setPlaybackRate] = useState(1);
  const [textTracksList, setTextTracksList] = useState([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(-1); // -1 = Off
  const closeTimeoutRef = useRef(null);

  const openMenu = (menu) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsClosing(false);
    setNavDirection('forward');
    setActiveMenu(menu);
    activeMenuRef.current = menu;
    setRenderedMenu(menu);
  };

  const switchMenu = (menu, direction = 'forward') => {
    setNavDirection(direction);
    setActiveMenu(menu);
    activeMenuRef.current = menu;
    setRenderedMenu(menu);
  };

  const closeMenu = () => {
    if (!activeMenuRef.current) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
      activeMenuRef.current = null;
      setRenderedMenu(null);
      setIsClosing(false);
    }, 200);
  };

  useEffect(() => {
    if (!videoNode.current) return;

    // Register custom Settings button once
    const Button = videojs.getComponent('Button');
    if (Button && !videojs.getComponent('BeerSettingsButton')) {
      class BeerSettingsButton extends Button {
        constructor(player, options) {
          super(player, options);
          this.addClass('vjs-settings-btn');
          this.controlText('Налаштування');
        }
        createEl() {
          const el = super.createEl();
          const placeholder = el.querySelector('.vjs-icon-placeholder');
          if (placeholder) placeholder.remove();
          const icon = videojs.dom.createEl('span', {
            className: 'material-symbols-rounded',
            innerHTML: 'settings',
          }, {
            'aria-hidden': 'true',
            style: 'pointer-events:none;font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;',
          });
          el.appendChild(icon);
          return el;
        }
      }
      videojs.registerComponent('BeerSettingsButton', BeerSettingsButton);
    }

    const player = videojs(videoNode.current, {
      autoplay: false,
      controls: true,
      fill: true,
      fluid: false,
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
      poster: poster || undefined,
      controlBar: {
        children: [
          'playToggle',
          'volumePanel',
          'currentTimeDisplay',
          'timeDivider',
          'durationDisplay',
          'progressControl',
          'BeerSettingsButton',
          'fullscreenToggle',
        ],
      },
      html5: {
        vhs: {
          overrideNative: true,
          enableLowInitialPlaylist: true,
          smoothQualityChange: true,
        },
        nativeVideoTracks: false,
        nativeAudioTracks: false,
        nativeTextTracks: false,
      },
    });

    playerRef.current = player;

    const mimeType = (type === 'hls' || src?.includes('.m3u8') || src?.includes('/master.m3u8'))
      ? 'application/x-mpegURL'
      : (type || 'application/x-mpegURL');

    if (src) {
      player.src({ src, type: mimeType });
    }

    // Attach Hotkeys
    if (typeof player.hotkeys === 'function') {
      player.hotkeys({
        volumeStep: 0.1,
        seekStep: 5,
        enableModifiersForNumbers: false,
      });
    }

    // Attach Mobile UI touch controls
    if (typeof player.mobileUi === 'function') {
      player.mobileUi({
        touchControls: { seekSeconds: 10, tapTimeout: 300, disableOnEnd: false },
        fullscreen: { enterOnRotate: true, lockOnRotate: true },
      });
    }

    // Hook Settings button click
    const settingsBtn = player.controlBar.getChild('BeerSettingsButton');
    if (settingsBtn) {
      settingsBtn.on('click', (e) => {
        e.stopPropagation();
        if (activeMenuRef.current) {
          closeMenu();
        } else {
          openMenu('main');
        }
      });
    }

    // Track text tracks (subtitles from HLS #EXT-X-MEDIA or remote tracks)
    const updateTextTracks = () => {
      const tracks = player.textTracks();
      const list = [];
      let activeIdx = -1;

      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (t.kind === 'subtitles' || t.kind === 'captions') {
          const label = t.label || t.language || `Субтитри ${list.length + 1}`;
          list.push({
            index: i,
            label,
            language: t.language,
            mode: t.mode,
          });
          if (t.mode === 'showing') {
            activeIdx = i;
          }
        }
      }
      setTextTracksList(list);
      setSelectedTrackIndex(activeIdx);
    };

    const tracks = player.textTracks();
    if (tracks) {
      tracks.addEventListener('addtrack', updateTextTracks);
      tracks.addEventListener('removetrack', updateTextTracks);
      tracks.addEventListener('change', updateTextTracks);
    }
    player.on('loadedmetadata', updateTextTracks);

    // Bind quality levels
    if (player.qualityLevels) {
      const ql = player.qualityLevels();
      const snapHeight = (h) => {
        if (h >= 2000) return 2160;
        if (h >= 1440) return 1440;
        if (h >= 900) return 1080;
        if (h >= 630) return 720;
        if (h >= 450) return 480;
        if (h >= 270) return 360;
        if (h >= 180) return 240;
        return h;
      };
      const updateQl = () => {
        const seen = new Set();
        const list = [];
        for (let i = 0; i < ql.length; i++) {
          const level = ql[i];
          const rawHeight = level.height || (level.playlist?.attributes?.RESOLUTION?.height) || 0;
          const height = rawHeight > 0 ? snapHeight(rawHeight) : 0;
          const label = height > 0 ? `${height}p` : `Рівень ${i + 1}`;
          if (!seen.has(label)) {
            seen.add(label);
            list.push({ index: i, height, label, bitrate: level.bitrate });
          }
        }
        list.sort((a, b) => b.height - a.height);
        setQualities(list);
      };

      ql.on('addqualitylevel', updateQl);
      ql.on('removequalitylevel', updateQl);
      ql.on('change', () => {
        const cur = ql.selectedIndex;
        setSelectedQuality(cur);
      });
      player.on('loadedmetadata', updateQl);
    }

    // Close menu on click inside video player
    player.on('play', () => setActiveMenu(null));

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  // Close settings menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (activeMenuRef.current) {
        const settingsMenuEl = document.querySelector('.vjs-settings-menu');
        const settingsBtnEl = document.querySelector('.vjs-settings-btn');
        if (
          settingsMenuEl && !settingsMenuEl.contains(e.target) &&
          settingsBtnEl && !settingsBtnEl.contains(e.target)
        ) {
          closeMenu();
        }
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  // Update src dynamically without recreating player
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !src) return;

    const mimeType = (type === 'hls' || src.includes('.m3u8') || src.includes('/master.m3u8'))
      ? 'application/x-mpegURL'
      : (type || 'application/x-mpegURL');

    player.src({
      src,
      type: mimeType,
    });

    if (poster) {
      player.poster(poster);
    }
  }, [src, type, poster]);

  // Handle Quality selection
  const setQuality = (targetIndex) => {
    const player = playerRef.current;
    if (!player || !player.qualityLevels) return;
    const ql = player.qualityLevels();

    if (targetIndex === -1) {
      for (let i = 0; i < ql.length; i++) {
        ql[i].enabled = true;
      }
    } else {
      for (let i = 0; i < ql.length; i++) {
        ql[i].enabled = i === targetIndex;
      }
    }
    setSelectedQuality(targetIndex);
    closeMenu();
  };

  // Handle Subtitle selection
  const setSubtitleTrack = (targetIndex) => {
    const player = playerRef.current;
    if (!player) return;
    const tracks = player.textTracks();
    if (!tracks) return;

    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
        tracks[i].mode = (i === targetIndex) ? 'showing' : 'disabled';
      }
    }
    setSelectedTrackIndex(targetIndex);
    closeMenu();
  };

  // Handle Rate selection
  const setRate = (rate) => {
    const player = playerRef.current;
    if (player) {
      player.playbackRate(rate);
      setPlaybackRate(rate);
    }
    closeMenu();
  };

  return (
    <div className="player-wrapper">
      <div data-vjs-player style={{ width: '100%', height: '100%' }}>
        <video ref={videoNode} className="video-js vjs-default-skin" playsInline />
      </div>

      {/* BeerCSS M3 Settings Menu */}
      {renderedMenu && (
        <div
          className={`vjs-settings-menu ${isClosing ? 'vjs-menu-closing' : 'vjs-menu-open'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {renderedMenu === 'main' && (
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

              <div className="vjs-settings-item" onClick={() => switchMenu('audio', 'forward')}>
                <div className="vjs-settings-label">
                  <i className="material-symbols-rounded">mic</i>
                  <span>Озвучка</span>
                </div>
                <div className="vjs-settings-val" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {selectedSource?.studio?.logoUrl && (
                    <img
                      src={selectedSource.studio.logoUrl}
                      alt=""
                      className="vjs-studio-logo-sm"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <span style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedSource?.studio?.name || selectedSource?.audioTracks?.[0] || 'За замовчуванням'}
                  </span>
                </div>
              </div>

              {textTracksList.length > 0 && (
                <div className="vjs-settings-item" onClick={() => switchMenu('subs', 'forward')}>
                  <div className="vjs-settings-label">
                    <i className="material-symbols-rounded">subtitles</i>
                    <span>Субтитри</span>
                  </div>
                  <div className="vjs-settings-val">
                    {selectedTrackIndex === -1
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
          )}

          {renderedMenu === 'audio' && (
            <div className={`vjs-menu-page ${navDirection === 'back' ? 'vjs-page-back' : ''}`}>
              <div className="vjs-submenu-header" onClick={() => switchMenu('main', 'back')}>
                <i className="material-symbols-rounded">arrow_back</i>
                <span>Озвучка</span>
              </div>
              <div className="vjs-submenu-scroll">
                {(() => {
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

                    return (
                      <div
                        key={srcOption.id || srcOption.url}
                        className={`vjs-submenu-option vjs-audio-option ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
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
                          <span className="vjs-audio-sub">
                            {isSub && <span className="vjs-audio-badge">Субтитри</span>}
                            {srcOption.quality && <span>{srcOption.quality}</span>}
                          </span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {renderedMenu === 'subs' && (
            <div className={`vjs-menu-page ${navDirection === 'back' ? 'vjs-page-back' : ''}`}>
              <div className="vjs-submenu-header" onClick={() => switchMenu('main', 'back')}>
                <i className="material-symbols-rounded">arrow_back</i>
                <span>Субтитри</span>
              </div>
              <div className="vjs-submenu-scroll">
                <div
                  className={`vjs-submenu-option ${selectedTrackIndex === -1 ? 'selected' : ''}`}
                  onClick={() => setSubtitleTrack(-1)}
                >
                  Вимкнено
                </div>
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
          )}

          {renderedMenu === 'quality' && (
            <div className={`vjs-menu-page ${navDirection === 'back' ? 'vjs-page-back' : ''}`}>
              <div className="vjs-submenu-header" onClick={() => switchMenu('main', 'back')}>
                <i className="material-symbols-rounded">arrow_back</i>
                <span>Якість відео</span>
              </div>
              <div className="vjs-submenu-scroll">
                <div
                  className={`vjs-submenu-option ${selectedQuality === -1 ? 'selected' : ''}`}
                  onClick={() => setQuality(-1)}
                >
                  Auto
                </div>
                {qualities.map((q) => (
                  <div
                    key={q.index}
                    className={`vjs-submenu-option ${selectedQuality === q.index ? 'selected' : ''}`}
                    onClick={() => setQuality(q.index)}
                  >
                    {q.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {renderedMenu === 'speed' && (
            <div className={`vjs-menu-page ${navDirection === 'back' ? 'vjs-page-back' : ''}`}>
              <div className="vjs-submenu-header" onClick={() => switchMenu('main', 'back')}>
                <i className="material-symbols-rounded">arrow_back</i>
                <span>Швидкість відтворення</span>
              </div>
              <div className="vjs-submenu-scroll">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                  <div
                    key={rate}
                    className={`vjs-submenu-option ${playbackRate === rate ? 'selected' : ''}`}
                    onClick={() => setRate(rate)}
                  >
                    {rate}x
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

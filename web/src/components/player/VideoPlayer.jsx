import React, { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'videojs-contrib-quality-levels';
import 'videojs-hotkeys';
import 'videojs-mobile-ui';
import './player-style.css';

export default function VideoPlayer({
  src,
  type = 'application/x-mpegURL',
  poster,
  title,
  subtitles = [],
  sources = [],
  selectedSource,
  onSourceChange,
}) {
  const videoNode = useRef(null);
  const playerRef = useRef(null);
  const [activeMenu, setActiveMenu] = useState(null); // null | 'quality' | 'audio' | 'speed' | 'subs'
  const [qualities, setQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(-1); // -1 = Auto
  const [playbackRate, setPlaybackRate] = useState(1);
  const [subsList, setSubsList] = useState([]);
  const [activeSub, setActiveSub] = useState('off');

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
          const el = super.createEl('button', {
            className: 'vjs-control vjs-button vjs-settings-btn',
            type: 'button',
          });
          const icon = videojs.dom.createEl('span', {
            className: 'material-symbols-rounded icon-placeholder',
            innerHTML: 'settings',
            style: 'pointer-events: none;',
          });
          if (el.firstChild) el.insertBefore(icon, el.firstChild);
          else el.appendChild(icon);
          return el;
        }
      }
      videojs.registerComponent('BeerSettingsButton', BeerSettingsButton);
    }

    const player = videojs(videoNode.current, {
      autoplay: false,
      controls: true,
      fluid: true,
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
      },
    });

    playerRef.current = player;

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
        setActiveMenu((prev) => (prev ? null : 'main'));
      });
    }

    // Bind quality levels
    if (player.qualityLevels) {
      const ql = player.qualityLevels();
      const updateQl = () => {
        const list = [];
        for (let i = 0; i < ql.length; i++) {
          const level = ql[i];
          const height = level.height || (level.playlist?.attributes?.RESOLUTION?.height) || 0;
          const label = height > 0 ? `${height}p` : `Рівень ${i + 1}`;
          list.push({ index: i, height, label, bitrate: level.bitrate });
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

  // Update src dynamically without recreating player
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !src) return;

    player.src({
      src,
      type: src.includes('.m3u8') || src.includes('/master.m3u8') ? 'application/x-mpegURL' : type,
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
      // Auto: enable all levels
      for (let i = 0; i < ql.length; i++) {
        ql[i].enabled = true;
      }
    } else {
      // Specific level: enable only target
      for (let i = 0; i < ql.length; i++) {
        ql[i].enabled = i === targetIndex;
      }
    }
    setSelectedQuality(targetIndex);
    setActiveMenu(null);
  };

  // Handle Rate selection
  const setRate = (rate) => {
    const player = playerRef.current;
    if (player) {
      player.playbackRate(rate);
      setPlaybackRate(rate);
    }
    setActiveMenu(null);
  };

  return (
    <div className="player-wrapper">
      <div data-vjs-player style={{ width: '100%', height: '100%' }}>
        <video ref={videoNode} className="video-js vjs-default-skin" playsInline />
      </div>

      {/* BeerCSS M3 Settings Menu */}
      {activeMenu && (
        <div className="vjs-settings-menu" onClick={(e) => e.stopPropagation()}>
          {activeMenu === 'main' && (
            <div className="vjs-main-menu">
              <div className="vjs-settings-item" onClick={() => setActiveMenu('audio')}>
                <div className="vjs-settings-label">
                  <i className="material-symbols-rounded">mic</i>
                  <span>Озвучка</span>
                </div>
                <div className="vjs-settings-val">
                  {selectedSource?.audioTracks?.[0] || selectedSource?.provider?.name || 'Default'}
                </div>
              </div>

              <div className="vjs-settings-item" onClick={() => setActiveMenu('quality')}>
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

              <div className="vjs-settings-item" onClick={() => setActiveMenu('speed')}>
                <div className="vjs-settings-label">
                  <i className="material-symbols-rounded">speed</i>
                  <span>Швидкість</span>
                </div>
                <div className="vjs-settings-val">{playbackRate}x</div>
              </div>
            </div>
          )}

          {activeMenu === 'audio' && (
            <div>
              <div className="vjs-submenu-header" onClick={() => setActiveMenu('main')}>
                <i className="material-symbols-rounded">arrow_back</i>
                <span>Озвучка та джерела</span>
              </div>
              <div className="vjs-submenu-scroll">
                {sources.map((s, idx) => {
                  const isCur = s.url === src;
                  const label = s.audioTracks?.[0] || s.provider?.name || `Джерело ${idx + 1}`;
                  return (
                    <div
                      key={s.id || idx}
                      className={`vjs-submenu-option ${isCur ? 'selected' : ''}`}
                      onClick={() => {
                        if (onSourceChange) onSourceChange(s);
                        setActiveMenu(null);
                      }}
                    >
                      {label} ({s.quality || 'Auto'})
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeMenu === 'quality' && (
            <div>
              <div className="vjs-submenu-header" onClick={() => setActiveMenu('main')}>
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

          {activeMenu === 'speed' && (
            <div>
              <div className="vjs-submenu-header" onClick={() => setActiveMenu('main')}>
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

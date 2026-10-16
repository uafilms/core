import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'videojs-hotkeys';
import 'videojs-mobile-ui';
import 'videojs-mobile-ui/dist/videojs-mobile-ui.css';
import './player-style.css';
import { saveWatchProgress, removeWatchProgress, getLocalWatchProgress, flushWatchProgress } from '../../utils/sync.js';

// Родини кодеків для перемикача "Кодек". Деякі CDN (напр. Fenix) віддають в одному
// мастері і H.264, і HEVC — тоді має сенс дати вибір, в інших випадках вкладка не показується.
// Порядок = пріоритет Auto-вибору: кращий стиск/менше трафіку — вище.
const CODEC_FAMILIES = [
  { id: 'av01', label: 'AV1', pattern: /^av01/i },
  { id: 'vp09', label: 'VP9', pattern: /^vp09/i },
  { id: 'hevc', label: 'HEVC', pattern: /^(hvc1|hev1)/i },
  { id: 'avc', label: 'H.264', pattern: /^(avc1|avc3)/i },
];

const codecPriorityOf = (id) => {
  const index = CODEC_FAMILIES.findIndex((family) => family.id === id);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

const codecFamilyOf = (codecs) => {
  if (!codecs || typeof codecs !== 'string') return null;
  const parts = codecs.split(',').map((part) => part.trim()).filter(Boolean);
  return CODEC_FAMILIES.find((family) => parts.some((part) => family.pattern.test(part))) || null;
};

const isCodecSupported = (codecs) => {
  if (!codecs || typeof MediaSource === 'undefined' || typeof MediaSource.isTypeSupported !== 'function') {
    return true;
  }
  try {
    return MediaSource.isTypeSupported(`video/mp4; codecs="${codecs}"`);
  } catch {
    return true;
  }
};

export default function VideoPlayer({
  src,
  type = 'application/x-mpegURL',
  poster,
  title = '',
  subtitles = [],
  sources = [],
  selectedSource = null,
  onSourceChange = null,
  onAudioTrackChange = null,
  // Голос, який треба увімкнути нативно (Fenix: одне відео, кілька доріжок).
  // Не змінює джерело, тож плеєр не перезавантажується.
  desiredAudioLabel = null,
  // Скільки нативних доріжок зараз у плеєрі — батько вирішує, чи можна
  // перемикати голос без зміни джерела.
  onNativeAudioTracksChange = null,
  autoPlay = false,
  hasNextEpisode = false,
  nextEpisodeLabel = '',
  onNextEpisode = null,
  mediaId = null,
  tmdbId = null,
  imdbId = null,
  mediaType = 'movie',
  season = null,
  episode = null,
}) {
  const videoNode = useRef(null);
  const playerRef = useRef(null);
  const restoreTimeRef = useRef(null);
  const shouldResumePlayRef = useRef(autoPlay);

  // Auto-next episode countdown state
  const [nextCountdown, setNextCountdown] = useState(null); // seconds remaining, e.g. 5
  const nextCountdownTimerRef = useRef(null);
  const hasNextEpisodeRef = useRef(hasNextEpisode);
  const onNextEpisodeRef = useRef(onNextEpisode);
  hasNextEpisodeRef.current = hasNextEpisode;
  onNextEpisodeRef.current = onNextEpisode;

  const [activeMenu, setActiveMenu] = useState(null); // null | 'main' | 'quality' | 'codec' | 'audio' | 'speed' | 'subs'
  const activeMenuRef = useRef(null);
  const [renderedMenu, setRenderedMenu] = useState(null);
  const renderedMenuRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);
  const [navDirection, setNavDirection] = useState('forward'); // 'forward' | 'back'
  const [qualities, setQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(-1); // -1 = Auto
  // Нативні аудіодоріжки джерела (напр. Fenix: одне відео + кілька озвучок)
  const [nativeAudioTracks, setNativeAudioTracks] = useState([]);
  const [codecOptions, setCodecOptions] = useState([]); // [{ id, label, maxHeight, supported }]
  const [selectedCodec, setSelectedCodec] = useState(null); // null = Auto (найкращий підтримуваний)
  const [autoCodec, setAutoCodec] = useState(null); // id родини, яку Auto обрав за пріоритетом
  const selectedCodecRef = useRef(null);
  const selectedQualityRef = useRef(-1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [textTracksList, setTextTracksList] = useState([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(-1); // -1 = Off
  const [playerContainerEl, setPlayerContainerEl] = useState(null);
  const closeTimeoutRef = useRef(null);
  const openTimeRef = useRef(0);
  const sourcesRef = useRef(sources);
  const selectedSourceRef = useRef(selectedSource);
  selectedCodecRef.current = selectedCodec;
  selectedQualityRef.current = selectedQuality;
  const onSourceChangeRef = useRef(onSourceChange);
  const metaRef = useRef({ title, poster, mediaType, tmdbId, season, episode });

  useEffect(() => {
    metaRef.current = { title, poster, mediaType, tmdbId, season, episode };
  }, [title, poster, mediaType, tmdbId, season, episode]);

  // SponsorBlock / TheIntroDB Media Segments
  const [segments, setSegments] = useState([]);
  const segmentsRef = useRef([]);
  const [activeSegment, setActiveSegment] = useState(null);
  const activeSegmentRef = useRef(null);
  const activeSegmentKeyRef = useRef(null);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const showSkipButtonRef = useRef(false);
  const [isClosingSkipButton, setIsClosingSkipButton] = useState(false);
  const isClosingSkipButtonRef = useRef(false);
  const [displaySegment, setDisplaySegment] = useState(null);
  const displaySegmentRef = useRef(null);
  const [skipButtonKey, setSkipButtonKey] = useState(0);
  const skipBtnTimeoutRef = useRef(null);
  const closeSkipTimeoutRef = useRef(null);

  const dismissSkipButton = useCallback((immediate = false) => {
    if (skipBtnTimeoutRef.current) {
      clearTimeout(skipBtnTimeoutRef.current);
      skipBtnTimeoutRef.current = null;
    }
    if (closeSkipTimeoutRef.current) {
      clearTimeout(closeSkipTimeoutRef.current);
      closeSkipTimeoutRef.current = null;
    }

    if (immediate) {
      showSkipButtonRef.current = false;
      isClosingSkipButtonRef.current = false;
      displaySegmentRef.current = null;
      setShowSkipButton(false);
      setIsClosingSkipButton(false);
      setDisplaySegment(null);
      return;
    }

    if (isClosingSkipButtonRef.current) return;

    isClosingSkipButtonRef.current = true;
    setIsClosingSkipButton(true);
    closeSkipTimeoutRef.current = setTimeout(() => {
      showSkipButtonRef.current = false;
      isClosingSkipButtonRef.current = false;
      displaySegmentRef.current = null;
      setShowSkipButton(false);
      setIsClosingSkipButton(false);
      setDisplaySegment(null);
      closeSkipTimeoutRef.current = null;
    }, 350);
  }, []);

  const dismissSkipButtonRef = useRef(dismissSkipButton);
  useEffect(() => {
    dismissSkipButtonRef.current = dismissSkipButton;
  }, [dismissSkipButton]);

  const [segmentSettings, setSegmentSettings] = useState(() => {
    try {
      const settings = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
      return {
        intro: 'manual',
        credits: 'manual',
        recap: 'manual',
        preview: 'manual',
        ...(settings.segments || {}),
      };
    } catch {
      return {
        intro: 'manual',
        credits: 'manual',
        recap: 'manual',
        preview: 'manual',
      };
    }
  });
  const segmentSettingsRef = useRef(segmentSettings);

  useEffect(() => {
    segmentSettingsRef.current = segmentSettings;
  }, [segmentSettings]);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      try {
        const settings = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
        const next = {
          intro: 'manual',
          credits: 'manual',
          recap: 'manual',
          preview: 'manual',
          ...(settings.segments || {}),
        };
        segmentSettingsRef.current = next;
        setSegmentSettings(next);
      } catch {}
    };

    window.addEventListener('uafilms_settings_updated', handleSettingsUpdated);
    window.addEventListener('storage', handleSettingsUpdated);
    return () => {
      window.removeEventListener('uafilms_settings_updated', handleSettingsUpdated);
      window.removeEventListener('storage', handleSettingsUpdated);
    };
  }, []);

  const [skipNotice, setSkipNotice] = useState(null);
  const skipNoticeTimeoutRef = useRef(null);
  const skippedSegmentsRef = useRef(new Set());
  const dismissedSegmentsRef = useRef(new Set());
  const lastCurTimeRef = useRef(0);
  const [duration, setDuration] = useState(0);
  const [progressHolderEl, setProgressHolderEl] = useState(null);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    activeSegmentRef.current = activeSegment;
  }, [activeSegment]);

  useEffect(() => {
    if (!tmdbId && !imdbId) {
      setSegments([]);
      return;
    }
    const params = new URLSearchParams();
    if (tmdbId) params.set('id', tmdbId);
    if (imdbId) params.set('imdb_id', imdbId);
    if (mediaType) params.set('type', mediaType);
    if (season != null) params.set('season', season);
    if (episode != null) params.set('episode', episode);
    if (title) params.set('title', title);
    if (duration > 0) params.set('duration', Math.round(duration));

    fetch(`/segments?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { segments: [] }))
      .then((data) => {
        const list = Array.isArray(data.segments) ? data.segments : [];
        setSegments(list);
      })
      .catch(() => {
        setSegments([]);
      });
  }, [tmdbId, imdbId, mediaType, season, episode, title, duration]);

  // Keyboard shortcut: Enter to skip active segment
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;

        if (activeSegmentRef.current && playerRef.current) {
          const action = segmentSettingsRef.current[activeSegmentRef.current.type] || 'manual';
          if (action === 'manual') {
            e.preventDefault();
            e.stopPropagation();
            const dur = playerRef.current.duration() || 0;
            const targetTime = activeSegmentRef.current.endSec !== null
              ? activeSegmentRef.current.endSec
              : Math.max(0, dur - 1);
            playerRef.current.currentTime(targetTime);
            setActiveSegment(null);
            dismissSkipButtonRef.current(true);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    sourcesRef.current = sources;
    selectedSourceRef.current = selectedSource;
    onSourceChangeRef.current = onSourceChange;
  }, [sources, selectedSource, onSourceChange]);

  const openMenu = (menu) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    openTimeRef.current = Date.now();
    setIsClosing(false);
    setNavDirection('forward');
    setActiveMenu(menu);
    activeMenuRef.current = menu;
    setRenderedMenu(menu);
    if (playerRef.current) {
      playerRef.current.userActive(true);
    }
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

  const closeMenuRef = useRef(closeMenu);
  closeMenuRef.current = closeMenu;

  useEffect(() => {
    if (!videoNode.current) return;

    const Button = videojs.getComponent('Button');

    // Register custom Next Episode button once
    if (Button && !videojs.getComponent('BeerNextButton')) {
      class BeerNextButton extends Button {
        constructor(player, options) {
          super(player, options);
          this.addClass('vjs-next-btn');
          this.controlText('Наступна серія');
        }
        handleClick(event) {
          super.handleClick(event);
          this.player_.trigger('nextEpisodeTrigger');
        }
        createEl() {
          const el = super.createEl();
          const placeholder = el.querySelector('.vjs-icon-placeholder');
          if (placeholder) placeholder.remove();
          const icon = videojs.dom.createEl('span', {
            className: 'material-symbols-rounded',
            innerHTML: 'skip_next',
          }, {
            'aria-hidden': 'true',
            style: 'pointer-events:none;font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;',
          });
          el.appendChild(icon);
          return el;
        }
      }
      videojs.registerComponent('BeerNextButton', BeerNextButton);
    }

    // Register custom Settings button once
    if (Button && !videojs.getComponent('BeerSettingsButton')) {
      class BeerSettingsButton extends Button {
        constructor(player, options) {
          super(player, options);
          this.addClass('vjs-settings-btn');
          this.controlText('Налаштування');
        }
        handleClick(event) {
          super.handleClick(event);
          this.player_.trigger('toggleSettings');
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
      autoplay: autoPlay ? 'any' : false,
      controls: true,
      fill: true,
      fluid: false,
      inactivityTimeout: 1500,
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
          'BeerNextButton',
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

    player.ready(() => {
      setPlayerContainerEl(player.el());
      const holder = player.el()?.querySelector('.vjs-progress-holder');
      if (holder) setProgressHolderEl(holder);
    });

    const mimeType = (type === 'hls' || src?.includes('.m3u8') || src?.includes('/master.m3u8'))
      ? 'application/x-mpegURL'
      : (type || 'application/x-mpegURL');

    if (src) {
      player.src({ src, type: mimeType });
    }

    // Джерела, де всі озвучки ділять одне відео (Fenix/mergeAudio), приходять
    // одним майстром із кількома аудіогрупами — перемикаємо доріжки нативно.
    const syncNativeAudioTracks = () => {
      try {
        const list = player.audioTracks?.();
        if (!list) return;
        const tracks = [];
        for (let i = 0; i < list.length; i++) {
          const track = list[i];
          tracks.push({
            label: track.label || track.language || `Доріжка ${i + 1}`,
            language: track.language || '',
            enabled: track.enabled !== false,
          });
        }
        setNativeAudioTracks(tracks);
      } catch {
        // audioTracks недоступні — лишаємось на перемиканні джерел
      }
    };

    player.on('loadedmetadata', syncNativeAudioTracks);
    player.on('loadedplaylist', syncNativeAudioTracks);
    const audioTrackList = player.audioTracks?.();
    if (audioTrackList?.addEventListener) {
      audioTrackList.addEventListener('addtrack', syncNativeAudioTracks);
      audioTrackList.addEventListener('change', syncNativeAudioTracks);
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

    // Курсор пішов з плеєра — ховаємо панель одразу, не чекаючи inactivityTimeout.
    // Поки відкрите меню налаштувань, панель не чіпаємо (нею керує окремий ефект).
    const playerEl = player.el();
    const onPlayerMouseLeave = () => {
      if (renderedMenuRef.current) return;
      if (!player.paused()) player.userActive(false);
    };
    playerEl?.addEventListener('mouseleave', onPlayerMouseLeave);

    // Patch VHS VTTSegmentLoader time mapping: prevent negative PTS offset from causing cues to rush ahead
    const patchVttTimeMapping = () => {
      try {
        const tech = player.tech({ IWillNotUseThisInPlugins: true });
        const subLoader = tech?.vhs?.playlistController_?.subtitleSegmentLoader_;
        if (!subLoader) return;
        const proto = Object.getPrototypeOf(subLoader);
        if (!proto || proto.__timeMappingPatched) return;
        proto.__timeMappingPatched = true;
        const origUpdate = proto.updateTimeMapping_;
        proto.updateTimeMapping_ = function (segmentInfo, mappingObj, playlist) {
          if (segmentInfo?.timestampmap?.MPEGTS === 0 && segmentInfo?.timestampmap?.LOCAL === 0) {
            if (playlist && !playlist.syncInfo && segmentInfo.cues?.length) {
              const firstStart = segmentInfo.cues[0].startTime;
              const lastStart = segmentInfo.cues[segmentInfo.cues.length - 1].startTime;
              playlist.syncInfo = {
                mediaSequence: playlist.mediaSequence + segmentInfo.mediaIndex,
                time: Math.min(firstStart, lastStart - (segmentInfo.segment?.duration || 0)),
              };
            }
            return;
          }
          return origUpdate.call(this, segmentInfo, mappingObj, playlist);
        };
      } catch (e) {
        // Silently continue if VHS internals differ
      }
    };

    player.on('loadstart', patchVttTimeMapping);
    player.on('loadedmetadata', patchVttTimeMapping);
    patchVttTimeMapping();

    // Hook Next Episode button click and mobile tap
    const nextBtn = player.controlBar?.getChild('BeerNextButton');
    const handleNextClick = (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      if (hasNextEpisodeRef.current && onNextEpisodeRef.current) {
        onNextEpisodeRef.current();
      }
    };
    if (nextBtn) {
      nextBtn.on(['click', 'tap', 'touchend'], handleNextClick);
      if (!hasNextEpisodeRef.current) {
        nextBtn.hide();
      }
    }
    player.on('nextEpisodeTrigger', handleNextClick);

    // Hook Settings button click and mobile tap
    const settingsBtn = player.controlBar.getChild('BeerSettingsButton');
    let lastToggleTime = 0;
    const handleSettingsToggle = (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      const now = Date.now();
      if (now - lastToggleTime < 250) return;
      lastToggleTime = now;
      if (activeMenuRef.current) {
        closeMenu();
      } else {
        openMenu('main');
      }
    };

    if (settingsBtn) {
      settingsBtn.on(['click', 'tap', 'touchend'], handleSettingsToggle);
    }
    player.on('toggleSettings', handleSettingsToggle);

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
        const families = new Map();
        for (let i = 0; i < ql.length; i++) {
          const level = ql[i];
          const levelCodecs = level.playlist?.attributes?.CODECS || '';
          const rawHeight = level.height || (level.playlist?.attributes?.RESOLUTION?.height) || 0;
          const height = rawHeight > 0 ? snapHeight(rawHeight) : 0;
          const label = height > 0 ? `${height}p` : `Рівень ${i + 1}`;
          if (!seen.has(label)) {
            seen.add(label);
            list.push({ index: i, height, label, bitrate: level.bitrate });
          }

          const family = codecFamilyOf(levelCodecs);
          if (family) {
            const prev = families.get(family.id) || {
              id: family.id,
              label: family.label,
              maxHeight: 0,
              supported: false,
            };
            if (height > prev.maxHeight) prev.maxHeight = height;
            prev.supported = prev.supported || isCodecSupported(levelCodecs);
            families.set(family.id, prev);
          }
        }
        list.sort((a, b) => b.height - a.height);
        setQualities(list);

        const options = Array.from(families.values());
        options.sort((a, b) => codecPriorityOf(a.id) - codecPriorityOf(b.id));
        // Вкладку "Кодек" показуємо лише коли джерело справді має кілька кодеків
        setCodecOptions(options.length > 1 ? options : []);

        // Auto віддає перевагу найкращому підтримуваному кодеку (AV1 > VP9 > HEVC > H.264)
        const preferred = options.find((option) => option.supported) || null;
        setAutoCodec(preferred ? preferred.id : null);

        // Якщо кодеків кілька — лишаємо увімкненими лише рівні обраного кодеку
        // (явний вибір або Auto), щоб автіякість не стрибала на гірший/недоступний кодек
        if (options.length > 1 && selectedQualityRef.current === -1) {
          const activeCodec = selectedCodecRef.current || (preferred ? preferred.id : null);
          for (let i = 0; i < ql.length; i++) {
            const levelCodecs = ql[i].playlist?.attributes?.CODECS || '';
            const levelFamily = codecFamilyOf(levelCodecs);
            if (activeCodec) {
              ql[i].enabled = !!levelFamily && levelFamily.id === activeCodec;
            } else {
              ql[i].enabled = true;
            }
          }
        }
      };

      ql.on('addqualitylevel', updateQl);
      ql.on('removequalitylevel', updateQl);
      ql.on('change', () => {
        const cur = ql.selectedIndex;
        setSelectedQuality(cur);
      });
      player.on('loadedmetadata', updateQl);
    }

    // Close menu on click inside video player or when user becomes inactive
    player.on('play', () => closeMenuRef.current());
    player.on('userinactive', () => {
      if (!player.paused()) {
        closeMenuRef.current();
      }
    });

    // Handle watch progress saving
    const saveProgress = (immediate = false) => {
      if (!mediaId) return;
      const cur = player.currentTime();
      const dur = player.duration();
      if (!cur || isNaN(cur) || cur < 5) return;
      // Do not save if near the very end (last 30s)
      if (dur && !isNaN(dur) && cur > dur - 30) {
        removeWatchProgress(mediaId);
        return;
      }
      const meta = metaRef.current;
      saveWatchProgress(mediaId, {
        time: Math.floor(cur),
        duration: Math.floor(dur || 0),
        updated: Date.now(),
        title: meta.title,
        poster: meta.poster,
        mediaType: meta.mediaType,
        tmdbId: meta.tmdbId,
        season: meta.season,
        episode: meta.episode,
      }, { immediate });
    };

    let lastSave = 0;
    const onTimeUpdate = () => {
      const now = Date.now();
      if (now - lastSave > 2500) {
        lastSave = now;
        saveProgress(false);
      }

      const dur = player.duration() || 0;
      if (dur > 0 && dur !== duration) {
        setDuration(dur);
      }

      const cur = player.currentTime();
      if (cur < lastCurTimeRef.current - 3) {
        skippedSegmentsRef.current.clear();
        dismissedSegmentsRef.current.clear();
      }
      lastCurTimeRef.current = cur;

      // Force hide skip button if the segment it was displayed for has ended or playback moved outside it
      if (showSkipButtonRef.current && !isClosingSkipButtonRef.current && displaySegmentRef.current) {
        const segEnd = displaySegmentRef.current.endSec !== null ? displaySegmentRef.current.endSec : dur;
        const segStart = displaySegmentRef.current.startSec || 0;
        if (cur >= segEnd || cur < segStart - 1) {
          dismissSkipButtonRef.current(false);
        }
      }

      if (segmentsRef.current.length > 0) {
        const match = segmentsRef.current.find((s) => {
          const start = s.startSec;
          const end = s.endSec !== null ? s.endSec : dur;
          return cur >= start && cur < end;
        });

        if (match) {
          const segKey = `${match.type}_${match.startSec}_${match.endSec}`;
          const action = segmentSettingsRef.current[match.type] || 'manual';

          if (action === 'off' || action === 'timeline') {
            setActiveSegment(null);
            activeSegmentKeyRef.current = null;
            if (showSkipButtonRef.current && !isClosingSkipButtonRef.current) {
              dismissSkipButtonRef.current(false);
            }
          } else if (action === 'auto') {
            if (!skippedSegmentsRef.current.has(segKey)) {
              skippedSegmentsRef.current.add(segKey);
              const targetTime = match.endSec !== null ? match.endSec : Math.max(0, dur - 1);
              player.currentTime(targetTime);

              setSkipNotice({ label: match.label, from: cur, to: targetTime, key: segKey });
              if (skipNoticeTimeoutRef.current) clearTimeout(skipNoticeTimeoutRef.current);
              skipNoticeTimeoutRef.current = setTimeout(() => {
                setSkipNotice(null);
              }, 4500);
            }
            setActiveSegment(null);
            activeSegmentKeyRef.current = null;
            dismissSkipButtonRef.current(true);
          } else {
            // action === 'manual' (default)
            setActiveSegment(match);
            if (!dismissedSegmentsRef.current.has(segKey)) {
              dismissedSegmentsRef.current.add(segKey);
              activeSegmentKeyRef.current = segKey;
              displaySegmentRef.current = match;
              setDisplaySegment(match);
              if (closeSkipTimeoutRef.current) {
                clearTimeout(closeSkipTimeoutRef.current);
                closeSkipTimeoutRef.current = null;
              }
              isClosingSkipButtonRef.current = false;
              setIsClosingSkipButton(false);
              showSkipButtonRef.current = true;
              setShowSkipButton(true);
              setSkipButtonKey(Date.now());

              if (skipBtnTimeoutRef.current) clearTimeout(skipBtnTimeoutRef.current);
              skipBtnTimeoutRef.current = setTimeout(() => {
                dismissSkipButtonRef.current(false);
              }, 10000);
            }
          }
        } else {
          setActiveSegment(null);
          activeSegmentKeyRef.current = null;
          if (showSkipButtonRef.current && !isClosingSkipButtonRef.current) {
            dismissSkipButtonRef.current(false);
          }
        }
      } else {
        setActiveSegment(null);
        activeSegmentKeyRef.current = null;
        if (showSkipButtonRef.current && !isClosingSkipButtonRef.current) {
          dismissSkipButtonRef.current(false);
        }
      }
    };

    player.on('timeupdate', onTimeUpdate);
    player.on('pause', () => saveProgress(true));
    player.on('seeked', () => saveProgress(true));
    player.on('ended', () => {
      if (mediaId) {
        removeWatchProgress(mediaId);
      }
      // If next episode is available, trigger auto-next countdown
      if (hasNextEpisodeRef.current && onNextEpisodeRef.current) {
        setNextCountdown(5);
      }
    });

    const onPageLeave = () => {
      saveProgress(true);
      flushWatchProgress();
    };
    window.addEventListener('beforeunload', onPageLeave);
    window.addEventListener('pagehide', onPageLeave);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveProgress(true);
        flushWatchProgress();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Restore saved playback position or audio-switch position
    const onLoadedMetadata = () => {
      const dur = player.duration() || 0;
      if (dur > 0) setDuration(dur);
      const holder = player.el()?.querySelector('.vjs-progress-holder');
      if (holder) setProgressHolderEl(holder);

      let targetTime = null;
      if (typeof restoreTimeRef.current === 'number' && restoreTimeRef.current > 0) {
        targetTime = restoreTimeRef.current;
        restoreTimeRef.current = null;
      } else if (mediaId) {
        try {
          const store = getLocalWatchProgress();
          const saved = store[mediaId];
          if (saved && typeof saved.time === 'number' && saved.time > 5) {
            targetTime = saved.time;
          }
        } catch {}
      }

      if (targetTime !== null && targetTime > 0) {
        try {
          player.currentTime(targetTime);
        } catch {}
      }

      if (shouldResumePlayRef.current) {
        shouldResumePlayRef.current = false;
        const startPlayback = () => {
          const promise = player.play();
          if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {
              // Браузер міг відмовити до готовності даних — пробуємо ще раз
              player.one('canplay', () => player.play().catch(() => {}));
            });
          }
        };
        startPlayback();
      }
    };

    player.on('loadedmetadata', onLoadedMetadata);

    // Auto-switch to next audio track / source once if current source fails
    const failedSources = new Set();
    let lastSwitchTime = 0;

    const switchToNextSource = () => {
      const now = Date.now();
      if (now - lastSwitchTime < 3000) return;

      const curId = selectedSourceRef.current?.id || selectedSourceRef.current?.url;
      if (curId) failedSources.add(curId);

      const sameProviderSources = (sourcesRef.current || []).filter(
        (s) => s.provider?.id && s.provider.id === selectedSourceRef.current?.provider?.id
      );
      let untried = sameProviderSources.filter((s) => !failedSources.has(s.id || s.url));

      // If all tracks for this provider failed, try other available providers
      if (untried.length === 0) {
        untried = (sourcesRef.current || []).filter((s) => !failedSources.has(s.id || s.url));
      }

      if (untried.length > 0 && onSourceChangeRef.current) {
        lastSwitchTime = now;
        const nextSource = untried[0];
        console.warn('[VideoPlayer] Auto-switching to alternative source:', nextSource.title || nextSource.studio?.name || nextSource.provider?.name);
        try {
          player.error(null);
        } catch {}
        onSourceChangeRef.current(nextSource);
      } else {
        console.warn('[VideoPlayer] All available sources for all providers failed.');
      }
    };

    let lastDecodeRecoveryTime = 0;
    let decodeRecoveryCount = 0;

    const onError = () => {
      const err = player.error();
      if (!err) return;
      console.warn('[VideoPlayer] Playback error encountered:', err);

      const cur = player.currentTime() || 0;
      const now = Date.now();

      // CODE 3: MEDIA_ERR_DECODE - corrupt frame or timestamp discontinuity in stream
      // Recover by skipping 3 seconds past the bad packet/frame instead of aborting playback
      if (err.code === 3 && (now - lastDecodeRecoveryTime > 8000 || decodeRecoveryCount < 2)) {
        lastDecodeRecoveryTime = now;
        decodeRecoveryCount++;
        const skipPastTime = Math.min((player.duration() || cur + 10) - 1, cur + 3);
        console.warn(`[VideoPlayer] MEDIA_ERR_DECODE at ${cur.toFixed(2)}s: recovering by skipping bad frame to ${skipPastTime.toFixed(2)}s`);

        try {
          player.error(null);
        } catch {}

        const currentSrc = player.currentSource();
        if (currentSrc) {
          restoreTimeRef.current = skipPastTime;
          shouldResumePlayRef.current = true;
          player.src(currentSrc);
        } else {
          player.currentTime(skipPastTime);
          player.play().catch(() => {});
        }
        return;
      }

      decodeRecoveryCount = 0;
      restoreTimeRef.current = cur > 0 ? cur + 3 : null;
      switchToNextSource();
    };

    player.on('error', onError);

    return () => {
      window.removeEventListener('beforeunload', onPageLeave);
      window.removeEventListener('pagehide', onPageLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (skipBtnTimeoutRef.current) clearTimeout(skipBtnTimeoutRef.current);
      if (closeSkipTimeoutRef.current) clearTimeout(closeSkipTimeoutRef.current);
      if (skipNoticeTimeoutRef.current) clearTimeout(skipNoticeTimeoutRef.current);
      if (nextCountdownTimerRef.current) clearInterval(nextCountdownTimerRef.current);
      playerEl?.removeEventListener('mouseleave', onPlayerMouseLeave);
      saveProgress(true);
      flushWatchProgress();
      setPlayerContainerEl(null);
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  // Update Next Episode button visibility dynamically
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const nextBtn = player.controlBar?.getChild('BeerNextButton');
    if (nextBtn) {
      if (hasNextEpisode) {
        nextBtn.show();
      } else {
        nextBtn.hide();
      }
    }
  }, [hasNextEpisode]);

  // Handle auto-next episode countdown timer
  useEffect(() => {
    if (nextCountdown === null) return;

    if (nextCountdown <= 0) {
      setNextCountdown(null);
      if (onNextEpisodeRef.current) {
        onNextEpisodeRef.current();
      }
      return;
    }

    nextCountdownTimerRef.current = setTimeout(() => {
      setNextCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => {
      if (nextCountdownTimerRef.current) {
        clearTimeout(nextCountdownTimerRef.current);
      }
    };
  }, [nextCountdown]);

  // Close settings menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (Date.now() - openTimeRef.current < 250) return;
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
    document.addEventListener('touchstart', handleOutsideClick, { passive: true });
    return () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  // Актуальний стан меню для обробників поза React (mouseleave плеєра)
  useEffect(() => {
    renderedMenuRef.current = renderedMenu;
  }, [renderedMenu]);

  // Keep controls and player active while settings menu is open
  useEffect(() => {
    if (!renderedMenu || !playerRef.current) return;
    playerRef.current.userActive(true);
    const interval = setInterval(() => {
      if (playerRef.current) {
        playerRef.current.userActive(true);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [renderedMenu]);

  // Update src dynamically without recreating player
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !src) return;

    // Джерело змінилось — старі нативні доріжки вже неактуальні
    setNativeAudioTracks([]);

    // Preserve playback position and playing state across src changes
    const curTime = player.currentTime();
    const wasPlaying = !player.paused();
    if (typeof curTime === 'number' && curTime > 0) {
      restoreTimeRef.current = curTime;
      shouldResumePlayRef.current = !player.paused();
    } else if (wasPlaying) {
      // Навіть без таймстампа не даємо плеєру стати на паузу після зміни джерела
      shouldResumePlayRef.current = true;
    }

    const mimeType = (type === 'hls' || src.includes('.m3u8') || src.includes('/master.m3u8'))
      ? 'application/x-mpegURL'
      : (type || 'application/x-mpegURL');

    player.src({
      src,
      type: mimeType,
    });

    // VHS сам почне відтворення, щойно джерело буде готове — без ручного Play
    player.autoplay(wasPlaying ? 'any' : false);

    if (poster) {
      player.poster(poster);
    }
  }, [src, type, poster]);

  // Повідомляємо батька, скільки нативних доріжок має поточне джерело
  useEffect(() => {
    if (onNativeAudioTracksChange) {
      onNativeAudioTracksChange(nativeAudioTracks.length);
    }
  }, [nativeAudioTracks.length, onNativeAudioTracksChange]);

  // Батько попросив увімкнути конкретний голос — робимо це нативно, без reload
  useEffect(() => {
    if (!desiredAudioLabel) return;
    const player = playerRef.current;
    const list = player?.audioTracks?.();
    if (!list || list.length < 2) return;

    const normalize = (value) => (value || '').trim().toLowerCase();
    const wanted = normalize(desiredAudioLabel);

    for (let i = 0; i < list.length; i++) {
      if (normalize(list[i].label) !== wanted || list[i].enabled) continue;

      for (let j = 0; j < list.length; j++) {
        list[j].enabled = j === i;
      }
      setNativeAudioTracks((prev) => prev.map((track, index) => ({ ...track, enabled: index === i })));
      break;
    }
  }, [desiredAudioLabel, nativeAudioTracks]);

  useEffect(() => {
    const player = playerRef.current;
    if (player && poster) {
      player.poster(poster);
    }
  }, [poster]);

  // Handle Quality selection
  const setQuality = (targetIndex) => {
    const player = playerRef.current;
    if (!player || !player.qualityLevels) return;
    const ql = player.qualityLevels();
    const preferred = selectedCodec || autoCodec;
    const enableForCodec = (level) => {
      const levelFamily = codecFamilyOf(level.playlist?.attributes?.CODECS || '');
      if (preferred) return !!levelFamily && levelFamily.id === preferred;
      return true;
    };

    if (targetIndex === -1) {
      for (let i = 0; i < ql.length; i++) {
        ql[i].enabled = enableForCodec(ql[i]);
      }
    } else {
      for (let i = 0; i < ql.length; i++) {
        ql[i].enabled = i === targetIndex;
      }
      // Обрана якість з іншого кодека — знімаємо фільтр, щоб не суперечити вибору
      if (selectedCodec) {
        const levelFamily = codecFamilyOf(ql[targetIndex]?.playlist?.attributes?.CODECS || '');
        if (!levelFamily || levelFamily.id !== selectedCodec) {
          setSelectedCodec(null);
        }
      }
    }
    setSelectedQuality(targetIndex);
    closeMenu();
  };

  // Handle Codec selection: Auto — найкращий підтримуваний за пріоритетом, інакше лише обрана родина
  const applyCodec = (option) => {
    const player = playerRef.current;
    if (!player || !player.qualityLevels) return;
    const ql = player.qualityLevels();
    const target = option?.id || null;
    const preferred = target || autoCodec;

    for (let i = 0; i < ql.length; i++) {
      const levelFamily = codecFamilyOf(ql[i].playlist?.attributes?.CODECS || '');
      if (preferred) {
        ql[i].enabled = !!levelFamily && levelFamily.id === preferred;
      } else {
        ql[i].enabled = true;
      }
    }

    if (target && selectedQuality !== -1) {
      setSelectedQuality(-1); // Auto-якість усередині обраного кодека
    }
    setSelectedCodec(target);
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

  // Перемикання нативної аудіодоріжки без перезавантаження джерела
  const selectNativeAudioTrack = (index, { silent = false } = {}) => {
    const player = playerRef.current;
    const list = player?.audioTracks?.();
    if (!list) return;

    for (let i = 0; i < list.length; i++) {
      list[i].enabled = i === index;
    }
    setNativeAudioTracks((prev) => prev.map((track, i) => ({ ...track, enabled: i === index })));

    const label = list[index]?.label || list[index]?.language;
    if (label && onAudioTrackChange) {
      onAudioTrackChange(label);
    }
    if (!silent) closeMenu();
  };

  const activeNativeAudioLabel = nativeAudioTracks.find((track) => track.enabled)?.label || null;

  // Підрахунок доступних озвучок для поточного провайдера
  const currentProviderId = selectedSource?.provider?.id;
  const allSources = sources && sources.length > 0 ? sources : [selectedSource].filter(Boolean);
  const providerSources = currentProviderId
    ? allSources.filter((s) => s.provider?.id === currentProviderId)
    : allSources;
  const audioList = providerSources.length > 0 ? providerSources : allSources;
  const uniqueAudioCount = new Set(
    audioList.map((s) => `${s.studio?.name || s.audioTracks?.[0] || ''}:${s.url}`)
  ).size;

  return (
    <div className="player-wrapper">
      <div data-vjs-player style={{ width: '100%', height: '100%' }}>
        <video ref={videoNode} className="video-js vjs-default-skin" playsInline />
      </div>

      {/* SponsorBlock / TheIntroDB Segment Markers on Progress Bar */}
      {progressHolderEl && duration > 0 && segments.length > 0 && createPortal(
        <div className="vjs-segments-bar">
          {segments
            .filter((seg) => (segmentSettings[seg.type] || 'manual') !== 'off')
            .map((seg, idx) => {
              const startPct = Math.max(0, Math.min(100, (seg.startSec / duration) * 100));
              const endSec = seg.endSec !== null ? seg.endSec : duration;
              const endPct = Math.max(0, Math.min(100, (endSec / duration) * 100));
              const widthPct = Math.max(0.4, endPct - startPct);
              return (
                <div
                  key={idx}
                  className={`vjs-segment-marker vjs-segment-${seg.type}`}
                  style={{
                    left: `${startPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: seg.color,
                  }}
                />
              );
            })}
        </div>,
        progressHolderEl
      )}

      {(() => {
        const floatingOverlays = (
          <>
            {/* Auto-next episode countdown card */}
            {nextCountdown !== null && (
              <div
                className="vjs-next-countdown-card"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="vjs-next-countdown-header">
                  <div className="vjs-next-countdown-tag">
                    <i className="material-symbols-rounded">skip_next</i>
                    <span>Наступна серія</span>
                  </div>
                  <span className="vjs-next-badge">{nextCountdown} с</span>
                </div>
                <div className="vjs-next-countdown-content">
                  <div className="vjs-next-countdown-title">
                    {nextEpisodeLabel || 'Наступний епізод'}
                  </div>
                  {title && (
                    <div className="vjs-next-countdown-label">
                      {title}
                    </div>
                  )}
                </div>
                <div className="vjs-next-countdown-actions">
                  <button
                    type="button"
                    className="vjs-next-btn-cancel"
                    onClick={() => {
                      if (nextCountdownTimerRef.current) {
                        clearTimeout(nextCountdownTimerRef.current);
                      }
                      setNextCountdown(null);
                    }}
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    className="vjs-next-btn-play"
                    onClick={() => {
                      if (nextCountdownTimerRef.current) {
                        clearTimeout(nextCountdownTimerRef.current);
                      }
                      setNextCountdown(null);
                      if (onNextEpisodeRef.current) {
                        onNextEpisodeRef.current();
                      }
                    }}
                  >
                    <i className="material-symbols-rounded">play_arrow</i>
                    <span>Зараз</span>
                  </button>
                </div>
                <div className="vjs-next-progress-track">
                  <div
                    className="vjs-next-progress-bar"
                    style={{ animationDuration: '5s' }}
                  />
                </div>
              </div>
            )}

            {/* Floating Skip Segment Button (hides after 10s, can also skip via Enter key) */}
      {showSkipButton && displaySegment && (
        <button
          key={skipButtonKey}
          type="button"
          className={`vjs-skip-segment-btn ${isClosingSkipButton ? 'closing' : ''}`}
          style={{
            backgroundColor: '#14151a',
            borderRadius: '9999px',
            padding: '10px 22px 12px 20px',
            gap: '10px',
            border: '1px solid rgba(255, 255, 255, 0.22)',
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.8)',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            minWidth: 'max-content',
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (!playerRef.current || !displaySegment) return;
            const dur = playerRef.current.duration() || 0;
            const targetTime = displaySegment.endSec !== null ? displaySegment.endSec : Math.max(0, dur - 1);
            playerRef.current.currentTime(targetTime);
            setActiveSegment(null);
            dismissSkipButton(false);
          }}
        >
          <i className="material-symbols-rounded">fast_forward</i>
          <span>Пропустити {displaySegment.label}</span>
          <kbd className="vjs-skip-kbd">Enter</kbd>

          {/* Countdown progress indicator at bottom of button */}
          <div
            className="vjs-skip-progress-track"
            style={{
              borderBottomLeftRadius: '9999px',
              borderBottomRightRadius: '9999px',
              overflow: 'hidden',
            }}
          >
            <div
              className="vjs-skip-progress-bar"
              style={{
                borderBottomLeftRadius: '9999px',
                borderBottomRightRadius: '9999px',
              }}
            />
          </div>
        </button>
      )}

      {/* Auto-skip Undo Toast */}
      {skipNotice && (
        <div className="vjs-skip-notice" onClick={(e) => e.stopPropagation()}>
          <div className="vjs-skip-notice-text">
            <i className="material-symbols-rounded">fast_forward</i>
            <span>Пропущено: {skipNotice.label}</span>
          </div>
          <button
            type="button"
            className="vjs-skip-notice-undo"
            onClick={(e) => {
              e.stopPropagation();
              if (!playerRef.current || !skipNotice) return;
              playerRef.current.currentTime(skipNotice.from);
              if (skipNotice.key) {
                skippedSegmentsRef.current.add(skipNotice.key);
              }
              setSkipNotice(null);
            }}
          >
            Скасувати
          </button>
        </div>
      )}

      {/* BeerCSS M3 Settings Menu */}
      {renderedMenu && (
        <div
          className={`vjs-settings-menu ${isClosing ? 'vjs-menu-closing' : 'vjs-menu-open'}`}
          onClick={(e) => e.stopPropagation()}
          onMouseMove={() => playerRef.current?.reportUserActivity()}
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
                    {selectedSource?.studio?.logoUrl && (
                      <img
                        src={selectedSource.studio.logoUrl}
                        alt=""
                        className="vjs-studio-logo-sm"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    <span style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {activeNativeAudioLabel || selectedSource?.studio?.name || selectedSource?.audioTracks?.[0] || 'За замовчуванням'}
                    </span>
                  </div>
                </div>
              )}

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
                {nativeAudioTracks.length > 1 ? (
                  nativeAudioTracks.map((track, trackIndex) => (
                    <div
                      key={`${track.label}-${trackIndex}`}
                      className={`vjs-submenu-option vjs-audio-option ${track.enabled ? 'selected' : ''}`}
                      onClick={() => selectNativeAudioTrack(trackIndex)}
                    >
                      <div className="vjs-audio-text-group">
                        <span className="vjs-audio-title">{track.label}</span>
                        {track.language && (
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
                          const voiceLabel = (srcOption.studio?.name || srcOption.audioTracks?.[0] || '').trim().toLowerCase();
                          const nativeIndex = nativeAudioTracks.findIndex(
                            (track) => (track.label || '').trim().toLowerCase() === voiceLabel
                          );
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

          {renderedMenu === 'codec' && (
            <div className={`vjs-menu-page ${navDirection === 'back' ? 'vjs-page-back' : ''}`}>
              <div className="vjs-submenu-header" onClick={() => switchMenu('main', 'back')}>
                <i className="material-symbols-rounded">arrow_back</i>
                <span>Кодек відео</span>
              </div>
              <div className="vjs-submenu-scroll">
                <div
                  className={`vjs-submenu-option ${selectedCodec === null ? 'selected' : ''}`}
                  onClick={() => applyCodec(null)}
                >
                  {autoCodec
                    ? `Auto · ${codecOptions.find((option) => option.id === autoCodec)?.label || ''}`.trim()
                    : 'Auto'}
                </div>
                {codecOptions.map((option) => (
                  <div
                    key={option.id}
                    className={`vjs-submenu-option ${selectedCodec === option.id ? 'selected' : ''}`}
                    style={option.supported ? undefined : { opacity: 0.45, pointerEvents: 'none' }}
                    onClick={() => option.supported && applyCodec(option)}
                  >
                    {option.label}
                    {option.maxHeight > 0 ? ` · ${option.maxHeight}p` : ''}
                    {option.supported ? '' : ' (не підтримується)'}
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
      </>
    );
    return playerContainerEl ? createPortal(floatingOverlays, playerContainerEl) : floatingOverlays;
  })()}
    </div>
  );
}

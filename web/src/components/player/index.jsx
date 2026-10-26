import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'videojs-hotkeys';
import 'videojs-mobile-ui';
import 'videojs-mobile-ui/dist/videojs-mobile-ui.css';
import './player-style.css';

import { saveWatchProgress, removeWatchProgress, getLocalWatchProgress, flushWatchProgress } from '../../utils/sync.js';
import {
  codecPriorityOf,
  codecFamilyOf,
  isCodecSupported,
  isGenericAudioLabel,
  normalizeStudioLabel,
  snapHeight,
  buildStudioLogoMap,
} from './utils/codec.js';
import { isIPadOrIOS, patchFullscreen, patchVttTimeMapping } from './utils/playerPatches.js';
import { registerPlayerButtons } from './utils/registerButtons.js';

import { useJassub } from './hooks/useJassub.js';
import { useSegments } from './hooks/useSegments.js';
import { usePlayerMenu } from './hooks/usePlayerMenu.js';

import SegmentsBar from './controls/SegmentsBar.jsx';
import NextCountdownCard from './controls/NextCountdownCard.jsx';
import SkipSegmentButton from './controls/SkipSegmentButton.jsx';
import SettingsMenu from './controls/settings/index.jsx';

export default function VideoPlayer({
  src,
  type = 'application/x-mpegURL',
  poster,
  title = '',
  subtitles = [],
  // Стилізовані (ASS) субтитри — рендерить JASSUB/libass поверх відео
  styledSubtitles = [],
  sources = [],
  selectedSource = null,
  onSourceChange = null,
  onAudioTrackChange = null,
  // Голос, який треба увімкнути нативно (Fenix: одне відео, кілька доріжок)
  desiredAudioLabel = null,
  // Скільки нативних доріжок зараз у плеєрі
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

  const [qualities, setQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(-1); // -1 = Auto
  const [nativeAudioTracks, setNativeAudioTracks] = useState([]);
  const sourceAudioLabelsRef = useRef([]);
  sourceAudioLabelsRef.current = Array.isArray(selectedSource?.audioTracks) ? selectedSource.audioTracks : [];
  const [codecOptions, setCodecOptions] = useState([]);
  const [selectedCodec, setSelectedCodec] = useState(null); // null = Auto
  const [autoCodec, setAutoCodec] = useState(null);
  const selectedCodecRef = useRef(null);
  const selectedQualityRef = useRef(-1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [textTracksList, setTextTracksList] = useState([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(-1); // -1 = Off

  const [playerContainerEl, setPlayerContainerEl] = useState(null);
  const [duration, setDuration] = useState(0);
  const [progressHolderEl, setProgressHolderEl] = useState(null);

  const pointerOutsideRef = useRef(false);
  const sourcesRef = useRef(sources);
  const selectedSourceRef = useRef(selectedSource);
  selectedCodecRef.current = selectedCodec;
  selectedQualityRef.current = selectedQuality;
  const onSourceChangeRef = useRef(onSourceChange);
  const metaRef = useRef({ title, poster, mediaType, tmdbId, season, episode });

  useEffect(() => {
    metaRef.current = { title, poster, mediaType, tmdbId, season, episode };
  }, [title, poster, mediaType, tmdbId, season, episode]);

  useEffect(() => {
    sourcesRef.current = sources;
    selectedSourceRef.current = selectedSource;
    onSourceChangeRef.current = onSourceChange;
  }, [sources, selectedSource, onSourceChange]);

  // Hook: JASSUB styled subtitles
  const {
    styledTracks,
    activeStyledUrl,
    setStyledSubtitleTrack,
  } = useJassub({
    styledSubtitles,
    src,
    playerRef,
    setSelectedTrackIndex,
  });

  // Hook: Player Settings Menu
  const {
    activeMenuRef,
    renderedMenu,
    renderedMenuRef,
    isClosing,
    navDirection,
    settingsMenuRef,
    openMenu,
    switchMenu,
    closeMenu,
    closeMenuRef,
  } = usePlayerMenu(playerRef);

  // Hook: SponsorBlock / Segments skipping
  const {
    segments,
    segmentSettings,
    showSkipButton,
    isClosingSkipButton,
    displaySegment,
    skipButtonKey,
    skipNotice,
    setSkipNotice,
    dismissSkipButton,
    onSegmentTimeUpdate,
    handleSkipCurrentSegment,
    handleUndoSkip,
    cleanupSegments,
  } = useSegments({
    tmdbId,
    imdbId,
    mediaType,
    season,
    episode,
    title,
    duration,
    playerRef,
  });

  useEffect(() => {
    if (!videoNode.current) return;

    registerPlayerButtons();

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
          enableLowInitialPlaylist: false,
          smoothQualityChange: true,
          limitRenditionByPlayerDimensions: false,
          useNetworkInformationApi: true,
          useBandwidthFromLocalStorage: false,
          bandwidth: 25000000,
        },
        nativeVideoTracks: false,
        nativeAudioTracks: false,
        nativeTextTracks: false,
      },
    });

    playerRef.current = player;
    patchFullscreen(player, videoNode);

    player.ready(() => {
      setPlayerContainerEl(player.el());
      const holder = player.el()?.querySelector('.vjs-progress-holder');
      if (holder) setProgressHolderEl(holder);
    });

    const mimeType = (type === 'hls' || src?.includes('.m3u8') || src?.includes('/master.m3u8'))
      ? 'application/x-mpegURL'
      : (type === 'mp4' ? 'video/mp4' : (type || 'application/x-mpegURL'));

    if (src) {
      player.src({ src, type: mimeType });
    }

    const syncNativeAudioTracks = () => {
      try {
        const list = player.audioTracks?.();
        if (!list) return;
        const fallbackLabels = sourceAudioLabelsRef.current || [];
        const tracks = [];
        for (let i = 0; i < list.length; i++) {
          const track = list[i];
          const label = isGenericAudioLabel(track.label) ? null : track.label;
          tracks.push({
            label: label || fallbackLabels[i] || track.language || `Доріжка ${i + 1}`,
            language: track.language || '',
            enabled: track.enabled !== false,
          });
        }
        setNativeAudioTracks(tracks);
      } catch {}
    };

    player.on('loadedmetadata', syncNativeAudioTracks);
    player.on('loadedplaylist', syncNativeAudioTracks);
    const audioTrackList = player.audioTracks?.();
    if (audioTrackList?.addEventListener) {
      audioTrackList.addEventListener('addtrack', syncNativeAudioTracks);
      audioTrackList.addEventListener('change', syncNativeAudioTracks);
    }

    if (typeof player.hotkeys === 'function') {
      player.hotkeys({
        volumeStep: 0.1,
        seekStep: 5,
        enableModifiersForNumbers: false,
      });
    }

    if (typeof player.mobileUi === 'function') {
      player.mobileUi({
        touchControls: { seekSeconds: 10, tapTimeout: 300, disableOnEnd: false },
        fullscreen: isIPadOrIOS
          ? { enterOnRotate: false, exitOnRotate: false, lockOnRotate: false }
          : { enterOnRotate: true, lockOnRotate: true },
      });
    }

    const playerEl = player.el();
    const suppressUserActiveOutside = () => {
      if (renderedMenuRef.current) return;
      if (player.userActivity_) player.userActivity_ = false;
      if (player.userActive()) player.userActive(false);
    };
    const onPlayerPointerInside = () => {
      pointerOutsideRef.current = false;
    };
    const onPlayerMouseLeave = () => {
      pointerOutsideRef.current = true;
      if (renderedMenuRef.current || player.paused()) return;
      suppressUserActiveOutside();
    };
    const onUserActiveWhileOutside = () => {
      if (!pointerOutsideRef.current) return;
      suppressUserActiveOutside();
    };
    playerEl?.addEventListener('mouseenter', onPlayerPointerInside);
    playerEl?.addEventListener('mousemove', onPlayerPointerInside);
    playerEl?.addEventListener('mouseleave', onPlayerMouseLeave);
    player.on('useractive', onUserActiveWhileOutside);

    player.on('loadstart', () => patchVttTimeMapping(player));
    player.on('loadedmetadata', () => patchVttTimeMapping(player));
    patchVttTimeMapping(player);

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

    if (player.qualityLevels) {
      const ql = player.qualityLevels();
      const updateQl = () => {
        const seen = new Set();
        const list = [];
        const families = new Map();
        for (let i = 0; i < ql.length; i++) {
          const level = ql[i];
          const levelCodecs = level.playlist?.attributes?.CODECS || '';
          const rawHeight = level.height || (level.playlist?.attributes?.RESOLUTION?.height) || 0;
          const rawWidth = level.width || (level.playlist?.attributes?.RESOLUTION?.width) || 0;
          const height = rawHeight > 0 || rawWidth > 0 ? snapHeight(rawHeight, rawWidth) : 0;
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
        setCodecOptions(options.length > 1 ? options : []);

        const preferred = options.find((option) => option.supported) || options[0] || null;
        setAutoCodec(preferred ? preferred.id : null);

        if (selectedQualityRef.current === -1) {
          const explicitCodec = selectedCodecRef.current;
          for (let i = 0; i < ql.length; i++) {
            const levelCodecs = ql[i].playlist?.attributes?.CODECS || '';
            const levelFamily = codecFamilyOf(levelCodecs);
            if (explicitCodec) {
              ql[i].enabled = !!levelFamily && levelFamily.id === explicitCodec;
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

    player.on('play', () => closeMenuRef.current());
    player.on('userinactive', () => {
      if (!player.paused()) {
        closeMenuRef.current();
      }
    });

    const saveProgress = (immediate = false) => {
      if (!mediaId) return;
      const cur = player.currentTime();
      const dur = player.duration();
      if (!cur || isNaN(cur) || cur < 5) return;
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
      onSegmentTimeUpdate(cur, dur, player);
    };

    player.on('timeupdate', onTimeUpdate);
    player.on('pause', () => saveProgress(true));
    player.on('seeked', () => saveProgress(true));
    player.on('ended', () => {
      if (mediaId) {
        removeWatchProgress(mediaId);
      }
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
              player.one('canplay', () => player.play().catch(() => {}));
            });
          }
        };
        startPlayback();
      }
    };

    player.on('loadedmetadata', onLoadedMetadata);

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
      cleanupSegments();
      if (nextCountdownTimerRef.current) clearInterval(nextCountdownTimerRef.current);
      playerEl?.removeEventListener('mouseenter', onPlayerPointerInside);
      playerEl?.removeEventListener('mousemove', onPlayerPointerInside);
      playerEl?.removeEventListener('mouseleave', onPlayerMouseLeave);
      player.off('useractive', onUserActiveWhileOutside);
      saveProgress(true);
      flushWatchProgress();
      setPlayerContainerEl(null);
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []);

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

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !src) return;

    setNativeAudioTracks([]);

    const curTime = player.currentTime();
    const wasPlaying = !player.paused();
    if (typeof curTime === 'number' && curTime > 0) {
      restoreTimeRef.current = curTime;
      shouldResumePlayRef.current = !player.paused();
    } else if (wasPlaying) {
      shouldResumePlayRef.current = true;
    }

    const mimeType = (type === 'hls' || src.includes('.m3u8') || src.includes('/master.m3u8'))
      ? 'application/x-mpegURL'
      : (type === 'mp4' ? 'video/mp4' : (type || 'application/x-mpegURL'));

    player.src({
      src,
      type: mimeType,
    });

    player.autoplay(wasPlaying ? 'any' : false);

    if (poster) {
      player.poster(poster);
    }
  }, [src, type, poster]);

  useEffect(() => {
    if (onNativeAudioTracksChange) {
      onNativeAudioTracksChange(nativeAudioTracks.length);
    }
  }, [nativeAudioTracks.length, onNativeAudioTracksChange]);

  useEffect(() => {
    if (!desiredAudioLabel) return;
    const player = playerRef.current;
    const list = player?.audioTracks?.();
    if (!list || list.length < 2) return;

    const normalize = normalizeStudioLabel;
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

  const setQuality = (targetIndex) => {
    const player = playerRef.current;
    if (!player || !player.qualityLevels) return;
    const ql = player.qualityLevels();
    const explicitCodec = selectedCodec;

    if (targetIndex === -1) {
      for (let i = 0; i < ql.length; i++) {
        if (explicitCodec) {
          const levelFamily = codecFamilyOf(ql[i].playlist?.attributes?.CODECS || '');
          ql[i].enabled = !!levelFamily && levelFamily.id === explicitCodec;
        } else {
          ql[i].enabled = true;
        }
      }
    } else {
      for (let i = 0; i < ql.length; i++) {
        ql[i].enabled = i === targetIndex;
      }
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
      setSelectedQuality(-1);
    }
    setSelectedCodec(target);
    closeMenu();
  };

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
    setStyledSubtitleTrack(null);
    try {
      const label = targetIndex === -1
        ? '__off__'
        : textTracksList.find((t) => t.index === targetIndex)?.label || '__off__';
      localStorage.setItem('uafilms_pref_subs', label);
    } catch {}
    closeMenu();
  };

  const setRate = (rate) => {
    const player = playerRef.current;
    if (player) {
      player.playbackRate(rate);
      setPlaybackRate(rate);
    }
    closeMenu();
  };

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
  const meaningfulNativeAudioLabel = activeNativeAudioLabel && !isGenericAudioLabel(activeNativeAudioLabel)
    ? activeNativeAudioLabel
    : null;

  const displayAudioLabel =
    meaningfulNativeAudioLabel ||
    selectedSource?.studio?.name ||
    (selectedSource?.audioTracks || []).find((label) => !isGenericAudioLabel(label)) ||
    'За замовчуванням';

  const currentProviderId = selectedSource?.provider?.id;
  const allSources = sources && sources.length > 0 ? sources : [selectedSource].filter(Boolean);
  const providerSources = currentProviderId
    ? allSources.filter((s) => s.provider?.id === currentProviderId)
    : allSources;
  const audioList = providerSources.length > 0 ? providerSources : allSources;
  const uniqueAudioCount = new Set(
    audioList.map((s) => `${s.studio?.name || s.audioTracks?.[0] || ''}:${s.url}`)
  ).size;

  const studioLogoByLabel = buildStudioLogoMap(allSources);
  const displayAudioLogo =
    studioLogoByLabel.get(normalizeStudioLabel(displayAudioLabel)) ||
    (meaningfulNativeAudioLabel ? null : selectedSource?.studio?.logoUrl) ||
    null;

  return (
    <div className="player-wrapper">
      <div data-vjs-player style={{ width: '100%', height: '100%' }}>
        <video ref={videoNode} className="video-js vjs-default-skin" playsInline />
      </div>

      <SegmentsBar
        progressHolderEl={progressHolderEl}
        duration={duration}
        segments={segments}
        segmentSettings={segmentSettings}
      />

      {(() => {
        const floatingOverlays = (
          <>
            <NextCountdownCard
              nextCountdown={nextCountdown}
              nextEpisodeLabel={nextEpisodeLabel}
              title={title}
              onCancel={() => {
                if (nextCountdownTimerRef.current) {
                  clearTimeout(nextCountdownTimerRef.current);
                }
                setNextCountdown(null);
              }}
              onPlayNow={() => {
                if (nextCountdownTimerRef.current) {
                  clearTimeout(nextCountdownTimerRef.current);
                }
                setNextCountdown(null);
                if (onNextEpisodeRef.current) {
                  onNextEpisodeRef.current();
                }
              }}
            />

            <SkipSegmentButton
              showSkipButton={showSkipButton}
              displaySegment={displaySegment}
              skipButtonKey={skipButtonKey}
              isClosingSkipButton={isClosingSkipButton}
              onSkip={handleSkipCurrentSegment}
              skipNotice={skipNotice}
              onUndoSkip={handleUndoSkip}
            />

            <SettingsMenu
              renderedMenu={renderedMenu}
              isClosing={isClosing}
              navDirection={navDirection}
              settingsMenuRef={settingsMenuRef}
              playerRef={playerRef}
              switchMenu={switchMenu}
              closeMenu={closeMenu}
              selectedQuality={selectedQuality}
              qualities={qualities}
              setQuality={setQuality}
              codecOptions={codecOptions}
              selectedCodec={selectedCodec}
              autoCodec={autoCodec}
              applyCodec={applyCodec}
              uniqueAudioCount={uniqueAudioCount}
              nativeAudioTracks={nativeAudioTracks}
              displayAudioLogo={displayAudioLogo}
              displayAudioLabel={displayAudioLabel}
              selectNativeAudioTrack={selectNativeAudioTrack}
              studioLogoByLabel={studioLogoByLabel}
              sources={sources}
              selectedSource={selectedSource}
              onSourceChange={onSourceChange}
              textTracksList={textTracksList}
              styledTracks={styledTracks}
              activeStyledUrl={activeStyledUrl}
              selectedTrackIndex={selectedTrackIndex}
              setSubtitleTrack={setSubtitleTrack}
              setStyledSubtitleTrack={setStyledSubtitleTrack}
              playbackRate={playbackRate}
              setRate={setRate}
            />
          </>
        );

        return playerContainerEl ? createPortal(floatingOverlays, playerContainerEl) : floatingOverlays;
      })()}
    </div>
  );
}

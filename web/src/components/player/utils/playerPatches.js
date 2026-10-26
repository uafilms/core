export const isIPadOrIOS =
  (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent)) ||
  (typeof navigator !== 'undefined' &&
    navigator.platform === 'MacIntel' &&
    navigator.maxTouchPoints > 1);

export function patchFullscreen(player, videoNode) {
  const origRequestFullscreen = player.requestFullscreen.bind(player);
  player.requestFullscreen = function () {
    const v = videoNode.current || player.el()?.querySelector('video');

    if (isIPadOrIOS && v && typeof v.webkitEnterFullscreen === 'function') {
      try {
        v.webkitEnterFullscreen();
        return Promise.resolve();
      } catch (e) {
        console.warn('webkitEnterFullscreen error:', e);
      }
    }

    return origRequestFullscreen().catch((err) => {
      if (v && typeof v.webkitEnterFullscreen === 'function') {
        try {
          v.webkitEnterFullscreen();
          return Promise.resolve();
        } catch (e) {
          console.warn('webkitEnterFullscreen fallback error:', e);
        }
      }
      if (typeof player.enterFullWindow === 'function') {
        player.enterFullWindow();
      }
    });
  };

  const origExitFullscreen = player.exitFullscreen.bind(player);
  player.exitFullscreen = function () {
    const v = videoNode.current || player.el()?.querySelector('video');
    if (v && typeof v.webkitExitFullscreen === 'function') {
      try {
        v.webkitExitFullscreen();
      } catch {
        // Ignore
      }
    }
    return origExitFullscreen().catch(() => {
      if (typeof player.exitFullWindow === 'function') {
        player.exitFullWindow();
      }
    });
  };

  const videoEl = videoNode.current || player.el()?.querySelector('video');
  if (videoEl) {
    const onBeginFullscreen = () => {
      player.trigger('fullscreenchange');
    };
    const onEndFullscreen = () => {
      player.trigger('fullscreenchange');
    };
    videoEl.addEventListener('webkitbeginfullscreen', onBeginFullscreen);
    videoEl.addEventListener('webkitendfullscreen', onEndFullscreen);
    player.on('dispose', () => {
      videoEl.removeEventListener('webkitbeginfullscreen', onBeginFullscreen);
      videoEl.removeEventListener('webkitendfullscreen', onEndFullscreen);
    });
  }
}

export function patchVttTimeMapping(player) {
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
}

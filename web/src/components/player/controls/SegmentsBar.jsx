import React from 'react';
import { createPortal } from 'react-dom';

export default function SegmentsBar({ progressHolderEl, duration, segments, segmentSettings }) {
  if (!progressHolderEl || duration <= 0 || !segments || segments.length === 0) {
    return null;
  }

  return createPortal(
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
  );
}

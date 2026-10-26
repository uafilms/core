import React from 'react';
import { favoriteCdnRank, getSourceVoice } from '../utils/sources';

export default function SourceChips({
  type,
  season,
  episode,
  sources,
  selectedSource,
  setSelectedSource,
  loadingSources,
  findBestSource,
  savePreferences,
}) {
  // Group unique CDNs / providers
  const cdnMap = new Map();
  for (const s of sources) {
    const key = s.provider?.id || s.provider?.name || 'unknown';
    if (!cdnMap.has(key)) {
      cdnMap.set(key, s);
    }
  }
  const uniqueCdns = Array.from(cdnMap.values())
    .sort((a, b) => favoriteCdnRank(a) - favoriteCdnRank(b));

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <h6 style={{ fontWeight: 500, margin: 0 }}>
          Джерела {type === 'tv' && `(Сезон ${season}, Серія ${episode})`}
        </h6>
        {loadingSources && <progress className="circle small indeterminate"></progress>}
      </div>

      {uniqueCdns.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {uniqueCdns.map((src, index) => {
            const isSelected = selectedSource?.provider?.id === src.provider?.id;
            const isFavorite = favoriteCdnRank(src) !== Number.POSITIVE_INFINITY;
            return (
              <button
                key={src.provider?.id || index}
                className={`chip ${isSelected ? 'primary' : 'border surface-container-low'}`}
                onClick={() => {
                  if (selectedSource?.provider?.id !== src.provider?.id) {
                    const cdnSources = sources.filter((s) => s.provider?.id === src.provider?.id);
                    const best = findBestSource(cdnSources) || src;
                    setSelectedSource(best);
                    savePreferences(best.provider?.id, getSourceVoice(best));
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                {isFavorite && (
                  <span className="provider-favorite-star" title="Улюблений CDN" aria-label="Улюблений CDN">★</span>
                )}
                <span>{src.provider?.name || src.provider?.id}</span>
              </button>
            );
          })}
        </div>
      ) : (
        !loadingSources && (
          <div className="error-text" style={{ marginBottom: '16px' }}>
            Джерела не знайдені або недоступні
          </div>
        )
      )}
    </>
  );
}

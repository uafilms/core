import React from 'react';
import BetaBadge from './BetaBadge';

export default function HomeSearch({
  searchQuery,
  setSearchQuery,
  onSearchSubmit,
  history,
  onHistoryClick,
}) {
  return (
    <div style={{ padding: '24px 24px 8px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <h4 className="primary-text no-margin" style={{ fontWeight: 500 }}>
          UAFilms
        </h4>
        <BetaBadge />
      </div>

      <div className="field prefix round fill surface-container no-margin" style={{ width: '100%' }}>
        <i>search</i>
        <input
          type="text"
          placeholder="Що будемо дивитись?"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={onSearchSubmit}
        />
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div className="small-text surface-variant-text" style={{ marginBottom: '8px', marginLeft: '4px' }}>
            Історія пошуку:
          </div>
          <div className="row no-wrap" style={{ gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {history.map((item, index) => (
              <button
                key={index}
                className="chip border surface-container-low"
                onClick={() => onHistoryClick(item)}
                style={{ flexShrink: 0, cursor: 'pointer' }}
              >
                <span>{item}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

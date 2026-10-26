import React from 'react';
import Dropdown from '../../../components/Dropdown';

export default function TvNavigation({
  season,
  setSeason,
  episode,
  setEpisode,
  availableSeasons,
  availableEpisodes,
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span className="small-text surface-variant-text" style={{ fontWeight: 500 }}>Сезон</span>
        <Dropdown
          value={season}
          options={availableSeasons.map((s) => ({
            value: s.seasonNumber,
            label: s.name || `Сезон ${s.seasonNumber}`,
          }))}
          onChange={(s) => {
            setSeason(s);
            setEpisode(1);
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span className="small-text surface-variant-text" style={{ fontWeight: 500 }}>Серія</span>
        <Dropdown
          value={episode}
          options={availableEpisodes.map((e) => ({
            value: e,
            label: `Серія ${e}`,
          }))}
          onChange={(e) => setEpisode(e)}
        />
      </div>
    </div>
  );
}

import React from 'react';

export default function KpiCards({ totalRequests, activeKeysCount, last24h, successRate }) {
  return (
    <div className="grid" style={{ marginBottom: '24px' }}>
      <div className="s6 m3">
        <article className="surface-container round no-margin m3-interactive-card stagger-1" style={{ padding: '16px' }}>
          <div className="row middle-align" style={{ gap: '10px', marginBottom: '8px' }}>
            <i className="primary-text">swap_horiz</i>
            <span className="small-text surface-variant-text">Всього запитів</span>
          </div>
          <h5 style={{ margin: 0, fontWeight: 600 }}>{totalRequests.toLocaleString()}</h5>
        </article>
      </div>

      <div className="s6 m3">
        <article className="surface-container round no-margin m3-interactive-card stagger-2" style={{ padding: '16px' }}>
          <div className="row middle-align" style={{ gap: '10px', marginBottom: '8px' }}>
            <i className="secondary-text">vpn_key</i>
            <span className="small-text surface-variant-text">Активні ключі</span>
          </div>
          <h5 style={{ margin: 0, fontWeight: 600 }}>{activeKeysCount}</h5>
        </article>
      </div>

      <div className="s6 m3">
        <article className="surface-container round no-margin m3-interactive-card stagger-3" style={{ padding: '16px' }}>
          <div className="row middle-align" style={{ gap: '10px', marginBottom: '8px' }}>
            <i className="tertiary-text">today</i>
            <span className="small-text surface-variant-text">Сьогодні</span>
          </div>
          <h5 style={{ margin: 0, fontWeight: 600 }}>{last24h.toLocaleString()}</h5>
        </article>
      </div>

      <div className="s6 m3">
        <article className="surface-container round no-margin m3-interactive-card stagger-4" style={{ padding: '16px' }}>
          <div className="row middle-align" style={{ gap: '10px', marginBottom: '8px' }}>
            <i className="green-text" style={{ color: '#4caf50' }}>check_circle</i>
            <span className="small-text surface-variant-text">Успішність</span>
          </div>
          <h5 style={{ margin: 0, fontWeight: 600 }}>{successRate}%</h5>
        </article>
      </div>
    </div>
  );
}

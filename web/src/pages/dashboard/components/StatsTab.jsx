import React from 'react';

export default function StatsTab({ stats, totalRequests }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Endpoint breakdown */}
      <article className="surface-container round no-margin" style={{ padding: '20px' }}>
        <h6 style={{ margin: '0 0 16px 0', fontWeight: 500 }}>Використання за ендпоінтами</h6>
        {stats?.endpointBreakdown && stats.endpointBreakdown.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {stats.endpointBreakdown.map((ep) => {
              const pct = totalRequests > 0 ? Math.round((ep.count / totalRequests) * 100) : 0;
              return (
                <div key={ep.endpoint}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px' }}>
                    <code>{ep.endpoint}</code>
                    <span className="surface-variant-text">{ep.count.toLocaleString()} ({pct}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--surface-container-high)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)', borderRadius: '4px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="small-text surface-variant-text" style={{ margin: 0 }}>Дані відсутні</p>
        )}
      </article>

      {/* Daily activity */}
      <article className="surface-container round no-margin" style={{ padding: '20px' }}>
        <h6 style={{ margin: '0 0 16px 0', fontWeight: 500 }}>Активність за останні 7 днів</h6>
        {stats?.dailyActivity && stats.dailyActivity.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '140px', padding: '10px 0' }}>
            {stats.dailyActivity.map((d) => {
              const maxVal = Math.max(...stats.dailyActivity.map((item) => item.requests), 1);
              const heightPct = Math.max(Math.round((d.requests / maxVal) * 100), 8);
              return (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '6px' }}>
                  <span className="small-text" style={{ fontSize: '11px' }}>{d.requests}</span>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '36px',
                      height: `${heightPct}%`,
                      backgroundColor: 'var(--primary)',
                      borderRadius: '6px 6px 2px 2px',
                      transition: 'height 0.3s ease',
                    }}
                  />
                  <span className="small-text surface-variant-text" style={{ fontSize: '10px' }}>
                    {d.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="small-text surface-variant-text" style={{ margin: 0 }}>Дані відсутні</p>
        )}
      </article>
    </div>
  );
}

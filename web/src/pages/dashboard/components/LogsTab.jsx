import React from 'react';

export default function LogsTab({ stats }) {
  return (
    <article className="surface-container round no-margin" style={{ padding: '16px' }}>
      <h6 style={{ margin: '0 0 16px 0', fontWeight: 500 }}>Останні запити (до 50)</h6>
      {stats?.recentLogs && stats.recentLogs.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="border no-space" style={{ width: '100%', fontSize: '13px' }}>
            <thead>
              <tr>
                <th>Час</th>
                <th>Метод</th>
                <th>Шлях</th>
                <th>Статус</th>
                <th>Час відповіді</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentLogs.map((log) => {
                const isSuccess = log.status >= 200 && log.status < 300;
                const isClientErr = log.status >= 400 && log.status < 500;
                return (
                  <tr key={log.id}>
                    <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td>
                      <span className="chip small" style={{ fontSize: '10px', padding: '1px 6px' }}>
                        {log.method}
                      </span>
                    </td>
                    <td>
                      <code style={{ fontSize: '12px' }}>{log.path}</code>
                    </td>
                    <td>
                      <span
                        className="chip small"
                        style={{
                          fontSize: '11px',
                          backgroundColor: isSuccess ? 'rgba(76, 175, 80, 0.15)' : isClientErr ? 'rgba(255, 152, 0, 0.15)' : 'rgba(244, 67, 54, 0.15)',
                          color: isSuccess ? '#4caf50' : isClientErr ? '#ff9800' : '#f44336',
                          fontWeight: 600,
                        }}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td>{log.durationMs} ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="small-text surface-variant-text" style={{ margin: 0 }}>
          Немає зафіксованих запитів. Виконайте будь-який запит до API з вашим x-api-key для появи в журналі.
        </p>
      )}
    </article>
  );
}

import React from 'react';

export default function KeysTab({ keys, onOpenCreateModal, onDeleteKey }) {
  if (keys.length === 0) {
    return (
      <article className="surface-container round center-align" style={{ padding: '36px 16px' }}>
        <i className="primary-text" style={{ fontSize: '48px' }}>key_off</i>
        <h6 style={{ margin: '12px 0 4px 0' }}>Немає створених API-ключів</h6>
        <p className="small-text surface-variant-text" style={{ margin: '0 0 16px 0' }}>
          Створіть свій перший ключ для доступу до сервісу.
        </p>
        <button className="round primary" onClick={onOpenCreateModal}>
          <i>add</i>
          <span>Створити ключ</span>
        </button>
      </article>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {keys.map((k) => (
        <article key={k.id} className="surface-container round no-margin" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <h6 style={{ margin: 0, fontWeight: 500, fontSize: '16px' }}>{k.name}</h6>
                <span className="chip small" style={{ fontSize: '11px', padding: '2px 8px' }}>
                  {k.isActive ? 'Активний' : 'Вимкнено'}
                </span>
              </div>

              <div className="row middle-align" style={{ gap: '8px', marginTop: '6px' }}>
                <code style={{ background: 'var(--surface-container-high)', padding: '4px 8px', borderRadius: '4px', fontSize: '13px' }}>
                  {k.prefix}••••••••••••
                </code>
              </div>

              <div className="small-text surface-variant-text" style={{ marginTop: '8px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <span>Створено: {new Date(k.createdAt).toLocaleDateString()}</span>
                <span>Запитів: <strong>{k.totalRequests || 0}</strong></span>
                {k.lastUsedAt && (
                  <span>Остання активність: {new Date(k.lastUsedAt).toLocaleString()}</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="circle transparent error-text"
                title="Відкликати ключ"
                onClick={() => onDeleteKey(k.id, k.name)}
              >
                <i>delete</i>
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

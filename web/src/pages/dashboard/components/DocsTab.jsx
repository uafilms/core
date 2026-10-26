import React from 'react';

export default function DocsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <article className="surface-container round no-margin" style={{ padding: '28px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'var(--primary-container)',
              color: 'var(--on-primary-container)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <i style={{ fontSize: '32px' }}>menu_book</i>
          </div>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <h6 style={{ margin: '0 0 8px 0', fontWeight: 500, fontSize: '18px' }}>Офіційна документація API</h6>
            <p className="surface-variant-text" style={{ margin: '0 0 16px 0', fontSize: '14px', lineHeight: 1.6 }}>
              Повна інтерактивна документація, специфікація OpenAPI, тестування ендпоінтів та готові приклади коду для всіх платформ доступні на окремому порталі документації:
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <a
                href="https://uafilms.mintlify.app"
                target="_blank"
                rel="noopener noreferrer"
                className="button round primary"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <span>Відкрити документацію</span>
                <i>open_in_new</i>
              </a>
            </div>
          </div>
        </div>
      </article>

      <article className="surface-container round no-margin" style={{ padding: '20px 24px' }}>
        <h6 style={{ margin: '0 0 8px 0', fontWeight: 500 }}>Авторизація запитів</h6>
        <p className="small-text surface-variant-text" style={{ margin: 0, lineHeight: 1.6 }}>
          API-ключ можна передавати у заголовку <code>x-api-key</code>, у заголовку <code>Authorization: Bearer uaf_live_...</code> або через query-параметр <code>?api_key=...</code>.
        </p>
      </article>
    </div>
  );
}

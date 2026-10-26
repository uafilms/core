import React from 'react';

export default function CommunitySection() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
      <article
        className="round primary-container no-margin padding"
        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', boxSizing: 'border-box' }}
      >
        <div>
          <h6 style={{ margin: '0 0 8px 0', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i>groups</i> Спільнота
          </h6>
          <p className="small-text" style={{ margin: '0 0 20px 0', opacity: 0.9, lineHeight: '1.5' }}>
            Обговорення, новини та оновлення проекту в Telegram.
          </p>
        </div>
        <div style={{ marginTop: 'auto' }}>
          <button className="primary" onClick={() => window.open('https://t.me/uafilms_official', '_blank')}>
            Приєднатися
          </button>
        </div>
      </article>

      <article
        className="round tertiary-container no-margin padding"
        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', boxSizing: 'border-box' }}
      >
        <div>
          <h6 style={{ margin: '0 0 8px 0', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i>volunteer_activism</i> Підтримка
          </h6>
          <p className="small-text" style={{ margin: '0 0 20px 0', opacity: 0.9, lineHeight: '1.5' }}>
            Подобається проект? Ви можете підтримати розробку.
          </p>
        </div>
        <div style={{ marginTop: 'auto' }}>
          <button className="tertiary" onClick={() => window.open('https://t.me/migor1103_donate', '_blank')}>
            Підтримати автора
          </button>
        </div>
      </article>
    </div>
  );
}

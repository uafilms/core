import React from 'react';

export default function ContentSection({
  filterProfanity,
  showAdult,
  onProfanityChange,
  onShowAdultChange,
}) {
  return (
    <article className="round surface-container no-margin" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div style={{ flex: 1 }}>
          <h6 style={{ margin: 0, fontWeight: 500, fontSize: '16px' }}>Фільтрувати нецензурну лексику</h6>
          <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
            Замінює матюки в коментарях на зірочки.
          </p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={filterProfanity}
            onChange={(e) => onProfanityChange(e.target.checked)}
          />
          <span></span>
        </label>
      </div>

      <div className="divider" style={{ margin: '20px 0' }}></div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <h6 style={{ margin: 0, fontWeight: 500, fontSize: '16px' }}>Показувати контент 18+</h6>
          <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
            Додає результати для дорослих у пошук та рекомендації.
          </p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={showAdult}
            onChange={(e) => onShowAdultChange(e.target.checked)}
          />
          <span></span>
        </label>
      </div>
    </article>
  );
}

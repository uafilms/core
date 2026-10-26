import React from 'react';

export default function HeaderTabs({
  user,
  isSyncing,
  syncNow,
  setIsAuthModalOpen,
  activeTab,
  setActiveTab,
  favoritesCount,
  historyCount,
}) {
  return (
    <>
      {/* Header & Sync Status Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h4 style={{ fontWeight: 600, margin: 0 }}>Медіатека</h4>
          <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
            Збережені фільми, власні колекції та історія перегляду
          </p>
        </div>

        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="chip tertiary-container surface-variant-text" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i style={{ fontSize: '16px', color: 'var(--primary)' }}>cloud_done</i>
              <span>Синхронізовано з акаунтом</span>
            </span>
            <button
              className="circle transparent small"
              onClick={syncNow}
              disabled={isSyncing}
              title="Синхронізувати зараз"
            >
              <i style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>sync</i>
            </button>
          </div>
        ) : (
          <div
            className="round surface-container-high"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              padding: '6px 14px',
              cursor: 'pointer',
            }}
            onClick={() => setIsAuthModalOpen(true)}
          >
            <i style={{ fontSize: '18px', color: 'var(--primary)' }}>cloud_off</i>
            <span style={{ fontSize: '13px' }}>Увійдіть для синхронізації між пристроями</span>
            <button className="small round primary" style={{ padding: '4px 10px', height: '28px', fontSize: '12px' }}>
              Увійти
            </button>
          </div>
        )}
      </div>

      {/* Material 3 Segmented Control / Main Tabs */}
      <div
        className="round surface-container-low"
        style={{
          display: 'inline-flex',
          padding: '4px',
          gap: '4px',
          marginBottom: '24px',
        }}
      >
        <button
          className={activeTab === 'favorites' ? 'round primary' : 'round transparent'}
          style={{ padding: '8px 20px', fontWeight: 500, fontSize: '14px', height: '36px' }}
          onClick={() => setActiveTab('favorites')}
        >
          <i style={{ fontSize: '18px', marginRight: '6px' }}>favorite</i>
          <span>Обране ({favoritesCount})</span>
        </button>
        <button
          className={activeTab === 'history' ? 'round primary' : 'round transparent'}
          style={{ padding: '8px 20px', fontWeight: 500, fontSize: '14px', height: '36px' }}
          onClick={() => setActiveTab('history')}
        >
          <i style={{ fontSize: '18px', marginRight: '6px' }}>history</i>
          <span>Історія перегляду ({historyCount})</span>
        </button>
      </div>
    </>
  );
}

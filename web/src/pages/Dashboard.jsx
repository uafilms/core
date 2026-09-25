import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from '../api/axios.js';
import { useAuth } from '../context/AuthContext.jsx';

const Dashboard = () => {
  const { user, setIsAuthModalOpen } = useAuth();

  const [activeTab, setActiveTab] = useState('keys'); // 'keys' | 'stats' | 'logs' | 'docs'
  const [keys, setKeys] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create Key modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isClosingCreateModal, setIsClosingCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdRawKey, setCreatedRawKey] = useState(null);
  const [creating, setCreating] = useState(false);

  const handleCloseCreateModal = useCallback(() => {
    setIsClosingCreateModal(true);
    setTimeout(() => {
      setShowCreateModal(false);
      setIsClosingCreateModal(false);
      setCreatedRawKey(null);
      setNewKeyName('');
    }, 200);
  }, []);

  // Copy helper
  const [copiedId, setCopiedId] = useState(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [keysRes, statsRes] = await Promise.all([
        axios.get('/auth/keys'),
        axios.get('/auth/stats'),
      ]);
      setKeys(keysRes.data?.keys || []);
      setStats(statsRes.data?.stats || null);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Не вдалося завантажити дані');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [user, fetchData]);

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setCreating(true);
    try {
      const res = await axios.post('/auth/keys', { name: newKeyName.trim() });
      setCreatedRawKey(res.data?.rawKey);
      setNewKeyName('');
      // Refresh list
      const keysRes = await axios.get('/auth/keys');
      setKeys(keysRes.data?.keys || []);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Помилка створення ключа');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteKey = async (id, name) => {
    if (!window.confirm(`Ви дійсно бажаєте відкликати ключ "${name}"? Запити з ним більше не прийматимуться.`)) {
      return;
    }
    try {
      await axios.delete(`/auth/keys/${id}`);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      // Refresh stats
      const statsRes = await axios.get('/auth/stats');
      setStats(statsRes.data?.stats || null);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Помилка видалення ключа');
    }
  };

  if (!user) {
    return (
      <div style={{ padding: '32px 16px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <article className="surface-container round medium-elevate" style={{ padding: '40px 24px' }}>
          <i className="primary-text" style={{ fontSize: '64px' }}>vpn_key</i>
          <h4 style={{ margin: '16px 0 8px 0', fontWeight: 500 }}>API</h4>
          <p className="surface-variant-text" style={{ maxWidth: '480px', margin: '0 auto 24px auto' }}>
            Увійдіть або зареєструйтесь, щоб створювати персональні API-ключі, відстежувати статистику запитів та інтегрувати UAFilms у власні додатки.
          </p>
          <button className="round primary extra" onClick={() => setIsAuthModalOpen(true)}>
            <i>login</i>
            <span>Увійти або зареєструватися</span>
          </button>
        </article>
      </div>
    );
  }

  // Calculate metrics
  const totalRequests = stats?.totalRequests || 0;
  const last24h = stats?.dailyActivity?.find(
    (d) => d.date === new Date().toISOString().slice(0, 10)
  )?.requests || 0;
  const status2xx = stats?.statusCodes?.['2xx'] || 0;
  const successRate = totalRequests > 0 ? Math.round((status2xx / totalRequests) * 100) : 100;

  return (
    <div style={{ padding: '24px 16px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Title & Refresh */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h4 className="primary-text" style={{ margin: 0, fontWeight: 500 }}>API</h4>
          <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
            Обліковий запис: <strong>{user.email}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="round transparent border" onClick={fetchData} disabled={loading} title="Оновити дані">
            <i>refresh</i>
            <span className="m l">Оновити</span>
          </button>
          <button className="round primary" onClick={() => setShowCreateModal(true)}>
            <i>add</i>
            <span>Створити API-ключ</span>
          </button>
        </div>
      </div>

      {error && (
        <article className="border error-border round" style={{ marginBottom: '20px', padding: '12px 16px' }}>
          <div className="row middle-align" style={{ gap: '8px' }}>
            <i className="error-text">error</i>
            <span className="error-text small-text">{error}</span>
          </div>
        </article>
      )}

      {/* KPI Metric Cards */}
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
            <h5 style={{ margin: 0, fontWeight: 600 }}>{keys.filter((k) => k.isActive).length}</h5>
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

      {/* Navigation Tabs */}
      <div
        className="surface-container-low round"
        style={{
          display: 'flex',
          padding: '4px',
          gap: '4px',
          marginBottom: '20px',
          overflowX: 'auto',
        }}
      >
        <button
          className={activeTab === 'keys' ? 'round primary' : 'round transparent'}
          style={{ padding: '8px 16px', fontWeight: 500, fontSize: '14px', height: '36px', whiteSpace: 'nowrap' }}
          onClick={() => setActiveTab('keys')}
        >
          <i style={{ fontSize: '18px', marginRight: '6px' }}>vpn_key</i>
          <span>API-ключі ({keys.length})</span>
        </button>
        <button
          className={activeTab === 'stats' ? 'round primary' : 'round transparent'}
          style={{ padding: '8px 16px', fontWeight: 500, fontSize: '14px', height: '36px', whiteSpace: 'nowrap' }}
          onClick={() => setActiveTab('stats')}
        >
          <i style={{ fontSize: '18px', marginRight: '6px' }}>bar_chart</i>
          <span>Аналітика</span>
        </button>
        <button
          className={activeTab === 'logs' ? 'round primary' : 'round transparent'}
          style={{ padding: '8px 16px', fontWeight: 500, fontSize: '14px', height: '36px', whiteSpace: 'nowrap' }}
          onClick={() => setActiveTab('logs')}
        >
          <i style={{ fontSize: '18px', marginRight: '6px' }}>receipt_long</i>
          <span>Останні логи</span>
        </button>
        <button
          className={activeTab === 'docs' ? 'round primary' : 'round transparent'}
          style={{ padding: '8px 16px', fontWeight: 500, fontSize: '14px', height: '36px', whiteSpace: 'nowrap' }}
          onClick={() => setActiveTab('docs')}
        >
          <i style={{ fontSize: '18px', marginRight: '6px' }}>menu_book</i>
          <span>Документація</span>
        </button>
      </div>

      <div key={activeTab} className="tab-content-enter">
      {/* Tab 1: API Keys List */}
      {activeTab === 'keys' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {keys.length === 0 ? (
            <article className="surface-container round center-align" style={{ padding: '36px 16px' }}>
              <i className="primary-text" style={{ fontSize: '48px' }}>key_off</i>
              <h6 style={{ margin: '12px 0 4px 0' }}>Немає створених API-ключів</h6>
              <p className="small-text surface-variant-text" style={{ margin: '0 0 16px 0' }}>
                Створіть свій перший ключ для доступу до сервісу.
              </p>
              <button className="round primary" onClick={() => setShowCreateModal(true)}>
                <i>add</i>
                <span>Створити ключ</span>
              </button>
            </article>
          ) : (
            keys.map((k) => (
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
                      onClick={() => handleDeleteKey(k.id, k.name)}
                    >
                      <i>delete</i>
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Analytics & Endpoints */}
      {activeTab === 'stats' && (
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
      )}

      {/* Tab 3: Request Logs */}
      {activeTab === 'logs' && (
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
      )}

      {/* Tab 4: Documentation */}
      {activeTab === 'docs' && (
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
      )}
      </div>

      {/* Modal: Create Key */}
      {(showCreateModal || isClosingCreateModal) && typeof document !== 'undefined' && createPortal(
        <div
          className={`modal-overlay ${isClosingCreateModal ? 'closing' : ''}`}
          onClick={() => {
            if (!createdRawKey) handleCloseCreateModal();
          }}
        >
          <div
            className={`surface-container round medium-elevate modal-dialog ${isClosingCreateModal ? 'closing' : ''}`}
            style={{
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {!createdRawKey ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h6 style={{ margin: 0, fontWeight: 500 }}>Новий API-ключ</h6>
                  <button type="button" className="circle transparent" onClick={handleCloseCreateModal}>
                    <i>close</i>
                  </button>
                </div>

                <form onSubmit={handleCreateKey} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div className="field label prefix border round" style={{ marginBottom: '6px' }}>
                      <i>vpn_key</i>
                      <input
                        type="text"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder=" "
                        required
                        autoFocus
                      />
                      <label>Назва ключа</label>
                    </div>
                    <span className="small-text surface-variant-text" style={{ paddingLeft: '8px' }}>
                      Наприклад: Web App, Telegram Bot, Media Player
                    </span>
                  </div>

                  <p className="small-text surface-variant-text" style={{ margin: 0 }}>
                    Ключ буде прив'язано до вашого облікового запису. Ви зможете переглядати детальну статистику його використання.
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                    <button type="button" className="round transparent" onClick={handleCloseCreateModal}>
                      Скасувати
                    </button>
                    <button type="submit" className="round primary" disabled={creating}>
                      {creating ? 'Створення...' : 'Створити'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="green-text" style={{ color: '#4caf50', fontSize: '28px' }}>check_circle</i>
                  <h6 style={{ margin: 0, fontWeight: 500 }}>API-ключ успішно створено!</h6>
                </div>

                <article className="border round error-border" style={{ padding: '12px 14px' }}>
                  <p className="small-text error-text" style={{ margin: 0, fontWeight: 500 }}>
                    ⚠️ Увага: Скопіюйте цей ключ зараз. З міркувань безпеки він більше ніколи не буде відображений у повному вигляді!
                  </p>
                </article>

                <div style={{ background: 'var(--surface-container-high)', padding: '12px', borderRadius: '8px', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '14px' }}>
                  {createdRawKey}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    className="round primary"
                    onClick={() => handleCopy(createdRawKey, 'raw-key')}
                  >
                    <i>{copiedId === 'raw-key' ? 'done' : 'content_copy'}</i>
                    <span>{copiedId === 'raw-key' ? 'Скопійовано!' : 'Скопіювати ключ'}</span>
                  </button>
                  <button
                    className="round transparent border"
                    onClick={handleCloseCreateModal}
                  >
                    Готово
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Dashboard;

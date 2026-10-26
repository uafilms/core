import React, { useState, useEffect, useCallback } from 'react';
import axios from '../../api/axios.js';
import { useAuth } from '../../context/AuthContext.jsx';

import GuestPrompt from './components/GuestPrompt';
import KpiCards from './components/KpiCards';
import KeysTab from './components/KeysTab';
import StatsTab from './components/StatsTab';
import LogsTab from './components/LogsTab';
import DocsTab from './components/DocsTab';
import CreateKeyModal from './components/CreateKeyModal';

export default function Dashboard() {
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
      const statsRes = await axios.get('/auth/stats');
      setStats(statsRes.data?.stats || null);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Помилка видалення ключа');
    }
  };

  if (!user) {
    return <GuestPrompt onOpenAuthModal={() => setIsAuthModalOpen(true)} />;
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

      <KpiCards
        totalRequests={totalRequests}
        activeKeysCount={keys.filter((k) => k.isActive).length}
        last24h={last24h}
        successRate={successRate}
      />

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
        {activeTab === 'keys' && (
          <KeysTab
            keys={keys}
            onOpenCreateModal={() => setShowCreateModal(true)}
            onDeleteKey={handleDeleteKey}
          />
        )}

        {activeTab === 'stats' && (
          <StatsTab stats={stats} totalRequests={totalRequests} />
        )}

        {activeTab === 'logs' && (
          <LogsTab stats={stats} />
        )}

        {activeTab === 'docs' && (
          <DocsTab />
        )}
      </div>

      <CreateKeyModal
        isOpen={showCreateModal}
        isClosing={isClosingCreateModal}
        onClose={handleCloseCreateModal}
        createdRawKey={createdRawKey}
        newKeyName={newKeyName}
        setNewKeyName={setNewKeyName}
        onSubmit={handleCreateKey}
        creating={creating}
        onCopy={handleCopy}
        copiedId={copiedId}
      />
    </div>
  );
}

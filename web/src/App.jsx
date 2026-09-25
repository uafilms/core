import React, { useEffect, useRef, useState, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, useLocation } from 'react-router-dom';
import LoadingBar from 'react-top-loading-bar';
import { loaderEvent } from './api/axios';

import Sidebar from './components/Sidebar';
import AuthModal from './components/AuthModal';
import { AuthProvider } from './context/AuthContext';
import { initPalette } from './utils/palette';
import TurnstileWidget from './components/TurnstileWidget';

const Home = React.lazy(() => import('./pages/Home'));
const Details = React.lazy(() => import('./pages/Details'));
const Search = React.lazy(() => import('./pages/Search'));
const Favorites = React.lazy(() => import('./pages/Favorites'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));

const PageLoader = () => (
  <div className="page-loader">
    <progress className="circle large indeterminate"></progress>
  </div>
);

function App() {
  const ref = useRef(null);
  const location = useLocation();
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [isClosingDisclaimer, setIsClosingDisclaimer] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('uafilms_theme') || 'dark';
    document.body.className = savedTheme;

    initPalette();

    const startLoader = () => ref.current?.continuousStart();
    const stopLoader = () => ref.current?.complete();

    loaderEvent.addEventListener('start', startLoader);
    loaderEvent.addEventListener('stop', stopLoader);

    const hasSeenDisclaimer = localStorage.getItem('uafilms_beta_seen');
    if (!hasSeenDisclaimer) {
      setTimeout(() => setShowDisclaimer(true), 500);
    }

    return () => {
      loaderEvent.removeEventListener('start', startLoader);
      loaderEvent.removeEventListener('stop', stopLoader);
    };
  }, []);

  const closeDisclaimer = () => {
    localStorage.setItem('uafilms_beta_seen', 'true');
    setIsClosingDisclaimer(true);
    setTimeout(() => {
      setShowDisclaimer(false);
      setIsClosingDisclaimer(false);
    }, 200);
  };

  return (
    <AuthProvider>
      <div className="layout">
        <LoadingBar color="var(--primary)" ref={ref} height={3} shadow={true} />

        <Sidebar />

        <div className="turnstile-container">
          <TurnstileWidget />
        </div>

        <main className="responsive main-content">
          <Suspense fallback={<PageLoader />}>
            <div key={location.pathname} className="page-transition">
              <Routes location={location}>
                <Route path="/" element={<Home />} />
                <Route path="/search" element={<Search />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/details/:type/:id" element={<Details />} />
              </Routes>
            </div>
          </Suspense>
        </main>

        <AuthModal />

      {/* Beta disclaimer dialog */}
      {(showDisclaimer || isClosingDisclaimer) && typeof document !== 'undefined' && createPortal(
        <div
          className={`modal-overlay ${isClosingDisclaimer ? 'closing' : ''}`}
          onClick={closeDisclaimer}
        >
          <div
            className={`modal-dialog ${isClosingDisclaimer ? 'closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--surface-container-high)',
              padding: '28px',
              borderRadius: '28px',
              maxWidth: '420px',
              width: '100%',
              textAlign: 'center',
              boxShadow: 'var(--elevate3, 0 8px 32px rgba(0,0,0,0.3))',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--on-surface)' }}>
              <i className="primary-text" style={{ fontSize: '28px' }}>info</i>
              <h6 style={{ margin: 0, fontWeight: 700 }}>Beta-тестування</h6>
            </div>

            <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6', color: 'var(--on-surface-variant)' }}>
              Ласкаво просимо на <b>UAFilms</b>!
              <br /><br />
              Сайт знаходиться на стадії активної розробки та закритого тестування. Деякі функції можуть працювати нестабільно.
            </p>

            <button
              className="primary round"
              onClick={closeDisclaimer}
              style={{ alignSelf: 'center', marginTop: '8px', padding: '8px 24px' }}
            >
              Зрозуміло
            </button>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .turnstile-container {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
        }

        @media (max-width: 600px) {
          .turnstile-container {
            bottom: 90px;
          }
          .main-content {
            padding-bottom: 80px;
          }
        }
      `}</style>
      </div>
    </AuthProvider>
  );
}

export default App;

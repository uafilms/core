import React, { useEffect, useRef, useState, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import LoadingBar from 'react-top-loading-bar';
import { loaderEvent } from './api/axios';

import Sidebar from './components/Sidebar';
import { initPalette } from './utils/palette';
import TurnstileWidget from './components/TurnstileWidget';
import 'mdui/components/circular-progress.js';
import 'mdui/components/icon.js';
import 'mdui/components/button.js';

const Home = React.lazy(() => import('./pages/Home'));
const Details = React.lazy(() => import('./pages/Details'));
const Search = React.lazy(() => import('./pages/Search'));
const Favorites = React.lazy(() => import('./pages/Favorites'));
const Settings = React.lazy(() => import('./pages/Settings'));

const PageLoader = () => (
  <div style={{ minHeight: '100vh', background: 'rgb(var(--mdui-color-surface))', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
    <mdui-circular-progress indeterminate></mdui-circular-progress>
  </div>
);

function App() {
  const ref = useRef(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('uafilms_theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);

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
    setShowDisclaimer(false);
  };

  return (
    <div className="app-container" style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'rgb(var(--mdui-color-surface))' }}>
      <LoadingBar color="rgb(var(--mdui-color-primary))" ref={ref} height={3} shadow={true} />
      
      <Sidebar />

      <div className="turnstile-container">
          <TurnstileWidget />
      </div>

      <div style={{ flex: 1, overflowX: 'hidden', position: 'relative', marginBottom: '80px' }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/details/:type/:id" element={<Details />} />
          </Routes>
        </Suspense>
      </div>

       {showDisclaimer && (
         <div 
            style={{
              position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
              backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 9999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px', boxSizing: 'border-box'
            }}
            onClick={closeDisclaimer} 
         >
            <div 
              onClick={(e) => e.stopPropagation()} 
              style={{
                backgroundColor: 'rgb(var(--mdui-color-surface-container-high))',
                padding: '24px', borderRadius: '28px', maxWidth: '400px', width: '100%',
                textAlign: 'center', boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                display: 'flex', flexDirection: 'column', gap: '16px'
              }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'rgb(var(--mdui-color-on-surface))' }}>
                  <mdui-icon style={{ color: 'rgb(var(--mdui-color-primary))' }} name="info"></mdui-icon>
                  <span style={{ fontSize: '24px', fontWeight: '500' }}>Beta-тестування</span>
                </div>
                <div style={{ color: 'rgb(var(--mdui-color-on-surface-variant))', fontSize: '16px', lineHeight: '1.5' }}>
                  <p style={{ margin: 0 }}>
                    Ласкаво просимо на <b>UAFilms</b>! <br/><br/>
                    Проект знаходиться в розробці. Можливі помилки та тимчасові проблеми з джерелами.
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
                  <mdui-button variant="filled" onClick={closeDisclaimer}>Зрозуміло</mdui-button>
                </div>
            </div>
         </div>
       )}
       
       <style>{`
         .turnstile-container {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
         }

          @media (max-width: 768px) {
             .turnstile-container {
                 bottom: 110px; /* Відступ від нижньої навігації (80px) + запас */
             }
          }

         @media (min-width: 769px) {
            .app-container > div:last-child {
                margin-bottom: 0 !important;
            }
         }
       `}</style>
    </div>
  );
}

export default App;
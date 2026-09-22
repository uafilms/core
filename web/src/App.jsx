import React, { useEffect, useRef, useState, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import LoadingBar from 'react-top-loading-bar';
import { loaderEvent } from './api/axios';

import Sidebar from './components/Sidebar';
import { initPalette } from './utils/palette';
import TurnstileWidget from './components/TurnstileWidget';

const Home = React.lazy(() => import('./pages/Home'));
const Details = React.lazy(() => import('./pages/Details'));
const Search = React.lazy(() => import('./pages/Search'));
const Favorites = React.lazy(() => import('./pages/Favorites'));
const Settings = React.lazy(() => import('./pages/Settings'));

const PageLoader = () => (
  <div className="page-loader">
    <progress className="circle large indeterminate"></progress>
  </div>
);

function App() {
  const ref = useRef(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

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
    setShowDisclaimer(false);
  };

  return (
    <div className="layout">
      <LoadingBar color="var(--primary)" ref={ref} height={3} shadow={true} />

      <Sidebar />

      <div className="turnstile-container">
        <TurnstileWidget />
      </div>

      <main className="responsive main-content">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/details/:type/:id" element={<Details />} />
          </Routes>
        </Suspense>
      </main>

      {/* Beta disclaimer dialog */}
      <dialog className={`modal ${showDisclaimer ? 'active' : ''}`} onClick={closeDisclaimer}>
        <article className="round padding" onClick={(e) => e.stopPropagation()}>
          <header className="row center-align middle-align">
            <i className="primary-text" style={{ fontSize: '32px' }}>info</i>
            <h5 className="no-margin">Beta-тестування</h5>
          </header>
          <div className="space"></div>
          <p className="center-align">
            Ласкаво просимо на <b>UAFilms</b>!
            <br /><br />
            Проєкт переписано на сучасний стек з BeerCSS та OMSS специфікацією.
          </p>
          <div className="space"></div>
          <nav className="right-align">
            <button className="primary" onClick={closeDisclaimer}>Зрозуміло</button>
          </nav>
        </article>
      </dialog>

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
  );
}

export default App;

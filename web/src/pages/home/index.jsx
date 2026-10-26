import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';

import HomeSearch from './components/HomeSearch';
import MovieSection from './components/MovieSection';

let homeDataCache = null;

export default function Home() {
  const [data, setData] = useState(homeDataCache);
  const [searchQuery, setSearchQuery] = useState('');
  const [history, setHistory] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const settings = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
    const adult = settings.showAdult || false;

    const savedHistory = JSON.parse(localStorage.getItem('uafilms_search_history') || '[]');
    setHistory(savedHistory);

    api.get(`/home?adult=${adult}`)
      .then((res) => {
        homeDataCache = res.data;
        setData(res.data);
      })
      .catch((err) => console.error(err));
  }, []);

  const handleSearchSubmit = (e) => {
    if ((e.key === 'Enter' || e.type === 'click') && searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleHistoryClick = (query) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  if (!data) {
    return (
      <div className="page-loader">
        <progress className="circle large indeterminate"></progress>
      </div>
    );
  }

  return (
    <div>
      <HomeSearch
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        history={history}
        onHistoryClick={handleHistoryClick}
      />

      <MovieSection items={data.trending} isHero={true} />
      <MovieSection title="Рекомендації" items={data.recommended} />
      <MovieSection title="Українське" items={data.ukrainian} />
      <MovieSection title="Мультфільми" items={data.cartoons} />
      <MovieSection title="Аніме" items={data.anime} />
    </div>
  );
}

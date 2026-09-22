import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import MovieCard from '../components/MovieCard';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { Mousewheel } from 'swiper/modules';
import { useNavigate } from 'react-router-dom';

const BetaBadge = () => (
  <span className="badge min red white-text" style={{ marginLeft: '8px' }}>
    BETA
  </span>
);

const Section = ({ title, items, isHero = false }) => {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: '32px' }}>
      {!isHero && (
        <h5 style={{ marginLeft: '24px', marginBottom: '16px', fontWeight: 600 }}>
          {title}
        </h5>
      )}
      <Swiper
        modules={[Mousewheel]}
        mousewheel={true}
        spaceBetween={16}
        slidesPerView={'auto'}
        style={{ paddingLeft: '24px', paddingRight: '24px' }}
      >
        {items.map((item) => (
          <SwiperSlide key={item.id}>
            <MovieCard movie={item} isHero={isHero} />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
};

const Home = () => {
  const [data, setData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [history, setHistory] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const settings = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
    const adult = settings.showAdult || false;

    const savedHistory = JSON.parse(localStorage.getItem('uafilms_search_history') || '[]');
    setHistory(savedHistory);

    api.get(`/home?adult=${adult}`)
      .then((res) => setData(res.data))
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
      <div style={{ padding: '24px 24px 8px 24px' }}>
        <div className="row middle-align" style={{ marginBottom: '16px' }}>
          <h4 className="primary-text no-margin" style={{ fontWeight: 700 }}>
            UAFilms
          </h4>
          <BetaBadge />
        </div>

        <div className="field prefix round fill surface-container" style={{ width: '100%', margin: 0 }}>
          <i>search</i>
          <input
            type="text"
            placeholder="Що будемо дивитись?"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchSubmit}
          />
        </div>

        {history.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div className="small-text surface-variant-text" style={{ marginBottom: '8px', marginLeft: '4px' }}>
              Історія пошуку:
            </div>
            <div className="row no-wrap" style={{ gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {history.map((item, index) => (
                <button
                  key={index}
                  className="chip border surface-container-low"
                  onClick={() => handleHistoryClick(item)}
                  style={{ flexShrink: 0, cursor: 'pointer' }}
                >
                  <span>{item}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Section items={data.trending} isHero={true} />
      <Section title="Рекомендації" items={data.recommended} />
      <Section title="Українське" items={data.ukrainian} />
      <Section title="Мультфільми" items={data.cartoons} />
      <Section title="Аніме" items={data.anime} />
    </div>
  );
};

export default Home;

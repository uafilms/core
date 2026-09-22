import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import MovieCard from '../components/MovieCard';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { Mousewheel } from 'swiper/modules';
import { useNavigate } from 'react-router-dom';

// Імпорти для пошуку та історії
import 'mdui/components/text-field.js';
import 'mdui/components/icon.js';
import 'mdui/components/chip.js';
import 'mdui/components/circular-progress.js';

// SVG бейдж бета-версії
const BetaBadge = () => (
  <svg width="30" height="12" viewBox="0 0 37 15" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginLeft: '8px', marginBottom: '12px' }}>
    <g clipPath="url(#clip0_1_2)">
      <rect width="37" height="15" rx="7.5" fill="#FF5757"/>
      <path d="M9.01705 5.95455H9.86932C10.4659 5.95455 10.9517 6.08097 11.3267 6.33381C11.7045 6.58665 11.9815 6.90767 12.1577 7.29688C12.3366 7.68608 12.4261 8.08523 12.4261 8.49432C12.4261 8.98864 12.3111 9.43466 12.081 9.83239C11.8509 10.2273 11.5341 10.5412 11.1307 10.7741C10.7273 11.0043 10.267 11.1193 9.75 11.1193C9.43466 11.1193 9.12216 11.0611 8.8125 10.9446C8.50568 10.8253 8.23295 10.5994 7.99432 10.267L7.92614 10.3011V8.63068C7.92614 8.90909 7.99432 9.16619 8.13068 9.40199C8.26989 9.63778 8.46591 9.8267 8.71875 9.96875C8.97443 10.1108 9.27841 10.1818 9.63068 10.1818C10 10.1818 10.3182 10.1037 10.5852 9.94744C10.8523 9.79119 11.0582 9.58523 11.2031 9.32955C11.348 9.07386 11.4205 8.79545 11.4205 8.49432C11.4205 8.21023 11.3551 7.94176 11.2244 7.68892C11.0966 7.43324 10.9148 7.22585 10.679 7.06676C10.446 6.90483 10.1705 6.82386 9.85227 6.82386H9.01705V5.95455ZM9.51136 2.15341C9.91761 2.15341 10.277 2.21875 10.5895 2.34943C10.9048 2.48011 11.1705 2.65625 11.3864 2.87784C11.6051 3.09659 11.7699 3.34233 11.8807 3.61506C11.9943 3.88778 12.0511 4.16761 12.0511 4.45455C12.0511 4.8125 11.9602 5.16903 11.7784 5.52415C11.5966 5.87642 11.3182 6.17045 10.9432 6.40625C10.5682 6.6392 10.0909 6.75568 9.51136 6.75568H9.01705V5.88636H9.49432C9.82386 5.88636 10.1051 5.81818 10.3381 5.68182C10.5739 5.54545 10.7528 5.3679 10.875 5.14915C11 4.9304 11.0625 4.69886 11.0625 4.45455C11.0625 4.0625 10.9119 3.73722 10.6108 3.47869C10.3125 3.22017 9.94602 3.09091 9.51136 3.09091C9.22159 3.09091 8.95597 3.15057 8.71449 3.26989C8.47585 3.3892 8.28409 3.5554 8.1392 3.76847C7.99716 3.98153 7.92614 4.22727 7.92614 4.50568V13.4545H6.92045V4.50568C6.92045 4.05682 7.03125 3.65483 7.25284 3.29972C7.47727 2.9446 7.78409 2.66477 8.1733 2.46023C8.56534 2.25568 9.01136 2.15341 9.51136 2.15341ZM16.7781 11.1364C16.1474 11.1364 15.6033 10.9972 15.146 10.7188C14.6914 10.4375 14.3406 10.0455 14.0934 9.54261C13.8491 9.03693 13.7269 8.44886 13.7269 7.77841C13.7269 7.10795 13.8491 6.51705 14.0934 6.00568C14.3406 5.49148 14.6843 5.09091 15.1246 4.80398C15.5678 4.5142 16.0849 4.36932 16.6758 4.36932C17.0167 4.36932 17.3533 4.42614 17.6857 4.53977C18.0181 4.65341 18.3207 4.83807 18.5934 5.09375C18.8661 5.34659 19.0835 5.68182 19.2454 6.09943C19.4073 6.51705 19.4883 7.03125 19.4883 7.64205V8.06818H14.4428V7.19886H18.4656C18.4656 6.82955 18.3917 6.5 18.244 6.21023C18.0991 5.92045 17.8917 5.69176 17.6218 5.52415C17.3548 5.35653 17.0394 5.27273 16.6758 5.27273C16.2752 5.27273 15.9286 5.37216 15.636 5.57102C15.3462 5.76705 15.1232 6.02273 14.967 6.33807C14.8107 6.65341 14.7326 6.99148 14.7326 7.35227V7.93182C14.7326 8.42614 14.8178 8.84517 14.9883 9.18892C15.1616 9.52983 15.4016 9.78977 15.7085 9.96875C16.0153 10.1449 16.3718 10.233 16.7781 10.233C17.0423 10.233 17.2809 10.196 17.494 10.1222C17.7099 10.0455 17.896 9.93182 18.0522 9.78125C18.2085 9.62784 18.3292 9.4375 18.4144 9.21023L19.386 9.48295C19.2837 9.8125 19.1119 10.1023 18.8704 10.3523C18.6289 10.5994 18.3306 10.7926 17.9755 10.9318C17.6204 11.0682 17.2212 11.1364 16.7781 11.1364ZM23.8647 4.45455V5.30682H20.4727V4.45455H23.8647ZM21.4613 2.88636H22.467V9.125C22.467 9.40909 22.5082 9.62216 22.5906 9.7642C22.6758 9.90341 22.7837 9.99716 22.9144 10.0455C23.0479 10.0909 23.1886 10.1136 23.3363 10.1136C23.4471 10.1136 23.538 10.108 23.609 10.0966C23.68 10.0824 23.7369 10.071 23.7795 10.0625L23.984 10.9659C23.9158 10.9915 23.8207 11.017 23.6985 11.0426C23.5763 11.071 23.4215 11.0852 23.234 11.0852C22.9499 11.0852 22.6715 11.0241 22.3988 10.902C22.1289 10.7798 21.9045 10.5938 21.7255 10.3438C21.5494 10.0938 21.4613 9.77841 21.4613 9.39773V2.88636ZM27.3036 11.1534C26.8888 11.1534 26.5124 11.0753 26.1744 10.919C25.8363 10.7599 25.5678 10.5312 25.369 10.233C25.1701 9.93182 25.0707 9.56818 25.0707 9.14205C25.0707 8.76705 25.1445 8.46307 25.2923 8.23011C25.44 7.99432 25.6374 7.80966 25.8846 7.67614C26.1317 7.54261 26.4045 7.44318 26.7028 7.37784C27.0039 7.30966 27.3065 7.25568 27.6104 7.21591C28.0082 7.16477 28.3306 7.12642 28.5778 7.10085C28.8278 7.07244 29.0096 7.02557 29.1232 6.96023C29.2397 6.89489 29.2979 6.78125 29.2979 6.61932V6.58523C29.2979 6.16477 29.1829 5.83807 28.9528 5.60511C28.7255 5.37216 28.3803 5.25568 27.9173 5.25568C27.4371 5.25568 27.0607 5.3608 26.788 5.57102C26.5153 5.78125 26.3235 6.00568 26.2127 6.24432L25.2582 5.90341C25.4286 5.50568 25.6559 5.19602 25.94 4.97443C26.2269 4.75 26.5394 4.59375 26.8775 4.50568C27.2184 4.41477 27.5536 4.36932 27.8832 4.36932C28.0934 4.36932 28.3349 4.39489 28.6076 4.44602C28.8832 4.49432 29.1488 4.59517 29.4045 4.74858C29.663 4.90199 29.8775 5.13352 30.0479 5.44318C30.2184 5.75284 30.3036 6.16761 30.3036 6.6875V11H29.2979V10.1136H29.2468C29.1786 10.2557 29.065 10.4077 28.9059 10.5696C28.7468 10.7315 28.5352 10.8693 28.271 10.983C28.0067 11.0966 27.6843 11.1534 27.3036 11.1534ZM27.457 10.25C27.8548 10.25 28.19 10.1719 28.4627 10.0156C28.7383 9.85938 28.9457 9.65767 29.0849 9.41051C29.2269 9.16335 29.2979 8.90341 29.2979 8.63068V7.71023C29.2553 7.76136 29.1616 7.80824 29.0167 7.85085C28.8746 7.89062 28.7099 7.92614 28.5224 7.95739C28.3377 7.9858 28.1573 8.01136 27.9812 8.03409C27.8079 8.05398 27.6673 8.07102 27.5593 8.08523C27.2979 8.11932 27.0536 8.17472 26.8263 8.25142C26.6019 8.32528 26.4201 8.4375 26.2809 8.58807C26.1445 8.7358 26.0763 8.9375 26.0763 9.19318C26.0763 9.54261 26.2056 9.80682 26.4641 9.9858C26.7255 10.1619 27.0565 10.25 27.457 10.25Z" fill="white"/>
    </g>
    <defs>
      <clipPath id="clip0_1_2">
        <rect width="37" height="15" fill="white"/>
      </clipPath>
    </defs>
  </svg>
);

const Section = ({ title, items, isHero = false }) => {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: '32px' }}>
      {!isHero && (
        <h2 style={{ 
          marginLeft: '24px', 
          fontSize: '22px', 
          marginBottom: '16px',
          color: 'rgb(var(--mdui-color-on-surface))' 
        }}>
          {title}
        </h2>
      )}
      <Swiper 
        modules={[Mousewheel]}
        mousewheel={true}
        spaceBetween={16} 
        slidesPerView={'auto'}
        style={{ paddingLeft: '24px', paddingRight: '24px' }}
      >
        {items.map(item => (
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
      .then(res => setData(res.data))
      .catch(err => console.error(err));
  }, []);

  const handleSearchSubmit = (e) => {
    if ((e.key === 'Enter' || e.type === 'click') && searchQuery.trim()) {
        navigate(`/search?q=${searchQuery}`);
    }
  };

  const handleHistoryClick = (query) => {
      navigate(`/search?q=${query}`);
  };

  if (!data) return <div style={{ minHeight: '100vh', background: 'rgb(var(--mdui-color-surface))', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><mdui-circular-progress indeterminate></mdui-circular-progress></div>;

  return (
    <div>
      <div style={{ padding: '24px', marginBottom: '5px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <h1 style={{ fontSize: '28px', color: 'rgb(var(--mdui-color-primary))', margin: 0 }}>UAFilms</h1>
            <BetaBadge />
        </div>

        <mdui-text-field
            label="Що будемо дивитись?"
            value={searchQuery}
            onInput={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchSubmit}
            variant="outlined"
            style={{ width: '100%', borderRadius: '28px' }}
        >
            <mdui-icon slot="leading-icon" name="search"></mdui-icon>
        </mdui-text-field>

        {history.length > 0 && (
            <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '14px', color: 'rgb(var(--mdui-color-on-surface-variant))', marginBottom: '8px', marginLeft: '4px' }}>
                    Історія пошуку:
                </div>
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '1px', flexWrap: 'nowrap' }}>
                    {history.map((item, index) => (
                        <mdui-chip 
                            key={index} 
                            variant="suggestion"
                            onClick={() => handleHistoryClick(item)}
                            style={{ cursor: 'pointer', flexShrink: 0 }}
                        >{item}</mdui-chip>
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
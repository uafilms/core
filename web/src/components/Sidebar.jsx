import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/', icon: 'home', label: 'Головна' },
  { to: '/search', icon: 'search', label: 'Пошук' },
  { to: '/favorites', icon: 'favorite', label: 'Обране' },
  { to: '/settings', icon: 'settings', label: 'Налаштування' },
];

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isCurrent = (to) => {
    return to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
  };

  return (
    <>
      {/* Desktop & Tablet Navigation Rail (Medium & Large screens) */}
      <nav className="left m l">
        <header>
          <a onClick={() => navigate('/')} className="row center-align middle-align no-space" style={{ cursor: 'pointer' }}>
            <i className="primary-text" style={{ fontSize: '32px' }}>movie</i>
          </a>
        </header>

        {navItems.map((item) => {
          const active = isCurrent(item.to);
          return (
            <a
              key={item.to}
              onClick={() => navigate(item.to)}
              className={active ? 'active' : ''}
              style={{ cursor: 'pointer' }}
            >
              <i>{item.icon}</i>
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      {/* Mobile Bottom Navigation Bar (Small screens) */}
      <nav className="bottom s">
        {navItems.map((item) => {
          const active = isCurrent(item.to);
          return (
            <a
              key={item.to}
              onClick={() => navigate(item.to)}
              className={active ? 'active' : ''}
              style={{ cursor: 'pointer' }}
            >
              <i>{item.icon}</i>
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </>
  );
};

export default Sidebar;

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import NavItem from './NavItem';

const NAV_ITEMS = [
  { to: '/', icon: 'home', label: 'Головна' },
  { to: '/favorites', icon: 'favorite', label: 'Обране' },
  { to: '/settings', icon: 'settings', label: 'Налаштування' },
];

export default function Sidebar() {
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

        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.to}
            item={item}
            active={isCurrent(item.to)}
            onClick={() => navigate(item.to)}
          />
        ))}
      </nav>

      {/* Mobile Bottom Navigation Bar (Small screens) */}
      <nav className="bottom s">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.to}
            item={item}
            active={isCurrent(item.to)}
            onClick={() => navigate(item.to)}
          />
        ))}
      </nav>
    </>
  );
}

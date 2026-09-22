import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import 'mdui/components/ripple.js';
import 'mdui/components/icon.js';

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const NavItem = ({ to, icon, label, selectedIcon }) => {
    const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

    return (
      <div
        className="nav-item"
        onClick={() => navigate(to)}
      >
        <div className="nav-icon-wrapper">
          <mdui-ripple></mdui-ripple>
          <span
            className={`nav-pill${isActive ? ' nav-pill-active' : ''}`}
          />
          <mdui-icon
            style={{
              position: 'relative',
              zIndex: 1,
              color: isActive ? 'rgb(var(--mdui-color-on-secondary-container))' : 'rgb(var(--mdui-color-on-surface-variant))',
              transition: 'color 200ms ease',
              fontSize: '24px',
            }}
            name={isActive ? (selectedIcon || icon) : icon}
          ></mdui-icon>
        </div>
        <span
          className="nav-label"
          style={{
            fontWeight: isActive ? 700 : 500,
            color: isActive ? 'rgb(var(--mdui-color-on-surface))' : 'rgb(var(--mdui-color-on-surface-variant))',
          }}
        >
          {label}
        </span>
      </div>
    );
  };

  return (
    <>
      <style>{`
        .sidebar-container {
          width: 80px;
          min-width: 80px;
          flex-shrink: 0;
          height: 100vh;
          position: sticky;
          top: 0;
          background-color: rgb(var(--mdui-color-surface));
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-top: 24px;
          z-index: 100;
        }
        .sidebar-logo {
          margin-bottom: 28px;
          color: rgb(var(--mdui-color-primary));
          display: flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 40px;
          flex-shrink: 0;
        }
        .nav-items {
          display: flex;
          flex-direction: column;
          gap: 4px;
          width: 100%;
        }
        .nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          padding: 4px 0;
        }
        .nav-icon-wrapper {
          position: relative;
          width: 56px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          overflow: hidden;
        }
        .nav-pill {
          position: absolute;
          inset: 0;
          border-radius: 16px;
          background-color: rgb(var(--mdui-color-secondary-container));
          opacity: 0;
          transform: scaleX(0.6);
          transition: opacity 200ms ease, transform 200ms ease;
        }
        .nav-pill-active {
          opacity: 1;
          transform: scaleX(1);
        }
        .nav-label {
          margin-top: 4px;
          font-size: 11px;
          line-height: 16px;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 76px;
          transition: color 200ms ease;
        }

        @media (max-width: 768px) {
          .sidebar-container {
            width: 100%;
            height: 80px;
            position: fixed;
            top: auto;
            bottom: 0;
            flex-direction: row;
            padding-top: 0;
            padding-bottom: env(safe-area-inset-bottom);
            border-top: 1px solid rgb(var(--mdui-color-outline-variant));
            justify-content: space-around;
            background-color: rgb(var(--mdui-color-surface-container));
          }
          .sidebar-logo {
            display: none;
          }
          .nav-items {
            flex-direction: row;
            justify-content: space-around;
            align-items: center;
            height: 100%;
            gap: 0;
          }
          .nav-item {
            flex: 1;
            justify-content: center;
          }
          .nav-label {
            font-size: 12px;
          }
        }
      `}</style>

      <div className="sidebar-container">
        <div className="sidebar-logo">
          <svg width="31" height="32" viewBox="0 0 31 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0.557816 9.24832L29.4367 0.035822C30.033 -0.154392 30.6108 0.380053 30.4678 0.989283L23.505 30.6436C23.3493 31.3074 22.4888 31.4853 22.0783 30.9384L13.0188 18.8739C12.961 18.7969 12.89 18.7308 12.809 18.6788L0.371912 10.6918C-0.201881 10.3233 -0.0899653 9.45505 0.557816 9.24832Z" fill="currentColor"/>
          </svg>
        </div>

        <div className="nav-items">
            <NavItem to="/" icon="home" selectedIcon="home_filled" label="Головна" />
            {/* NavItem пошуку видалено */}
            <NavItem to="/favorites" icon="favorite_border" selectedIcon="favorite" label="Збережене" />
            <NavItem to="/settings" icon="settings" selectedIcon="settings" label="Налаштування" />
        </div>
      </div>
    </>
  );
};

export default Sidebar;

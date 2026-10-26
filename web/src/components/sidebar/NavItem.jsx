import React from 'react';

export default function NavItem({ item, active, onClick }) {
  return (
    <a
      onClick={onClick}
      className={active ? 'active' : ''}
      style={{ cursor: 'pointer' }}
    >
      <i>{item.icon}</i>
      <span>{item.label}</span>
    </a>
  );
}

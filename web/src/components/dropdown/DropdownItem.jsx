import React from 'react';

export default function DropdownItem({
  itemRef,
  opt,
  isSelected,
  isFocused,
  isOpen,
  onSelect,
  onKeyDown,
  onFocus,
  onMouseEnter,
  onMouseLeave,
}) {
  return (
    <div
      ref={itemRef}
      role="option"
      tabIndex={isOpen ? 0 : -1}
      aria-selected={isSelected}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderRadius: '10px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: isSelected ? 600 : (isFocused ? 500 : 400),
        backgroundColor: isSelected
          ? 'var(--secondary-container, rgba(255, 255, 255, 0.12))'
          : isFocused
          ? 'var(--surface-container-highest, rgba(255, 255, 255, 0.08))'
          : 'transparent',
        color: isSelected
          ? 'var(--on-secondary-container, var(--primary))'
          : 'var(--on-surface, #e6e1e5)',
        outline: isFocused
          ? '2px solid var(--primary, #5B8DEF)'
          : 'none',
        outlineOffset: '-2px',
        transition: 'background-color 0.15s ease, outline 0.15s ease',
        userSelect: 'none',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span>{opt.label}</span>
      {isSelected ? (
        <i style={{ fontSize: '18px', color: 'var(--primary)', lineHeight: 1 }}>check</i>
      ) : null}
    </div>
  );
}

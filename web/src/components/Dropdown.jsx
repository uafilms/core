import React, { useState, useRef, useEffect } from 'react';

/**
 * Material 3 animated Dropdown Component
 * Designed for BeerCSS environments without style collisions
 */
const Dropdown = ({ value, options, onChange, label, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={dropdownRef}
      className={`m3-dropdown-wrapper ${className}`}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        className="button border round fill no-margin"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minWidth: '160px',
          height: '42px',
          padding: '0 16px',
          cursor: 'pointer',
          backgroundColor: 'var(--surface-container-high, #242229)',
          color: 'var(--on-surface, #e6e1e5)',
          border: '1px solid var(--outline-variant, rgba(255, 255, 255, 0.12))',
          borderRadius: '12px',
          fontSize: '14px',
          fontWeight: 500,
          transition: 'background-color 0.2s, border-color 0.2s, border-radius var(--speed2, 0.2s), transform var(--speed3, 0.3s), padding var(--speed3, 0.3s)',
        }}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{selectedOption?.label || label}</span>
        <i
          style={{
            marginLeft: '12px',
            fontSize: '20px',
            lineHeight: 1,
            transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          arrow_drop_down
        </i>
      </button>

      <div
        role="listbox"
        style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 6px)',
          minWidth: '180px',
          zIndex: 9999,
          backgroundColor: 'var(--surface-container-high, #2b2831)',
          color: 'var(--on-surface, #e6e1e5)',
          borderRadius: '14px',
          padding: '6px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)',
          border: '1px solid var(--outline-variant, rgba(255, 255, 255, 0.12))',
          opacity: isOpen ? 1 : 0,
          visibility: isOpen ? 'visible' : 'hidden',
          transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(-8px)',
          transformOrigin: 'top right',
          transition: 'opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0, 0, 1), visibility 0.2s',
          pointerEvents: isOpen ? 'auto' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {options.map((opt) => {
          const isSelected = opt.value === value;
          return (
            <div
              key={opt.value}
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: isSelected ? 600 : 400,
                backgroundColor: isSelected
                  ? 'var(--secondary-container, rgba(255, 255, 255, 0.12))'
                  : 'transparent',
                color: isSelected
                  ? 'var(--on-secondary-container, var(--primary))'
                  : 'var(--on-surface, #e6e1e5)',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = 'var(--surface-container-highest, rgba(255, 255, 255, 0.08))';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <span>{opt.label}</span>
              {isSelected ? (
                <i style={{ fontSize: '18px', color: 'var(--primary)', lineHeight: 1 }}>check</i>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Dropdown;

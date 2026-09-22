import React, { useState, useRef, useEffect } from 'react';

/**
 * BeerCSS-styled Dropdown Component
 * Replaces native browser <select> with a proper Material 3 menu
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

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div
      ref={dropdownRef}
      className={`dropdown-container ${className}`}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        className="button border round fill no-margin"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minWidth: '150px',
          padding: '8px 14px',
          cursor: 'pointer',
          backgroundColor: 'var(--surface-container-high)',
          color: 'var(--on-surface)',
          border: '1px solid var(--outline-variant, rgba(255,255,255,0.1))',
        }}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span style={{ fontWeight: 500 }}>{selectedOption?.label || label}</span>
        <i style={{ marginLeft: '8px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
          arrow_drop_down
        </i>
      </button>

      {isOpen && (
        <menu
          className="active no-wrap"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 4px)',
            minWidth: '100%',
            zIndex: 1000,
            boxShadow: 'var(--elevate3, 0 4px 20px rgba(0,0,0,0.3))',
            borderRadius: '1rem',
            backgroundColor: 'var(--surface-container-high)',
            padding: '4px',
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <li
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                style={{
                  cursor: 'pointer',
                  borderRadius: '0.75rem',
                  backgroundColor: isSelected ? 'var(--secondary-container)' : 'transparent',
                }}
              >
                <a
                  className={isSelected ? 'primary-text' : ''}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  <i style={{ fontSize: '18px', opacity: isSelected ? 1 : 0 }}>check</i>
                  <span>{opt.label}</span>
                </a>
              </li>
            );
          })}
        </menu>
      )}
    </div>
  );
};

export default Dropdown;

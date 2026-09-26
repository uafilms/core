import React, { useState, useRef, useEffect } from 'react';

/**
 * Material 3 animated Dropdown Component
 * Designed for BeerCSS environments without style collisions.
 * Supports touch, mouse, keyboard and gamepad / spatial navigation (PlayStation/TV).
 */
const Dropdown = ({
  value,
  options = [],
  onChange,
  label,
  className = '',
  maxVisibleItems = 5,
  align = 'auto',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isKeyboardNav, setIsKeyboardNav] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const selectedItemRef = useRef(null);
  const itemRefs = useRef([]);
  const [computedAlign, setComputedAlign] = useState(align === 'auto' ? 'left' : align);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];
  const selectedIndex = options.findIndex((opt) => opt.value === value);

  useEffect(() => {
    if (align !== 'auto') {
      setComputedAlign(align);
      return;
    }
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      if (rect.right + 40 > window.innerWidth && rect.left > 120) {
        setComputedAlign('right');
      } else {
        setComputedAlign('left');
      }
    }
  }, [isOpen, align]);

  useEffect(() => {
    if (isOpen) {
      if (selectedItemRef.current) {
        selectedItemRef.current.scrollIntoView({ block: 'nearest' });
      }
    } else {
      setFocusedIndex(-1);
      setIsKeyboardNav(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside, { passive: true });
      document.addEventListener('keydown', handleGlobalKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isOpen]);

  const handleTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setIsKeyboardNav(true);
        const nextIdx = selectedIndex >= 0 ? selectedIndex : 0;
        setFocusedIndex(nextIdx);
        setTimeout(() => {
          itemRefs.current[nextIdx]?.focus({ preventScroll: true });
          itemRefs.current[nextIdx]?.scrollIntoView({ block: 'nearest' });
        }, 10);
      } else {
        const nextIdx = (focusedIndex + 1) % options.length;
        setIsKeyboardNav(true);
        setFocusedIndex(nextIdx);
        itemRefs.current[nextIdx]?.focus({ preventScroll: true });
        itemRefs.current[nextIdx]?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setIsKeyboardNav(true);
        const prevIdx = selectedIndex >= 0 ? selectedIndex : options.length - 1;
        setFocusedIndex(prevIdx);
        setTimeout(() => {
          itemRefs.current[prevIdx]?.focus({ preventScroll: true });
          itemRefs.current[prevIdx]?.scrollIntoView({ block: 'nearest' });
        }, 10);
      } else {
        const prevIdx = (focusedIndex - 1 + options.length) % options.length;
        setIsKeyboardNav(true);
        setFocusedIndex(prevIdx);
        itemRefs.current[prevIdx]?.focus({ preventScroll: true });
        itemRefs.current[prevIdx]?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    }
  };

  const handleOptionKeyDown = (e, index, optValue) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange(optValue);
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsKeyboardNav(true);
      const nextIndex = (index + 1) % options.length;
      setFocusedIndex(nextIndex);
      itemRefs.current[nextIndex]?.focus({ preventScroll: true });
      itemRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsKeyboardNav(true);
      const prevIndex = (index - 1 + options.length) % options.length;
      setFocusedIndex(prevIndex);
      itemRefs.current[prevIndex]?.focus({ preventScroll: true });
      itemRefs.current[prevIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  const isAlignRight = computedAlign === 'right';

  return (
    <div
      ref={dropdownRef}
      className={`m3-dropdown-wrapper ${className}`}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        ref={triggerRef}
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
          touchAction: 'manipulation',
          outline: 'none',
        }}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
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
          left: isAlignRight ? 'auto' : 0,
          right: isAlignRight ? 0 : 'auto',
          top: 'calc(100% + 6px)',
          minWidth: '180px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: `${maxVisibleItems * 41 + 12}px`,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--outline-variant, rgba(255, 255, 255, 0.3)) transparent',
          WebkitOverflowScrolling: 'touch',
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
          transformOrigin: isAlignRight ? 'top right' : 'top left',
          transition: 'opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0, 0, 1), visibility 0.2s',
          pointerEvents: isOpen ? 'auto' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {options.map((opt, index) => {
          const isSelected = opt.value === value;
          const isFocused = isKeyboardNav && focusedIndex === index;
          return (
            <div
              key={opt.value}
              ref={(el) => {
                itemRefs.current[index] = el;
                if (isSelected) selectedItemRef.current = el;
              }}
              role="option"
              tabIndex={isOpen ? 0 : -1}
              aria-selected={isSelected}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
              onKeyDown={(e) => handleOptionKeyDown(e, index, opt.value)}
              onFocus={() => {
                if (isKeyboardNav) {
                  setFocusedIndex(index);
                }
              }}
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
              onMouseEnter={(e) => {
                setIsKeyboardNav(false);
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

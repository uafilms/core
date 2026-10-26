import React from 'react';

export default function DropdownTrigger({
  triggerRef,
  selectedOption,
  label,
  isOpen,
  onClick,
  onKeyDown,
}) {
  return (
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
      onClick={onClick}
      onKeyDown={onKeyDown}
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
  );
}

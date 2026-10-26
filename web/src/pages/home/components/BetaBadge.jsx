import React from 'react';

export default function BetaBadge() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: 500,
        letterSpacing: '0.04em',
        background: 'var(--error, #ba1a1a)',
        color: 'var(--on-error, #ffffff)',
        marginLeft: '10px',
        lineHeight: '1.2',
      }}
    >
      BETA
    </span>
  );
}

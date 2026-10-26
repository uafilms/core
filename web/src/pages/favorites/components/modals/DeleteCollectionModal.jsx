import React from 'react';
import { createPortal } from 'react-dom';

export default function DeleteCollectionModal({
  collection,
  isClosing,
  onClose,
  onConfirm,
}) {
  if (!collection) return null;

  return createPortal(
    <div
      className={`modal-overlay ${isClosing ? 'closing' : ''}`}
      onClick={onClose}
    >
      <div
        className={`surface-container round medium-elevate modal-dialog ${isClosing ? 'closing' : ''}`}
        style={{
          padding: '24px',
          maxWidth: '400px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <i className="error-text" style={{ fontSize: '28px' }}>delete_forever</i>
          <h5 style={{ margin: 0, fontWeight: 500, fontSize: '1.25rem' }}>Видалити колекцію?</h5>
        </div>

        <p className="surface-variant-text" style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
          Ви впевнені, що хочете видалити колекцію <strong>«{collection.name}»</strong>? Фільми залишаться у вашому загальному обраному.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <button type="button" className="round transparent" onClick={onClose}>
            Скасувати
          </button>
          <button
            type="button"
            className="round"
            style={{ backgroundColor: 'var(--error)', color: 'var(--on-error)' }}
            onClick={onConfirm}
          >
            Видалити
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

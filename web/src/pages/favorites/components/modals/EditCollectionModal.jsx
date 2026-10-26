import React from 'react';
import { createPortal } from 'react-dom';

export default function EditCollectionModal({
  collection,
  isClosing,
  onClose,
  onSubmit,
  name,
  setName,
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
          maxWidth: '420px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="primary-text" style={{ fontSize: '26px' }}>edit</i>
            <h5 style={{ margin: 0, fontWeight: 500, fontSize: '1.25rem' }}>Перейменувати колекцію</h5>
          </div>
          <button type="button" className="circle transparent" onClick={onClose}>
            <i>close</i>
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="field label border round prefix">
            <i>folder</i>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder=" "
              autoFocus
              maxLength={40}
            />
            <label>Назва колекції</label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="round transparent" onClick={onClose}>
              Скасувати
            </button>
            <button type="submit" className="round primary" disabled={!name.trim()}>
              Зберегти
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

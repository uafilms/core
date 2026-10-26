import React from 'react';
import { createPortal } from 'react-dom';

export default function DeleteAccountModal({
  isOpen,
  isClosing,
  onClose,
  onConfirm,
  password,
  setPassword,
  loading,
  error,
}) {
  if (!isOpen && !isClosing) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`modal-overlay ${isClosing ? 'closing' : ''}`}
      onClick={onClose}
    >
      <div
        className={`surface-container round medium-elevate modal-dialog ${isClosing ? 'closing' : ''}`}
        style={{ padding: '24px', maxWidth: '420px', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h5 className="error-text" style={{ margin: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i>warning</i> Видалення акаунту
        </h5>
        <p className="small-text surface-variant-text" style={{ margin: 0 }}>
          Ця дія незворотна. Усі ваші персональні API-ключі та статистика запитів будуть назавжди видалені.
        </p>

        {error && (
          <article className="border error-border round no-margin error-shake" style={{ padding: '10px 14px' }}>
            <span className="error-text small-text">{error}</span>
          </article>
        )}

        <div className="field label border round no-margin">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder=" "
            required
          />
          <label>Введіть ваш пароль для підтвердження</label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <button
            type="button"
            className="button round transparent"
            onClick={onClose}
          >
            Скасувати
          </button>
          <button
            type="button"
            className="button round error"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <progress className="circle small indeterminate"></progress>}
            <span>Підтвердити видалення</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

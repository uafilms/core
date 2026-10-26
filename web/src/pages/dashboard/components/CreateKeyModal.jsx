import React from 'react';
import { createPortal } from 'react-dom';

export default function CreateKeyModal({
  isOpen,
  isClosing,
  onClose,
  createdRawKey,
  newKeyName,
  setNewKeyName,
  onSubmit,
  creating,
  onCopy,
  copiedId,
}) {
  if (!isOpen && !isClosing) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`modal-overlay ${isClosing ? 'closing' : ''}`}
      onClick={() => {
        if (!createdRawKey) onClose();
      }}
    >
      <div
        className={`surface-container round medium-elevate modal-dialog ${isClosing ? 'closing' : ''}`}
        style={{
          padding: '24px',
          maxWidth: '480px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!createdRawKey ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h6 style={{ margin: 0, fontWeight: 500 }}>Новий API-ключ</h6>
              <button type="button" className="circle transparent" onClick={onClose}>
                <i>close</i>
              </button>
            </div>

            <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div className="field label prefix border round" style={{ marginBottom: '6px' }}>
                  <i>vpn_key</i>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder=" "
                    required
                    autoFocus
                  />
                  <label>Назва ключа</label>
                </div>
                <span className="small-text surface-variant-text" style={{ paddingLeft: '8px' }}>
                  Наприклад: Web App, Telegram Bot, Media Player
                </span>
              </div>

              <p className="small-text surface-variant-text" style={{ margin: 0 }}>
                Ключ буде прив'язано до вашого облікового запису. Ви зможете переглядати детальну статистику його використання.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="round transparent" onClick={onClose}>
                  Скасувати
                </button>
                <button type="submit" className="round primary" disabled={creating}>
                  {creating ? 'Створення...' : 'Створити'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="green-text" style={{ color: '#4caf50', fontSize: '28px' }}>check_circle</i>
              <h6 style={{ margin: 0, fontWeight: 500 }}>API-ключ успішно створено!</h6>
            </div>

            <article className="border round error-border" style={{ padding: '12px 14px' }}>
              <p className="small-text error-text" style={{ margin: 0, fontWeight: 500 }}>
                ⚠️ Увага: Скопіюйте цей ключ зараз. З міркувань безпеки він більше ніколи не буде відображений у повному вигляді!
              </p>
            </article>

            <div style={{ background: 'var(--surface-container-high)', padding: '12px', borderRadius: '8px', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '14px' }}>
              {createdRawKey}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                className="round primary"
                onClick={() => onCopy(createdRawKey, 'raw-key')}
              >
                <i>{copiedId === 'raw-key' ? 'done' : 'content_copy'}</i>
                <span>{copiedId === 'raw-key' ? 'Скопійовано!' : 'Скопіювати ключ'}</span>
              </button>
              <button
                className="round transparent border"
                onClick={onClose}
              >
                Готово
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

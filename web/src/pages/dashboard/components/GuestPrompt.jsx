import React from 'react';

export default function GuestPrompt({ onOpenAuthModal }) {
  return (
    <div style={{ padding: '32px 16px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
      <article className="surface-container round medium-elevate" style={{ padding: '40px 24px' }}>
        <i className="primary-text" style={{ fontSize: '64px' }}>vpn_key</i>
        <h4 style={{ margin: '16px 0 8px 0', fontWeight: 500 }}>API</h4>
        <p className="surface-variant-text" style={{ maxWidth: '480px', margin: '0 auto 24px auto' }}>
          Увійдіть або зареєструйтесь, щоб створювати персональні API-ключі, відстежувати статистику запитів та інтегрувати UAFilms у власні додатки.
        </p>
        <button className="round primary extra" onClick={onOpenAuthModal}>
          <i>login</i>
          <span>Увійти або зареєструватися</span>
        </button>
      </article>
    </div>
  );
}

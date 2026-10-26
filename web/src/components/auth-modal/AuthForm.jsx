import React from 'react';

export default function AuthForm({
  tab,
  email,
  setEmail,
  password,
  setPassword,
  tgSession,
  tgVerified,
  tgUsername,
  tgLoading,
  onStartTelegram,
  loading,
  onSubmit,
}) {
  return (
    <div key={tab} className="tab-content-enter">
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="field label prefix border round">
          <i>mail</i>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder=" "
            required
            autoFocus
          />
          <label>Електронна пошта</label>
        </div>

        <div className="field label prefix border round">
          <i>lock</i>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder=" "
            required
          />
          <label>Пароль</label>
        </div>

        {tab === 'register' && (
          <div
            className="round border surface-container-low"
            style={{
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              border: tgVerified ? '1px solid rgba(74, 222, 128, 0.4)' : undefined,
              background: tgVerified ? 'rgba(74, 222, 128, 0.05)' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className={tgVerified ? 'primary-text' : 'secondary-text'}>
                  {tgVerified ? 'check_circle' : 'smart_toy'}
                </i>
                <span style={{ fontWeight: 500, fontSize: '14px' }}>
                  {tgVerified ? 'Telegram підтверджено' : 'Підтвердження через Telegram'}
                </span>
              </div>
              {tgVerified && tgUsername && (
                <span className="small-text surface-variant-text" style={{ fontWeight: 500 }}>
                  @{tgUsername}
                </span>
              )}
            </div>

            {!tgVerified ? (
              <>
                <p className="small-text surface-variant-text" style={{ margin: 0, opacity: 0.85, lineHeight: 1.4 }}>
                  Правило: <b>1 акаунт на користувача Telegram</b>. Натисніть кнопку та запустіть бота (Start).
                </p>
                <button
                  type="button"
                  className="round secondary max"
                  onClick={onStartTelegram}
                  disabled={tgLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    margin: 0,
                    height: '46px',
                  }}
                >
                  {tgLoading ? (
                    <progress className="circle small indeterminate"></progress>
                  ) : (
                    <>
                      <i>send</i>
                      <span>{tgSession ? 'Відкрити бота ще раз' : 'Підтвердити через Telegram'}</span>
                    </>
                  )}
                </button>
                {tgSession && (
                  <span className="small-text surface-variant-text" style={{ textAlign: 'center', opacity: 0.75 }}>
                    Очікуємо натискання Start у боті...
                  </span>
                )}
              </>
            ) : null}
          </div>
        )}

        <button
          type="submit"
          className="round primary max"
          disabled={loading || (tab === 'register' && !tgVerified)}
          style={{ marginTop: '8px', transition: 'all 0.2s cubic-bezier(0.2, 0, 0, 1)' }}
        >
          {loading ? (
            <progress className="circle small indeterminate" style={{ marginRight: '8px' }}></progress>
          ) : (
            <i>{tab === 'login' ? 'check' : 'arrow_forward'}</i>
          )}
          <span>{tab === 'login' ? 'Увійти' : 'Зареєструватися'}</span>
        </button>
      </form>
    </div>
  );
}

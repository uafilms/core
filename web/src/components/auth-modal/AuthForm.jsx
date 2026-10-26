import React from 'react';

export default function AuthForm({
  tab,
  email,
  setEmail,
  password,
  setPassword,
  code,
  setCode,
  onSendCode,
  sendingCode,
  codeSent,
  codeCountdown,
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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div className="field label prefix border round" style={{ flex: 1, margin: 0 }}>
              <i>pin</i>
              <input
                type="text"
                value={code || ''}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder=" "
                maxLength={6}
                required
              />
              <label>Код з пошти (6 цифр)</label>
            </div>
            <button
              type="button"
              className="round border secondary"
              onClick={onSendCode}
              disabled={sendingCode || codeCountdown > 0}
              style={{
                height: '48px',
                minWidth: '125px',
                whiteSpace: 'nowrap',
                margin: 0,
                fontSize: '13px',
              }}
            >
              {sendingCode ? (
                <progress className="circle small indeterminate"></progress>
              ) : codeCountdown > 0 ? (
                <span>{codeCountdown} с</span>
              ) : (
                <span>{codeSent ? 'Надіслати ще раз' : 'Отримати код'}</span>
              )}
            </button>
          </div>
        )}

        <button
          type="submit"
          className="round primary max"
          disabled={loading}
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

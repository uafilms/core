import React from 'react';

export default function AuthForm({
  tab,
  email,
  setEmail,
  password,
  setPassword,
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

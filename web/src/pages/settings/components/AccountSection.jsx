import React from 'react';

export default function AccountSection({
  user,
  logout,
  setIsAuthModalOpen,
  isSyncing,
  syncNow,
  onNavigateDashboard,
  showPwForm,
  setShowPwForm,
  curPw,
  setCurPw,
  newPw,
  setNewPw,
  confirmPw,
  setConfirmPw,
  pwLoading,
  pwMsg,
  setPwMsg,
  onPasswordChange,
  onOpenDeleteDialog,
}) {
  return (
    <article className="round surface-container no-margin" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            className="circle primary-container"
            style={{
              width: '48px',
              height: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <i className="primary-text" style={{ fontSize: '28px' }}>
              {user ? 'account_circle' : 'person_outline'}
            </i>
          </div>
          <div>
            <h6 style={{ margin: 0, fontWeight: 500, fontSize: '17px' }}>
              {user ? 'Обліковий запис' : 'Авторизація'}
            </h6>
            <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
              {user ? user.email : 'Увійдіть для синхронізації обраного, таймстампів і доступу до API.'}
            </p>
          </div>
        </div>

        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button round border no-margin"
              onClick={syncNow}
              disabled={isSyncing}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
              title="Синхронізувати обране та таймстампи"
            >
              <i style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>sync</i>
              <span>{isSyncing ? 'Синхронізація...' : 'Синхронізувати'}</span>
            </button>
            <button
              type="button"
              className="button round primary-container no-margin"
              onClick={onNavigateDashboard}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <i>api</i>
              <span>API</span>
            </button>
            <button
              type="button"
              className="button round border no-margin"
              onClick={() => {
                setShowPwForm((prev) => !prev);
                setPwMsg({ text: '', type: '' });
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <i>lock</i>
              <span>{showPwForm ? 'Сховати' : 'Змінити пароль'}</span>
            </button>
            <button
              type="button"
              className="button round transparent error-text no-margin"
              onClick={logout}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <i>logout</i>
              <span>Вийти</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="button round primary no-margin"
            onClick={() => setIsAuthModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <i>login</i>
            <span>Увійти / Реєстрація</span>
          </button>
        )}
      </div>

      {/* Form to change password */}
      {user && showPwForm && (
        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--outline-variant, rgba(128,128,128,0.2))' }}>
          <h6 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 500 }}>
            Зміна паролю
          </h6>

          {pwMsg.text && (
            <article
              className={`round border no-margin ${pwMsg.type === 'success' ? 'primary-container' : 'error-border'}`}
              style={{ padding: '10px 14px', marginBottom: '16px' }}
            >
              <span className={pwMsg.type === 'success' ? 'primary-text' : 'error-text'} style={{ fontSize: '13px' }}>
                {pwMsg.text}
              </span>
            </article>
          )}

          <form onSubmit={onPasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '400px' }}>
            <div className="field label border round no-margin">
              <input
                type="password"
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
                placeholder=" "
                required
              />
              <label>Поточний пароль</label>
            </div>

            <div className="field label border round no-margin">
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder=" "
                required
              />
              <label>Новий пароль (мін. 6 символів)</label>
            </div>

            <div className="field label border round no-margin">
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder=" "
                required
              />
              <label>Підтвердження нового паролю</label>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="submit"
                className="button round primary"
                disabled={pwLoading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {pwLoading && <progress className="circle small indeterminate"></progress>}
                <span>Зберегти пароль</span>
              </button>
              <button
                type="button"
                className="button round transparent"
                onClick={() => setShowPwForm(false)}
              >
                Скасувати
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Danger zone / delete account */}
      {user && (
        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="button transparent error-text"
            onClick={onOpenDeleteDialog}
            style={{ fontSize: '12px', padding: '4px 8px', textDecoration: 'underline' }}
          >
            Видалити обліковий запис
          </button>
        </div>
      )}
    </article>
  );
}

import React from 'react';

export default function NewCollectionForm({
  isCreating,
  setIsCreating,
  newColName,
  setNewColName,
  onSubmit,
}) {
  if (isCreating) {
    return (
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div className="field label border round prefix" style={{ flex: 1, margin: 0 }}>
          <i>playlist_add</i>
          <input
            type="text"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder=" "
            autoFocus
            maxLength={40}
          />
          <label>Назва нової колекції</label>
        </div>
        <button type="submit" className="round primary" disabled={!newColName.trim()} style={{ height: '48px', padding: '0 16px' }}>
          Створити
        </button>
        <button
          type="button"
          className="circle transparent"
          onClick={() => {
            setIsCreating(false);
            setNewColName('');
          }}
          style={{ height: '48px', width: '48px' }}
        >
          <i>close</i>
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      className="round border"
      onClick={() => setIsCreating(true)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '42px' }}
    >
      <i>add</i>
      <span>Нова колекція</span>
    </button>
  );
}

import React, { useState } from 'react';
import { filterText } from './utils/filter';

export default function CommentItem({ comment, filterProfanity }) {
  const displayText = filterProfanity ? filterText(comment.text, true) : comment.text;
  const [imgError, setImgError] = useState(false);

  const initial = (comment.author || '?')[0].toUpperCase();

  return (
    <li style={{ listStyle: 'none', marginLeft: '0', marginTop: '16px' }}>
      <div className="row top-align no-space" style={{ gap: '16px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            minWidth: '40px',
            borderRadius: '50%',
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: comment.avatar && !imgError ? 'transparent' : 'var(--surface-container-highest)',
          }}
        >
          {comment.avatar && !imgError ? (
            <img
              src={comment.avatar}
              alt={comment.author}
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                objectFit: 'cover',
                display: 'block',
              }}
              onError={() => setImgError(true)}
            />
          ) : (
            <span
              className="primary-text"
              style={{ fontSize: '15px', fontWeight: 600, userSelect: 'none' }}
            >
              {initial}
            </span>
          )}
        </div>
        <div className="max">
          <article className="round surface-container no-margin padding">
            <div
              className="row middle-align"
              style={{
                justifyContent: 'space-between',
                marginBottom: '6px',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div className="row middle-align" style={{ gap: '8px' }}>
                <span className="primary-text" style={{ fontWeight: 600, fontSize: '14px' }}>
                  {comment.author}
                </span>
                {comment.group && (
                  <span
                    className="small-text surface-variant-text"
                    style={{
                      fontSize: '11px',
                      opacity: 0.7,
                      border: '1px solid var(--outline-variant)',
                      borderRadius: '4px',
                      padding: '1px 6px',
                    }}
                  >
                    {comment.group}
                  </span>
                )}
              </div>
              <div className="row middle-align" style={{ gap: '10px' }}>
                {comment.rating !== undefined && comment.rating !== 0 && (
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: comment.rating > 0 ? '#4caf50' : '#f44336',
                    }}
                  >
                    {comment.rating > 0 ? `+${comment.rating}` : comment.rating}
                  </span>
                )}
                <span className="small-text surface-variant-text" style={{ fontSize: '12px', opacity: 0.8 }}>
                  {comment.date}
                </span>
              </div>
            </div>
            <div
              style={{
                fontSize: '14px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {displayText}
            </div>
          </article>
        </div>
      </div>

      {comment.children && comment.children.length > 0 && (
        <ul
          style={{
            paddingLeft: '24px',
            borderLeft: '2px solid var(--outline-variant)',
            marginLeft: '20px',
            marginTop: '8px',
          }}
        >
          {comment.children.map((child, idx) => (
            <CommentItem key={child.id || idx} comment={child} filterProfanity={filterProfanity} />
          ))}
        </ul>
      )}
    </li>
  );
}

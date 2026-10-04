import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { findAndFilter } from 'swearify';

const filterText = (text, enabled) => {
  if (!enabled || !text) return text;
  const result = findAndFilter(text, '*', ['uk', 'ru', 'en']);
  return result.filtered_sentense;
};

const CommentItem = ({ comment, filterProfanity }) => {
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
};

const Comments = ({ imdbId, title, originalTitle, year }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filterProfanity, setFilterProfanity] = useState(false);

  useEffect(() => {
    const settings = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
    setFilterProfanity(settings.filterProfanity || false);
  }, []);

  useEffect(() => {
    setComments([]);
    setPage(1);
    setHasMore(true);
    if (imdbId || title || originalTitle) {
      fetchComments(1);
    }
  }, [imdbId, title, originalTitle, year]);

  const mapBackendComments = (backendComments) => {
    if (!Array.isArray(backendComments)) return [];
    return backendComments.map((c) => ({
      id: c.id,
      author: typeof c.author === 'object' ? c.author?.name || 'Гість' : c.author || 'Гість',
      avatar: typeof c.author === 'object' ? c.author?.avatar || '' : c.avatar || '',
      group: typeof c.author === 'object' ? c.author?.group : undefined,
      rating: c.rating,
      date: c.date,
      text: c.text || '',
      children: c.replies && c.replies.length > 0 ? mapBackendComments(c.replies) : [],
    }));
  };

  const fetchComments = async (pageNum) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (imdbId) params.append('imdb_id', imdbId);
      if (title) params.append('title', title);
      if (originalTitle) params.append('original_title', originalTitle);
      if (year) params.append('year', String(year));
      params.append('page', String(pageNum));

      const res = await api.get(`/comments?${params.toString()}`);

      const rawList = Array.isArray(res.data) ? res.data : res.data?.comments || [];
      const mapped = mapBackendComments(rawList);

      if (mapped.length === 0) {
        setHasMore(false);
      } else {
        const headerHasMore = res.headers?.['x-has-more'];
        const serverHasMore = headerHasMore !== undefined ? headerHasMore === 'true' : res.data?.hasMore;

        if (serverHasMore === false) {
          setHasMore(false);
        } else if (serverHasMore === true) {
          setHasMore(true);
        } else if (mapped.length < 20) {
          setHasMore(false);
        }

        if (pageNum === 1) {
          setComments(mapped);
        } else {
          setComments((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            const uniqueNew = mapped.filter((c) => !existingIds.has(c.id));
            return [...prev, ...uniqueNew];
          });
        }
      }
    } catch (e) {
      console.error('Failed to load comments', e);
    }
    setLoading(false);
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchComments(nextPage);
  };

  if (!imdbId && !title && !originalTitle) {
    return null;
  }

  return (
    <div style={{ marginTop: '40px', maxWidth: '800px' }}>
      <h5 style={{ fontWeight: 600, marginBottom: '16px' }}>Коментарі</h5>

      <ul style={{ padding: 0, margin: 0 }}>
        {comments.map((c, i) => (
          <CommentItem key={c.id || i} comment={c} filterProfanity={filterProfanity} />
        ))}
      </ul>

      {loading && (
        <div className="row center-align middle-align" style={{ padding: '20px' }}>
          <progress className="circle indeterminate"></progress>
        </div>
      )}

      {!loading && hasMore && comments.length > 0 && (
        <div className="row center-align middle-align" style={{ marginTop: '20px' }}>
          <button className="border surface-container-low fill" onClick={handleLoadMore}>
            Завантажити ще коментарі
          </button>
        </div>
      )}

      {!loading && comments.length === 0 && (
        <div className="surface-variant-text" style={{ opacity: 0.7 }}>
          Коментарів поки немає.
        </div>
      )}
    </div>
  );
};

export default Comments;

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

  return (
    <li style={{ listStyle: 'none', marginLeft: '0', marginTop: '16px' }}>
      <div className="row top-align no-space" style={{ gap: '16px' }}>
        <img
          src={comment.avatar}
          alt={comment.author}
          className="circle"
          style={{
            width: '40px',
            height: '40px',
            objectFit: 'cover',
            minWidth: '40px',
            backgroundColor: '#333',
          }}
          onError={(e) => (e.target.style.display = 'none')}
        />
        <div className="max">
          <article className="round surface-container no-margin padding">
            <div className="row middle-align" style={{ justifyContent: 'space-between', marginBottom: '6px' }}>
              <span className="primary-text" style={{ fontWeight: 600, fontSize: '14px' }}>
                {comment.author}
              </span>
              <span className="small-text surface-variant-text" style={{ fontSize: '12px', opacity: 0.8 }}>
                {comment.date}
              </span>
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
        <ul style={{ paddingLeft: '24px', borderLeft: '2px solid var(--outline-variant)', marginLeft: '20px', marginTop: '8px' }}>
          {comment.children.map((child, idx) => (
            <CommentItem key={idx} comment={child} filterProfanity={filterProfanity} />
          ))}
        </ul>
      )}
    </li>
  );
};

const Comments = ({ imdbId }) => {
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
    if (imdbId) {
      fetchComments(1);
    }
  }, [imdbId]);

  const mapBackendComments = (backendComments) => {
    return backendComments.map((c) => ({
      id: c.id,
      author: c.author.name || 'Гість',
      avatar: c.author.avatar || '',
      date: c.date,
      text: c.text || '',
      children: c.replies ? mapBackendComments(c.replies) : [],
    }));
  };

  const fetchComments = async (pageNum) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (imdbId) params.append('imdb_id', imdbId);
      params.append('page', pageNum);

      const res = await api.get(`/comments?${params.toString()}`);

      if (res.data && Array.isArray(res.data)) {
        const mapped = mapBackendComments(res.data);

        if (mapped.length === 0) {
          setHasMore(false);
        } else {
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

  if (!loading && comments.length === 0 && page === 1) return null;

  return (
    <div style={{ marginTop: '40px', maxWidth: '800px' }}>
      <h5 style={{ fontWeight: 600, marginBottom: '16px' }}>Коментарі</h5>

      <ul style={{ padding: 0, margin: 0 }}>
        {comments.map((c, i) => (
          <CommentItem key={i} comment={c} filterProfanity={filterProfanity} />
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

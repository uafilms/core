import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import CommentItem from './CommentItem';

export default function Comments({ imdbId, title, originalTitle, year }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filterProfanity, setFilterProfanity] = useState(false);

  useEffect(() => {
    const settings = JSON.parse(localStorage.getItem('uafilms_settings') || '{}');
    setFilterProfanity(settings.filterProfanity || false);
  }, []);

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

  useEffect(() => {
    setComments([]);
    setPage(1);
    setHasMore(true);
    if (imdbId || title || originalTitle) {
      fetchComments(1);
    }
  }, [imdbId, title, originalTitle, year]);

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
}

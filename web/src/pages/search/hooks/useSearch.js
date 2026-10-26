import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../../api/axios';

export function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);

  const timerRef = useRef(null);

  const addToHistory = (searchQuery) => {
    const history = JSON.parse(localStorage.getItem('uafilms_search_history') || '[]');
    const newHistory = [searchQuery, ...history.filter((h) => h !== searchQuery)].slice(0, 10);
    localStorage.setItem('uafilms_search_history', JSON.stringify(newHistory));
  };

  const performSearch = useCallback(async (searchQuery, pageNum = 1) => {
    if (!searchQuery.trim()) return;
    setLoading(true);

    if (pageNum === 1) {
      addToHistory(searchQuery);
    }

    try {
      const res = await api.get(`/search?q=${encodeURIComponent(searchQuery)}&page=${pageNum}`);
      if (pageNum === 1) {
        setResults(res.data.results || []);
      } else {
        setResults((prev) => [...prev, ...res.data.results]);
      }

      setTotalPages(Number(res.data.total_pages) || 0);
      setPage(Number(pageNum));
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qParam = params.get('q');
    if (qParam && qParam !== query) {
      setQuery(qParam);
      performSearch(qParam, 1);
    }
  }, [performSearch]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (query) {
      timerRef.current = setTimeout(() => {
        performSearch(query, 1);
      }, 3000);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, performSearch]);

  const handleManualSearch = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    performSearch(query, 1);
  }, [query, performSearch]);

  const loadMore = useCallback(() => {
    if (page < totalPages && !loading) {
      performSearch(query, page + 1);
    }
  }, [page, totalPages, loading, query, performSearch]);

  return {
    query,
    setQuery,
    results,
    page,
    totalPages,
    loading,
    handleManualSearch,
    loadMore,
  };
}

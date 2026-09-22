import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { findAndFilter } from 'swearify';

import 'mdui/components/button.js';
import 'mdui/components/circular-progress.js';

const filterText = (text, enabled) => {
    if (!enabled || !text) return text;
    const result = findAndFilter(text, '*', ['uk', 'ru', 'en']);
    return result.filtered_sentense;
};

const CommentItem = ({ comment, filterProfanity }) => {
    const displayText = filterProfanity ? filterText(comment.text, true) : comment.text;

    return (
        <li style={{ listStyle: 'none', marginLeft: '0', marginTop: '16px' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
                <img 
                    src={comment.avatar} 
                    alt={comment.author} 
                    style={{ 
                        width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover',
                        minWidth: '40px', backgroundColor: '#333'
                    }}
                    onError={(e) => e.target.style.display = 'none'} 
                />
                <div style={{ flex: 1 }}>
                    <div style={{ 
                        background: 'rgb(var(--mdui-color-surface-container))', 
                        padding: '12px 16px', borderRadius: '16px',
                        border: '1px solid rgb(var(--mdui-color-outline-variant))'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center' }}>
                            <span style={{ fontWeight: '600', color: 'rgb(var(--mdui-color-primary))', fontSize: '14px' }}>
                                {comment.author}
                            </span>
                            <span style={{ fontSize: '12px', color: 'rgb(var(--mdui-color-outline))', opacity: 0.8 }}>
                                {comment.date}
                            </span>
                        </div>
                        <div style={{ 
                            fontSize: '14px', 
                            lineHeight: '1.5', 
                            color: 'rgb(var(--mdui-color-on-surface))',
                            whiteSpace: 'pre-wrap', 
                            wordBreak: 'break-word'
                        }}>
                            {displayText}
                        </div>
                    </div>
                </div>
            </div>
            
            {comment.children && comment.children.length > 0 && (
                <ul style={{ paddingLeft: '24px', borderLeft: '2px solid rgb(var(--mdui-color-outline-variant))', marginLeft: '20px', marginTop: '8px' }}>
                    {comment.children.map((child, idx) => (
                        <CommentItem key={idx} comment={child} filterProfanity={filterProfanity} />
                    ))}
                </ul>
            )}
        </li>
    );
};

const Comments = ({ title, imdbId }) => {
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
        return backendComments.map(c => ({
            id: c.id,
            author: c.author.name || 'Гість',
            avatar: c.author.avatar || '',
            date: c.date,
            text: c.text || '', 
            children: c.replies ? mapBackendComments(c.replies) : []
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
                        setComments(prev => {
                            const existingIds = new Set(prev.map(c => c.id));
                            const uniqueNew = mapped.filter(c => !existingIds.has(c.id));
                            return [...prev, ...uniqueNew];
                        });
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load comments", e);
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
            <h3 style={{ fontSize: '20px', marginBottom: '16px', color: 'rgb(var(--mdui-color-on-surface))' }}>
                Коментарі
            </h3>
            
            <ul style={{ padding: 0, margin: 0 }}>
                {comments.map((c, i) => <CommentItem key={i} comment={c} filterProfanity={filterProfanity} />)}
            </ul>
            
            {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><mdui-circular-progress indeterminate></mdui-circular-progress></div>}

            {!loading && hasMore && comments.length > 0 && (
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
                    <mdui-button variant="outlined"
                        onClick={handleLoadMore}
                        style={{ width: '100%' }}
                    >
                        Завантажити ще коментарі
                    </mdui-button>
                </div>
            )}

            {!loading && comments.length === 0 && (
                <div style={{ color: 'rgb(var(--mdui-color-outline-variant))' }}>Коментарів поки немає.</div>
            )}
        </div>
    );
};

export default Comments;
import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../api/axios';
import pLimit from 'p-limit';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { parseTorrentTitle } from '../utils/parser';

import 'mdui/components/icon.js';
import 'mdui/components/checkbox.js';
import 'mdui/components/button.js';
import 'mdui/components/button-icon.js';
import 'mdui/components/chip.js';
import 'mdui/components/linear-progress.js';
import 'mdui/components/circular-progress.js';
import 'mdui/components/select.js';
import 'mdui/components/menu-item.js';

const sanitizeFilename = (filename) => {
    return filename.replace(/[:/\\?%*|"<>]/g, '_');
};

const formatProviderName = (provider) => {
    const map = {
        'ashdi': 'Ashdi',
        'tortuga': 'Tortuga',
        'hdvb': 'HDVB',
        'uaflix': 'UAFlix',
        'moonanime': 'MoonAnime',
        'uembed': '🇬🇧 UEmbed',
    };
    return map[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
};

const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const cleanBadgeLabel = (label) => {
    if (!label) return '';
    return label.replace(/^([A-Za-zА-Яа-яїієґ0-9]+)\s?-\s?\1/i, '$1 -');
};

const cleanTrackTitle = (title) => {
    if (!title) return '';
    let cleaned = title
        .replace(/\b(ac-?3|dts(-hd)?( ma)?( hra)?|truehd|atmos|aac|mp3|eac3|flac|pcm|vorbis|wav)\b/gi, '')
        .replace(/\b\d+(\.\d+)?\s*(ch|channels|каналів|kbps|кбіт\/c|hz|khz|bit|mbps)\b/gi, '')
        .replace(/\b(dub|дубляж|проф\.|професійний|багатоголосий|двополосий|одноголосий|аматорський|любительський|original|оригінал)\b/gi, '')
        .replace(/\b(ukr|eng|rus|ukrainian|english|russian|jpa|jpn)\b/gi, '')
        .replace(/\[\s*\]|\(\s*\)/g, '')
        .replace(/^[\s\W]+|[\s\W]+$/g, '')
        .replace(/\s+[\/\-@,|]\s+/g, ' ') 
        .replace(/\s+/g, ' ')
        .trim();

    if (/^[^a-zA-Zа-яА-Яїicєґ0-9]+$/.test(cleaned) || cleaned.length < 2) return null;
    return cleaned;
};

const formatLang = (lang) => {
    if (!lang || lang === 'und' || lang === 'mis') return 'UNK';
    return lang.toUpperCase().slice(0, 3);
};

const getQualityIcon = (title, ffprobe, mediaInfo) => {
    const lowerTitle = title.toLowerCase();
    
    if (mediaInfo?.video?.[0]) {
        const w = mediaInfo.video[0].width;
        if (w >= 3800) return '4k';
        if (w >= 2500) return '2k';
        if (w >= 1900) return 'full_hd';
        if (w >= 1200) return 'hd';
        return 'sd';
    }

    const width = ffprobe?.find(s => s.codec_type === 'video')?.width || 0;
    if (width > 0) {
        if (width >= 3800) return '4k';
        if (width >= 1900) return 'full_hd';
        if (width >= 1200) return 'hd'; 
        return 'sd';
    }

    if (lowerTitle.includes('2160') || lowerTitle.includes('4k')) return '4k';
    if (lowerTitle.includes('1440') || lowerTitle.includes('2k')) return '2k';
    if (lowerTitle.includes('1080')) return 'full_hd';
    if (lowerTitle.includes('720')) return 'hd'; 
    
    return 'high_quality'; 
};

const getVideoBadges = (item) => {
    const badges = [];
    const title = item.Title.toLowerCase();
    const probe = item.ffprobe;
    const info = item.MediaInfo;

    badges.push({ icon: getQualityIcon(item.Title, probe, info), type: 'quality' });

    let isHevc = false;
    if (info?.video?.[0]?.codec === 'hevc') isHevc = true;
    else if (probe?.some(s => s.codec_name === 'hevc')) isHevc = true;
    else if (title.includes('hevc') || title.includes('x265') || title.includes('h.265')) isHevc = true;

    if (isHevc) {
        badges.push({ icon: 'hevc', type: 'codec' });
    }

    let isHdr = false;
    let isDv = false;

    if (info?.tags?.includes('HDR') || info?.video?.[0]?.hdr) isHdr = true;
    else if (title.includes('hdr') || probe?.some(s => s.tags?.DURATION && item.jacredInfo?.videotype === 'hdr')) isHdr = true;

    if (info?.tags?.includes('Dolby Vision') || title.includes('dolby vision') || title.includes('dv')) isDv = true;
    
    if (isHdr || isDv) {
        badges.push({ icon: 'hdr_on', type: 'hdr' });
    }

    return [...new Map(badges.map(item => [item.icon, item])).values()];
};

const Downloader = ({ id, title, originalTitle, year, type, providers, onClose }) => {
    const [activeTab, setActiveTab] = useState('providers');
    const [selectedProvider, setSelectedProvider] = useState(null);
    const [cfToken, setCfToken] = useState(null);

    const [torrents, setTorrents] = useState([]);
    const [loadingTorrents, setLoadingTorrents] = useState(false);
    
    const [filterTracker, setFilterTracker] = useState('All');
    const [filterQuality, setFilterQuality] = useState('All');
    const [filterCodec, setFilterCodec] = useState('All');
    const [filterAudio, setFilterAudio] = useState('All');
    const [filterSub, setFilterSub] = useState('All');
    const [sortBy, setSortBy] = useState('seeders');

    const [downloadState, setDownloadState] = useState({
        isDownloading: false,
        overallProgress: 0,
        speed: '0 KB/s',
        eta: '--:--',
        status: '',
        fileName: '',
        currentFileIndex: 0,
        totalFiles: 1,
        loaded: '0 B'
    });

    const [showSeriesModal, setShowSeriesModal] = useState(false);
    const [selectedEpisodes, setSelectedEpisodes] = useState({});
    
    const abortController = useRef(null);
    const filterContainerRef = useRef(null);

    useEffect(() => {
        if (window.cfToken) {
            setCfToken(window.cfToken);
        } else {
            const handler = () => setCfToken(window.cfToken);
            window.addEventListener('cf_token_ready', handler);
            const timer = setInterval(() => {
                if (window.cfToken) {
                    setCfToken(window.cfToken);
                    clearInterval(timer);
                }
            }, 500);
            return () => {
                window.removeEventListener('cf_token_ready', handler);
                clearInterval(timer);
            };
        }
    }, []);

    useEffect(() => {
        const container = filterContainerRef.current;
        if (!container) return;
        const handler = (e) => {
            const select = e.target.closest('mdui-select');
            if (!select) return;
            const value = select.value;
            const label = select.getAttribute('label');
            switch (label) {
                case 'Трекер': setFilterTracker(value); break;
                case 'Якість': setFilterQuality(value); break;
                case 'Кодек': setFilterCodec(value); break;
                case 'Аудіо': setFilterAudio(value); break;
                case 'Субтитри': setFilterSub(value); break;
                case 'Сортування': setSortBy(value); break;
            }
        };
        container.addEventListener('change', handler);
        return () => container.removeEventListener('change', handler);
    }, []);

    const availableProviders = useMemo(() => {
        if (!providers || typeof providers !== 'object') return [];
        const list = Object.keys(providers);
        const order = ['ashdi', 'tortuga', 'hdvb', 'uaflix', 'moonanime', 'uembed'];
        return list.sort((a, b) => {
            const indexA = order.indexOf(a);
            const indexB = order.indexOf(b);
            return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });
    }, [providers]);

    useEffect(() => {
        if (availableProviders.length > 0 && !selectedProvider) {
            setSelectedProvider(availableProviders[0]);
        }
    }, [availableProviders, selectedProvider]);

    const fetchTorrents = async () => {
        if (torrents.length > 0) return;
        setLoadingTorrents(true);
        try {
            const res = await api.get('/torrents', {
                params: { tmdbId: id, type: type }
            });
            const parsed = res.data.map(t => ({
                ...t,
                parsed: parseTorrentTitle(t.Title)
            }));
            setTorrents(parsed);
        } catch (e) { console.error("Torrent fetch error", e); }
        setLoadingTorrents(false);
    };

    const filterOptions = useMemo(() => {
        const trackers = new Set(['All']);
        const qualities = new Set(['All']);
        const codecs = new Set(['All']);
        const audios = new Set(['All']);
        const subs = new Set(['All']);

        torrents.forEach(t => {
            if (t.Tracker) trackers.add(t.Tracker);
            
            const qIcon = getQualityIcon(t.Title, t.ffprobe, t.MediaInfo);
            let qName = 'Other';
            if (qIcon === '4k') qName = '4K';
            else if (qIcon === '2k') qName = '2K';
            else if (qIcon === 'full_hd') qName = '1080p';
            else if (qIcon === 'hd') qName = '720p';
            else if (qIcon === 'sd') qName = 'SD';
            qualities.add(qName);

            let isHevc = false;
            if (t.MediaInfo?.video?.[0]?.codec === 'hevc') isHevc = true;
            else if (t.Title.toLowerCase().includes('hevc') || t.Title.toLowerCase().includes('x265')) isHevc = true;
            
            if (isHevc) codecs.add('H.265 (HEVC)');
            else codecs.add('H.264 (AVC)');

            if (t.MediaInfo?.audio) {
                t.MediaInfo.audio.forEach(a => {
                    if (a.language) audios.add(a.language);
                    else if (a.title && a.title.includes('ukr')) audios.add('ukr'); 
                });
            } else if (t.jacredInfo?.audioList) {
                t.jacredInfo.audioList.forEach(a => {
                    const lang = a.split(' - ')[0].trim();
                    if (lang) audios.add(lang);
                });
            }

            if (t.MediaInfo?.subtitles) {
                t.MediaInfo.subtitles.forEach(s => {
                     if (s.language) subs.add(s.language);
                });
            } else if (t.jacredInfo?.subList) {
                t.jacredInfo.subList.forEach(s => {
                    const lang = s.split(' ')[0].trim();
                    if (lang && lang.toLowerCase() !== 'субтитри') subs.add(lang);
                });
            }
        });

        return {
            trackers: Array.from(trackers),
            qualities: Array.from(qualities),
            codecs: Array.from(codecs),
            audios: Array.from(audios),
            subs: Array.from(subs)
        };
    }, [torrents]);

    const filteredTorrents = useMemo(() => {
        let result = torrents.filter(t => {
            if (filterTracker !== 'All' && t.Tracker !== filterTracker) return false;
            
            if (filterQuality !== 'All') {
                const qIcon = getQualityIcon(t.Title, t.ffprobe, t.MediaInfo);
                let qName = 'Other';
                if (qIcon === '4k') qName = '4K';
                else if (qIcon === '2k') qName = '2K';
                else if (qIcon === 'full_hd') qName = '1080p';
                else if (qIcon === 'hd') qName = '720p';
                else if (qIcon === 'sd') qName = 'SD';
                if (qName !== filterQuality) return false;
            }

            const isHevc = t.MediaInfo?.video?.[0]?.codec === 'hevc' || t.Title.toLowerCase().includes('hevc') || t.Title.toLowerCase().includes('x265');
            const cVal = isHevc ? 'H.265 (HEVC)' : 'H.264 (AVC)';
            if (filterCodec !== 'All' && cVal !== filterCodec) return false;

            if (filterAudio !== 'All') {
                let hasAudio = false;
                if (t.MediaInfo?.audio) hasAudio = t.MediaInfo.audio.some(a => a.language?.includes(filterAudio) || a.title?.includes(filterAudio));
                else hasAudio = t.jacredInfo?.audioList?.some(a => a.includes(filterAudio));
                if (!hasAudio) return false;
            }

            if (filterSub !== 'All') {
                let hasSub = false;
                if (t.MediaInfo?.subtitles) hasSub = t.MediaInfo.subtitles.some(s => s.language?.includes(filterSub));
                else hasSub = t.jacredInfo?.subList?.some(s => s.includes(filterSub));
                if (!hasSub) return false;
            }

            return true;
        });

        result.sort((a, b) => {
            if (sortBy === 'seeders') return (b.Seeders || 0) - (a.Seeders || 0);
            if (sortBy === 'leechers') return (b.Peers || 0) - (a.Peers || 0);
            if (sortBy === 'size') return (b.Size || 0) - (a.Size || 0);
            return 0;
        });

        return result;
    }, [torrents, filterTracker, filterQuality, filterCodec, filterAudio, filterSub, sortBy]);

    const fetchWithRetry = async (url, options, retries = 5, delay = 1000) => {
        try {
            const headers = options.headers || {};
            if (window.cfToken && window.cfToken !== 'disabled') {
                headers['cf-turnstile-response'] = window.cfToken;
            }
            const enhancedOptions = { ...options, headers, referrerPolicy: 'no-referrer' };
            const res = await fetch(url, enhancedOptions);
            if (!res.ok) {
                if (res.status === 404) throw new Error("File not found (404)");
                throw new Error(`HTTP ${res.status}`);
            }
            return res;
        } catch (err) {
            if (retries > 0 && !options.signal?.aborted) {
                await new Promise(r => setTimeout(r, delay));
                return fetchWithRetry(url, options, retries - 1, delay * 1.5);
            }
            throw err;
        }
    };

    const downloadDirectStream = async (url, onProgress, signal) => {
        const response = await fetchWithRetry(url, { signal });
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;
        const startTime = Date.now();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = elapsed > 0 ? loaded / elapsed : 0;
            const percent = total ? Math.round((loaded / total) * 100) : 0;
            const eta = (total && speed > 0) ? (total - loaded) / speed : 0;
            onProgress({percent, speed: formatBytes(speed) + '/s', eta: new Date(eta * 1000).toISOString().substr(11, 8), loaded: formatBytes(loaded)});
        }
        return new Blob(chunks, { type: 'video/x-matroska' });
    };
    
    const downloadHLSSegments = async (segmentUrls, baseUrl, onProgress, signal) => {
        const totalSegments = segmentUrls.length;
        const chunks = new Array(totalSegments);
        let downloadedCount = 0; let loadedBytes = 0; const startTime = Date.now();
        const limit = pLimit(5);
        const tasks = segmentUrls.map((segUrl, index) => limit(async () => {
            if (signal.aborted) return;
            const fullUrl = new URL(segUrl, baseUrl).href;
            try {
                const res = await fetchWithRetry(fullUrl, { signal });
                const blob = await res.blob();
                chunks[index] = blob;
                downloadedCount++;
                loadedBytes += blob.size;
                const elapsed = (Date.now() - startTime) / 1000;
                const speed = elapsed > 0 ? loadedBytes / elapsed : 0;
                const avgSegSize = loadedBytes / downloadedCount;
                const totalEstBytes = avgSegSize * totalSegments;
                const remaining = totalEstBytes - loadedBytes;
                const eta = speed > 0 ? remaining / speed : 0;
                onProgress({percent: Math.round((downloadedCount / totalSegments) * 100), speed: formatBytes(speed) + '/s', eta: new Date(eta * 1000).toISOString().substr(11, 8), loaded: formatBytes(loadedBytes)});
            } catch (e) { if (!signal.aborted) console.error(`Segment ${index} failed:`, e); throw e; }
        }));
        await Promise.all(tasks);
        return new Blob(chunks, { type: 'video/mp2t' });
    };

    const processDownload = async (initialUrl, onProgress, signal) => {
        let isM3U8 = initialUrl.includes('.m3u8');
        
        if (!isM3U8) {
            try {
                 const headRes = await fetchWithRetry(initialUrl, { method: 'HEAD', signal });
                 const cType = headRes.headers.get('content-type');
                 if (cType && (cType.includes('mpegurl') || cType.includes('hls'))) {
                     isM3U8 = true;
                 }
            } catch (e) {
                 console.warn("HEAD request failed, assuming direct file");
            }
        }

        if (isM3U8) {
            const res = await fetchWithRetry(initialUrl, { signal });
            const fullText = await res.text();
            
            if (fullText.includes('#EXTM3U')) {
                const lines = fullText.split('\n');
                if (fullText.includes('#EXT-X-STREAM-INF')) {
                    let streamUrl = null;
                    for (let i = 0; i < lines.length; i++) { if (lines[i].startsWith('#EXT-X-STREAM-INF')) { streamUrl = lines[i+1]?.trim(); break; } }
                    if (streamUrl) { const nextUrl = new URL(streamUrl, initialUrl).href; return processDownload(nextUrl, onProgress, signal); }
                }
                const segments = lines.map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.length > 0);
                if (segments.length > 0) { return downloadHLSSegments(segments, initialUrl, onProgress, signal); }
            }
        }

        return downloadDirectStream(initialUrl, onProgress, signal);
    };

    const getStreamUrl = (provider, isMovie, sNum, eNum) => {
        let foundSource = null;
        if (!providers || !providers[provider]) return null;

        const provData = providers[provider];

        if (isMovie) {
            if (Array.isArray(provData) && provData.length > 0) {
                foundSource = provData[0];
            }
        } else {
            const sKey = String(sNum);
            const eKey = String(eNum);
            if (provData[sKey] && provData[sKey][eKey] && provData[sKey][eKey].length > 0) {
                foundSource = provData[sKey][eKey][0];
            }
        }

        if (!foundSource || !foundSource.url) return null;
        
        let url = foundSource.url;
        return url;
    };

    const handleMovieDownload = async (quality) => {
        if (downloadState.isDownloading) return;
        abortController.current = new AbortController();
        const signal = abortController.current.signal;
        setDownloadState({ isDownloading: true, overallProgress: 0, fileProgress: 0, status: 'Отримання посилання...', eta: '--:--', speed: '0 KB/s', fileName: '', totalFiles: 1, currentFileIndex: 1, loaded: '0 B' });
        try {
            const targetUrl = getStreamUrl(selectedProvider, true);
            if (!targetUrl) throw new Error(`URL не знайдено для провайдера ${selectedProvider}`);
            
            const providerFormatted = formatProviderName(selectedProvider);
            const rawName = `${title || originalTitle} (${year}) ${quality}p [${providerFormatted}].mkv`;
            const finalName = sanitizeFilename(rawName);
            setDownloadState(prev => ({ ...prev, status: `Аналіз потоку...`, fileName: finalName }));
            
            const progressCallback = (stats) => { 
                setDownloadState(prev => ({ ...prev, overallProgress: stats.percent, speed: stats.speed, eta: stats.eta, loaded: stats.loaded, status: `Завантаження...` })); 
            };
            
            const blob = await processDownload(targetUrl, progressCallback, signal);
            
            if (!signal.aborted) { 
                setDownloadState(prev => ({ ...prev, status: 'Збереження файлу...' })); 
                saveAs(blob, finalName); 
                setDownloadState(prev => ({ ...prev, isDownloading: false, status: 'Завершено!' })); 
            }
        } catch (e) { 
            if (e.name !== 'AbortError') { 
                console.error(e); 
                setDownloadState(prev => ({ ...prev, isDownloading: false, status: `Помилка: ${e.message}` })); 
                alert(`Помилка: ${e.message}`); 
            } 
        }
    };

    const handleSeriesDownload = async () => {
        if (!selectedEpisodes || Object.keys(selectedEpisodes).length === 0) return;
        setShowSeriesModal(false);
        abortController.current = new AbortController();
        const signal = abortController.current.signal;
        let totalEpisodes = 0; Object.values(selectedEpisodes).forEach(arr => totalEpisodes += arr.length);
        setDownloadState({ isDownloading: true, overallProgress: 0, fileProgress: 0, status: 'Підготовка...', eta: '--:--', speed: '0 KB/s', totalFiles: totalEpisodes, currentFileIndex: 0, loaded: '0 B' });
        try {
            const zip = new JSZip();
            const seasonKeys = Object.keys(selectedEpisodes);
            let processed = 0;
            for (const sKey of seasonKeys) {
                if (signal.aborted) break;
                const seasonNum = parseInt(sKey);
                const episodesToDL = selectedEpisodes[sKey];
                const seasonFolder = zip.folder(`Season ${sKey}`);
                for (const epNum of episodesToDL) {
                    if (signal.aborted) break;
                    setDownloadState(prev => ({ ...prev, currentFileIndex: processed + 1, status: `Підготовка S${sKey}E${epNum}...`, loaded: '0 B' }));
                    
                    const targetUrl = getStreamUrl(selectedProvider, false, seasonNum, epNum);

                    if (targetUrl) {
                        const rawName = `${title} S${sKey}E${epNum}.mkv`;
                        const fileName = sanitizeFilename(rawName);
                        setDownloadState(prev => ({ ...prev, fileName: fileName, status: `Завантаження...` }));
                        const progressCallback = (stats) => { const overall = Math.round(((processed + (stats.percent / 100)) / totalEpisodes) * 100); setDownloadState(prev => ({ ...prev, fileProgress: stats.percent, overallProgress: overall, speed: stats.speed, eta: stats.eta, loaded: stats.loaded })); };
                        const blob = await processDownload(targetUrl, progressCallback, signal);
                        if (!signal.aborted) { seasonFolder.file(fileName, blob); }
                    } else {
                        console.error(`Link not found for S${sKey}E${epNum}`);
                    }
                    processed++;
                }
            }
            if (!signal.aborted) { 
                setDownloadState(prev => ({ ...prev, status: 'Архівація ZIP...', overallProgress: 100 })); 
                const zipBlob = await zip.generateAsync({ type: "blob" }); 
                saveAs(zipBlob, sanitizeFilename(`${title} [Selected].zip`)); 
                setDownloadState(prev => ({ ...prev, isDownloading: false, status: 'Завершено!' })); 
            }
        } catch (e) { 
            if (e.name !== 'AbortError') { 
                console.error(e); 
                setDownloadState(prev => ({ ...prev, isDownloading: false, status: `Помилка: ${e.message}` })); 
            } 
        }
    };

    const cancelDownload = () => {
        if (abortController.current) {
            abortController.current.abort();
            setDownloadState(prev => ({ ...prev, isDownloading: false, status: 'Скасовано' }));
        }
    };

    const openSeriesModal = () => setShowSeriesModal(true);

    const toggleEpisode = (seasonNum, epNum) => {
        const current = selectedEpisodes[seasonNum] || [];
        const isSelected = current.includes(epNum);
        let updated = isSelected ? current.filter(e => e !== epNum) : [...current, epNum];
        const newSelection = { ...selectedEpisodes };
        updated.length > 0 ? newSelection[seasonNum] = updated : delete newSelection[seasonNum];
        setSelectedEpisodes(newSelection);
    };

    const toggleSeason = (seasonNum) => {
        if (!providers || !selectedProvider || !providers[selectedProvider]) return;
        const sKey = String(seasonNum);
        const sObj = providers[selectedProvider][sKey];
        if (!sObj) return;
        const allEps = Object.keys(sObj).map(Number);
        const current = selectedEpisodes[seasonNum] || [];
        if (current.length === allEps.length) {
            const newSelection = { ...selectedEpisodes };
            delete newSelection[seasonNum];
            setSelectedEpisodes(newSelection);
        } else {
            setSelectedEpisodes({ ...selectedEpisodes, [seasonNum]: allEps });
        }
    };

    const toggleAllSeries = () => {
        if (!providers || !selectedProvider || !providers[selectedProvider]) return;
        const provData = providers[selectedProvider];
        let totalEps = 0;
        let selectedCount = 0;
        Object.values(provData).forEach(episodes => totalEps += Object.keys(episodes).length);
        Object.values(selectedEpisodes).forEach(arr => selectedCount += arr.length);
        if (selectedCount === totalEps) setSelectedEpisodes({});
        else {
            const newSelection = {};
            Object.entries(provData).forEach(([sKey, episodes]) => {
                newSelection[sKey] = Object.keys(episodes).map(Number);
            });
            setSelectedEpisodes(newSelection);
        }
    };

    const BetaIcon = () => (
        <svg width="30" height="12" viewBox="0 0 37 15" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginLeft: '8px', marginBottom: '4px' }}>
             <g clipPath="url(#clip0_1_2)"><rect width="37" height="15" rx="7.5" fill="#FF5757"/><path d="M9.01705 5.95455H9.86932C10.4659 5.95455 10.9517 6.08097 11.3267 6.33381C11.7045 6.58665 11.9815 6.90767 12.1577 7.29688C12.3366 7.68608 12.4261 8.08523 12.4261 8.49432C12.4261 8.98864 12.3111 9.43466 12.081 9.83239C11.8509 10.2273 11.5341 10.5412 11.1307 10.7741C10.7273 11.0043 10.267 11.1193 9.75 11.1193C9.43466 11.1193 9.12216 11.0611 8.8125 10.9446C8.50568 10.8253 8.23295 10.5994 7.99432 10.267L7.92614 10.3011V8.63068C7.92614 8.90909 7.99432 9.16619 8.13068 9.40199C8.26989 9.63778 8.46591 9.8267 8.71875 9.96875C8.97443 10.1108 9.27841 10.1818 9.63068 10.1818C10 10.1818 10.3182 10.1037 10.5852 9.94744C10.8523 9.79119 11.0582 9.58523 11.2031 9.32955C11.348 9.07386 11.4205 8.79545 11.4205 8.49432C11.4205 8.21023 11.3551 7.94176 11.2244 7.68892C11.0966 7.43324 10.9148 7.22585 10.679 7.06676C10.446 6.90483 10.1705 6.82386 9.85227 6.82386H9.01705V5.95455ZM9.51136 2.15341C9.91761 2.15341 10.277 2.21875 10.5895 2.34943C10.9048 2.48011 11.1705 2.65625 11.3864 2.87784C11.6051 3.09659 11.7699 3.34233 11.8807 3.61506C11.9943 3.88778 12.0511 4.16761 12.0511 4.45455C12.0511 4.8125 11.9602 5.16903 11.7784 5.52415C11.5966 5.87642 11.3182 6.17045 10.9432 6.40625C10.5682 6.6392 10.0909 6.75568 9.51136 6.75568H9.01705V5.88636H9.49432C9.82386 5.88636 10.1051 5.81818 10.3381 5.68182C10.5739 5.54545 10.7528 5.3679 10.875 5.14915C11 4.9304 11.0625 4.69886 11.0625 4.45455C11.0625 4.0625 10.9119 3.73722 10.6108 3.47869C10.3125 3.22017 9.94602 3.09091 9.51136 3.09091C9.22159 3.09091 8.95597 3.15057 8.71449 3.26989C8.47585 3.3892 8.28409 3.5554 8.1392 3.76847C7.99716 3.98153 7.92614 4.22727 7.92614 4.50568V13.4545H6.92045V4.50568C6.92045 4.05682 7.03125 3.65483 7.25284 3.29972C7.47727 2.9446 7.78409 2.66477 8.1733 2.46023C8.56534 2.25568 9.01136 2.15341 9.51136 2.15341ZM16.7781 11.1364C16.1474 11.1364 15.6033 10.9972 15.146 10.7188C14.6914 10.4375 14.3406 10.0455 14.0934 9.54261C13.8491 9.03693 13.7269 8.44886 13.7269 7.77841C13.7269 7.10795 13.8491 6.51705 14.0934 6.00568C14.3406 5.49148 14.6843 5.09091 15.1246 4.80398C15.5678 4.5142 16.0849 4.36932 16.6758 4.36932C17.0167 4.36932 17.3533 4.42614 17.6857 4.53977C18.0181 4.65341 18.3207 4.83807 18.5934 5.09375C18.8661 5.34659 19.0835 5.68182 19.2454 6.09943C19.4073 6.51705 19.4883 7.03125 19.4883 7.64205V8.06818H14.4428V7.19886H18.4656C18.4656 6.82955 18.3917 6.5 18.244 6.21023C18.0991 5.92045 17.8917 5.69176 17.6218 5.52415C17.3548 5.35653 17.0394 5.27273 16.6758 5.27273C16.2752 5.27273 15.9286 5.37216 15.636 5.57102C15.3462 5.76705 15.1232 6.02273 14.967 6.33807C14.8107 6.65341 14.7326 6.99148 14.7326 7.35227V7.93182C14.7326 8.42614 14.8178 8.84517 14.9883 9.18892C15.1616 9.52983 15.4016 9.78977 15.7085 9.96875C16.0153 10.1449 16.3718 10.233 16.7781 10.233C17.0423 10.233 17.2809 10.196 17.494 10.1222C17.7099 10.0455 17.896 9.93182 18.0522 9.78125C18.2085 9.62784 18.3292 9.4375 18.4144 9.21023L19.386 9.48295C19.2837 9.8125 19.1119 10.1023 18.8704 10.3523C18.6289 10.5994 18.3306 10.7926 17.9755 10.9318C17.6204 11.0682 17.2212 11.1364 16.7781 11.1364ZM23.8647 4.45455V5.30682H20.4727V4.45455H23.8647ZM21.4613 2.88636H22.467V9.125C22.467 9.40909 22.5082 9.62216 22.5906 9.7642C22.6758 9.90341 22.7837 9.99716 22.9144 10.0455C23.0479 10.0909 23.1886 10.1136 23.3363 10.1136C23.4471 10.1136 23.538 10.108 23.609 10.0966C23.68 10.0824 23.7369 10.071 23.7795 10.0625L23.984 10.9659C23.9158 10.9915 23.8207 11.017 23.6985 11.0426C23.5763 11.071 23.4215 11.0852 23.234 11.0852C22.9499 11.0852 22.6715 11.0241 22.3988 10.902C22.1289 10.7798 21.9045 10.5938 21.7255 10.3438C21.5494 10.0938 21.4613 9.77841 21.4613 9.39773V2.88636ZM27.3036 11.1534C26.8888 11.1534 26.5124 11.0753 26.1744 10.919C25.8363 10.7599 25.5678 10.5312 25.369 10.233C25.1701 9.93182 25.0707 9.56818 25.0707 9.14205C25.0707 8.76705 25.1445 8.46307 25.2923 8.23011C25.44 7.99432 25.6374 7.80966 25.8846 7.67614C26.1317 7.54261 26.4045 7.44318 26.7028 7.37784C27.0039 7.30966 27.3065 7.25568 27.6104 7.21591C28.0082 7.16477 28.3306 7.12642 28.5778 7.10085C28.8278 7.07244 29.0096 7.02557 29.1232 6.96023C29.2397 6.89489 29.2979 6.78125 29.2979 6.61932V6.58523C29.2979 6.16477 29.1829 5.83807 28.9528 5.60511C28.7255 5.37216 28.3803 5.25568 27.9173 5.25568C27.4371 5.25568 27.0607 5.3608 26.788 5.57102C26.5153 5.78125 26.3235 6.00568 26.2127 6.24432L25.2582 5.90341C25.4286 5.50568 25.6559 5.19602 25.94 4.97443C26.2269 4.75 26.5394 4.59375 26.8775 4.50568C27.2184 4.41477 27.5536 4.36932 27.8832 4.36932C28.0934 4.36932 28.3349 4.39489 28.6076 4.44602C28.8832 4.49432 29.1488 4.59517 29.4045 4.74858C29.663 4.90199 29.8775 5.13352 30.0479 5.44318C30.2184 5.75284 30.3036 6.16761 30.3036 6.6875V11H29.2979V10.1136H29.2468C29.1786 10.2557 29.065 10.4077 28.9059 10.5696C28.7468 10.7315 28.5352 10.8693 28.271 10.983C28.0067 11.0966 27.6843 11.1534 27.3036 11.1534ZM27.457 10.25C27.8548 10.25 28.19 10.1719 28.4627 10.0156C28.7383 9.85938 28.9457 9.65767 29.0849 9.41051C29.2269 9.16335 29.2979 8.90341 29.2979 8.63068V7.71023C29.2553 7.76136 29.1616 7.80824 29.0167 7.85085C28.8746 7.89062 28.7099 7.92614 28.5224 7.95739C28.3377 7.9858 28.1573 8.01136 27.9812 8.03409C27.8079 8.05398 27.6673 8.07102 27.5593 8.08523C27.2979 8.11932 27.0536 8.17472 26.8263 8.25142C26.6019 8.32528 26.4201 8.4375 26.2809 8.58807C26.1445 8.7358 26.0763 8.9375 26.0763 9.19318C26.0763 9.54261 26.2056 9.80682 26.4641 9.9858C26.7255 10.1619 27.0565 10.25 27.457 10.25Z" fill="white"/></g><defs><clipPath id="clip0_1_2"><rect width="37" height="15" fill="white"/></clipPath></defs></svg>
    );

    return (
        <div style={{ marginTop: '24px', background: 'rgb(var(--mdui-color-surface-container-low))', padding: '24px', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '20px', margin: '0 0 16px 0', color: 'rgb(var(--mdui-color-on-surface))', display: 'flex', alignItems: 'center' }}>
                Завантаження <BetaIcon />
            </h3>
            
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div 
                    onClick={() => setActiveTab('providers')}
                    style={{ 
                        padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                        background: activeTab === 'providers' ? 'rgb(var(--mdui-color-secondary-container))' : 'transparent',
                        color: activeTab === 'providers' ? 'rgb(var(--mdui-color-on-secondary-container))' : 'rgb(var(--mdui-color-on-surface))'
                    }}
                >
                    Провайдери (Web)
                </div>
                <div 
                    onClick={() => { setActiveTab('torrents'); fetchTorrents(); }}
                    style={{ 
                        padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                        background: activeTab === 'torrents' ? 'rgb(var(--mdui-color-secondary-container))' : 'transparent',
                        color: activeTab === 'torrents' ? 'rgb(var(--mdui-color-on-secondary-container))' : 'rgb(var(--mdui-color-on-surface))'
                    }}
                >
                    Торренти
                </div>
            </div>

            {/* --- PROVIDERS TAB --- */}
            {activeTab === 'providers' && (
                <div>
                    {downloadState.isDownloading ? (
                        <div style={{ marginBottom: '16px', padding: '16px', background: 'rgb(var(--mdui-color-surface))', borderRadius: '12px', border: '1px solid rgb(var(--mdui-color-outline))' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <span style={{ fontWeight: '500' }}>{downloadState.status}</span>
                                    <span style={{ fontSize: '12px', color: 'rgb(var(--mdui-color-outline))' }}>{downloadState.speed} | {downloadState.eta}</span>
                                </div>
                                <mdui-button variant="tonal" onClick={cancelDownload} style={{ cursor: 'pointer' }}>
                                    Скасувати
                                </mdui-button>
                            </div>

                            <div style={{ fontSize: '12px', color: 'rgb(var(--mdui-color-outline))', marginBottom: '8px' }}>
                                Файл {downloadState.currentFileIndex} з {downloadState.totalFiles}: {downloadState.fileName}
                            </div>
                            
                            <div style={{ marginBottom: '4px', fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Прогрес: {downloadState.overallProgress}%</span>
                                <span>{downloadState.loaded}</span>
                            </div>
                            <mdui-linear-progress value={downloadState.overallProgress / 100}></mdui-linear-progress>
                        </div>
                    ) : (
                        <>
                            {!cfToken ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '16px' }}>
                                    <mdui-circular-progress indeterminate></mdui-circular-progress>
                                    <span style={{ color: 'rgb(var(--mdui-color-outline))' }}>Очікування перевірки безпеки...</span>
                                </div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '12px' }}>
                                        {availableProviders.length > 0 ? availableProviders.map((prov, i) => (
                                            <mdui-chip
                                                key={i}
                                                variant="filter"
                                                selected={prov === selectedProvider ? true : undefined}
                                                onClick={() => setSelectedProvider(prov)}
                                                style={{ cursor: 'pointer' }}
                                            >{formatProviderName(prov)}</mdui-chip>
                                        )) : (
                                            <span style={{color: 'rgb(var(--mdui-color-outline))'}}>Джерела не знайдені</span>
                                        )}
                                    </div>

                                    {selectedProvider && (
                                        <div style={{ 
                                            background: 'rgb(var(--mdui-color-surface-container-high))', 
                                            padding: '24px', borderRadius: '16px',
                                            display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center'
                                        }}>
                                            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{formatProviderName(selectedProvider)}</div>
                                                <div style={{ fontSize: '14px', color: 'rgb(var(--mdui-color-outline))' }}>
                                                    Оберіть якість для завантаження
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                {type === 'movie' ? (
                                                    <>
                                                        <mdui-button variant="tonal" onClick={() => handleMovieDownload('1080')} style={{ cursor: 'pointer' }}>
                                                            <mdui-icon slot="icon" name="hd"></mdui-icon> 1080p
                                                        </mdui-button>
                                                        <mdui-button variant="tonal" onClick={() => handleMovieDownload('720')} style={{ cursor: 'pointer' }}>
                                                            <mdui-icon slot="icon" name="sd"></mdui-icon> 720p
                                                        </mdui-button>
                                                        <mdui-button variant="tonal" onClick={() => handleMovieDownload('480')} style={{ cursor: 'pointer' }}>
                                                            <mdui-icon slot="icon" name="smartphone"></mdui-icon> 480p
                                                        </mdui-button>
                                                    </>
                                                ) : (
                                                    <mdui-button variant="filled" onClick={openSeriesModal} style={{ cursor: 'pointer' }}>
                                                        <mdui-icon slot="icon" name="video_library"></mdui-icon>
                                                        Вибрати серії
                                                    </mdui-button>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'rgb(var(--mdui-color-error))', marginTop: '8px' }}>
                                                * Завантаження відбувається у браузері. Не закривайте вкладку.
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            )}

            {showSeriesModal && providers && selectedProvider && providers[selectedProvider] && typeof providers[selectedProvider] === 'object' && !Array.isArray(providers[selectedProvider]) && (
               <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ 
                        background: 'rgb(var(--mdui-color-surface))', 
                        padding: '24px', borderRadius: '16px', 
                        width: '90%', maxWidth: '600px', maxHeight: '80vh', 
                        overflowY: 'auto', display: 'flex', flexDirection: 'column'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0 }}>Оберіть серії</h3>
                            
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <mdui-checkbox onClick={toggleAllSeries}></mdui-checkbox>
                                Вибрати все
                            </label>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', margin: '16px 0' }}>
                            {Object.entries(providers[selectedProvider]).sort(([a], [b]) => Number(a) - Number(b)).map(([sKey, episodes]) => {
                                const sNum = Number(sKey);
                                const allEps = Object.keys(episodes).map(Number).sort((a, b) => a - b);
                                const selectedInSeason = selectedEpisodes[sNum] || [];
                                const isAllSelected = selectedInSeason.length === allEps.length;

                                return (
                                    <div key={sNum} style={{ marginBottom: '24px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                            <mdui-checkbox 
                                                checked={isAllSelected}
                                                indeterminate={selectedInSeason.length > 0 && !isAllSelected}
                                                onClick={() => toggleSeason(sNum)}
                                            ></mdui-checkbox>
                                            <div style={{ fontWeight: 'bold' }}>Сезон {sNum}</div>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingLeft: '40px' }}>
                                            {allEps.map(ep => {
                                                const isSelected = selectedInSeason.includes(ep);
                                                return (
                                    <mdui-chip
                                        key={`${seasonIdx}-${ep}`}
                                        variant="filter"
                                        selected={selectedEpisodes[seasonIdx]?.includes(ep) ? true : undefined}
                                        onClick={() => toggleEpisode(seasonIdx, ep)}
                                        style={{ cursor: 'pointer' }}
                                    >{ep}</mdui-chip>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <mdui-button variant="text" onClick={() => setShowSeriesModal(false)} style={{ cursor: 'pointer' }}>Скасувати</mdui-button>
                            <mdui-button variant="filled" onClick={handleSeriesDownload} style={{ cursor: 'pointer' }}>
                                Завантажити ZIP
                            </mdui-button>
                        </div>
                    </div>
                </div>
            )}

    {activeTab === 'torrents' && (
        <div>
            <div ref={filterContainerRef} style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <mdui-select variant="outlined" label="Трекер" value={filterTracker}>
                    {filterOptions.trackers.map(t => <mdui-menu-item key={t} value={t}>{t}</mdui-menu-item>)}
                </mdui-select>
                <mdui-select variant="outlined" label="Якість" value={filterQuality}>
                    {filterOptions.qualities.map(q => <mdui-menu-item key={q} value={q}>{q === 'All' ? 'Всі' : q}</mdui-menu-item>)}
                </mdui-select>
                <mdui-select variant="outlined" label="Кодек" value={filterCodec}>
                    {filterOptions.codecs.map(c => <mdui-menu-item key={c} value={c}>{c === 'All' ? 'Всі' : c}</mdui-menu-item>)}
                </mdui-select>
                <mdui-select variant="outlined" label="Аудіо" value={filterAudio}>
                    {filterOptions.audios.map(a => <mdui-menu-item key={a} value={a}>{a === 'All' ? 'Всі' : a}</mdui-menu-item>)}
                </mdui-select>
                <mdui-select variant="outlined" label="Субтитри" value={filterSub}>
                    {filterOptions.subs.map(s => <mdui-menu-item key={s} value={s}>{s === 'All' ? 'Всі' : s}</mdui-menu-item>)}
                </mdui-select>
                <mdui-select variant="outlined" label="Сортування" value={sortBy}>
                    <mdui-menu-item value="seeders">Сідери</mdui-menu-item>
                    <mdui-menu-item value="leechers">Лічери</mdui-menu-item>
                    <mdui-menu-item value="size">Розмір</mdui-menu-item>
                </mdui-select>
            </div>

            {loadingTorrents && <mdui-linear-progress indeterminate></mdui-linear-progress>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {torrents.length === 0 && !loadingTorrents && (
                    <div style={{color: 'rgb(var(--mdui-color-outline))', textAlign: 'center'}}>Торрентів не знайдено</div>
                )}
                {filteredTorrents.map((t, i) => {
                    const uniqueAudio = new Set();
                    const uniqueSubs = new Set();

                    const processAudioList = (list) => {
                        if (!list) return [];
                        return list.reduce((acc, audio) => {
                            const rawTitle = typeof audio === 'string' ? audio : (audio.title || '');
                            const rawLang = typeof audio === 'string' ? '' : (audio.language || '');
                            const cleanTitle = cleanTrackTitle(rawTitle);
                            const langCode = formatLang(rawLang || (rawTitle.includes('ukr') ? 'ukr' : 'eng'));
                            const label = cleanTitle ? `${langCode} - ${cleanTitle}` : langCode;

                            if (!uniqueAudio.has(label)) {
                                uniqueAudio.add(label);
                                acc.push(label);
                            }
                            return acc;
                        }, []);
                    };

                    const processSubList = (list) => {
                        if (!list) return [];
                        return list.reduce((acc, sub) => {
                            const rawTitle = typeof sub === 'string' ? sub : (sub.title || '');
                            const rawLang = typeof sub === 'string' ? '' : (sub.language || '');
                            const cleanTitle = cleanTrackTitle(rawTitle);
                            const langCode = formatLang(rawLang || (rawTitle.includes('ukr') ? 'ukr' : 'eng'));
                            const label = cleanTitle ? `${langCode} - ${cleanTitle}` : langCode;

                            if (!uniqueSubs.has(label)) {
                                uniqueSubs.add(label);
                                acc.push(label);
                            }
                            return acc;
                        }, []);
                    };

                    const audioChips = t.MediaInfo?.audio ? processAudioList(t.MediaInfo.audio) : processAudioList(t.jacredInfo?.audioList);
                    const subChips = t.MediaInfo?.subtitles ? processSubList(t.MediaInfo.subtitles) : processSubList(t.jacredInfo?.subList);

                    return (
                        <div key={i} style={{ 
                            background: 'rgb(var(--mdui-color-surface-container-high))', 
                            padding: '16px', borderRadius: '12px',
                            display: 'flex', flexDirection: 'column', gap: '12px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '16px' }}>
                                <span style={{ fontWeight: 500, fontSize: '15px', color: 'rgb(var(--mdui-color-on-surface))', lineHeight: '1.4' }}>{t.Title}</span>
                                
                                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                    {t.MagnetUri && (
                                        <mdui-button variant="tonal" onClick={() => window.location.href = t.MagnetUri} style={{ cursor: 'pointer' }}>
                                            <mdui-icon slot="icon" name="link"></mdui-icon>
                                            Magnet
                                        </mdui-button>
                                    )}
                                    {t.Link && (
                                        <mdui-button variant="outlined" onClick={() => window.open(t.Link, '_blank')} style={{ cursor: 'pointer' }}>
                                            <mdui-icon slot="icon" name="download"></mdui-icon>
                                            .torrent
                                        </mdui-button>
                                    )}
                                </div>
                            </div>
                            <div className="chips-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                <mdui-chip variant="assist">{t.Tracker}</mdui-chip>
                                <mdui-chip variant="assist"><mdui-icon slot="icon" name="save"></mdui-icon>{formatBytes(t.Size)}</mdui-chip>
                                {getVideoBadges(t).map((badge, idx) => (
                                    <mdui-button-icon 
                                        key={`v-${idx}`} 
                                        variant="outlined"
                                        style={{ 
                                            margin: '0 2px',
                                            pointerEvents: 'none'
                                        }}
                                    >
                                        <mdui-icon name={badge.icon}></mdui-icon>
                                    </mdui-button-icon>
                                ))}
                                
                                {audioChips.map((label, idx) => (
                                    <mdui-chip key={`audio-${idx}`} variant="assist">
                                        <mdui-icon slot="icon" name="headphones"></mdui-icon>{label}
                                    </mdui-chip>
                                ))}

                                {audioChips.length === 0 && t.ffprobe && t.ffprobe.some(s => s.codec_type === 'audio') && (
                                    <mdui-chip variant="assist">
                                        <mdui-icon slot="icon" name="headphones"></mdui-icon>{`${t.ffprobe.filter(s => s.codec_type === 'audio').length} Audio`}
                                    </mdui-chip>
                                )}

                                {subChips.map((label, idx) => (
                                    <mdui-chip key={`sub-${idx}`} variant="assist">
                                        <mdui-icon slot="icon" name="subtitles"></mdui-icon>{label}
                                    </mdui-chip>
                                ))}
                                
                                {subChips.length === 0 && (t.Title.toLowerCase().includes('sub') || (t.ffprobe && t.ffprobe.some(s => s.codec_type === 'subtitle'))) && (
                                    <mdui-chip variant="assist">
                                        <mdui-icon slot="icon" name="subtitles"></mdui-icon>Субтитри
                                    </mdui-chip>
                                )}

                                <div style={{ display: 'flex', gap: '8px', fontSize: '12px', marginLeft: 'auto', alignItems: 'center' }}>
                                    <span style={{ color: '#4caf50', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                        <mdui-icon name="arrow_upward" style={{ fontSize: '16px' }}></mdui-icon> {t.Seeders}
                                    </span>
                                    <span style={{ color: '#f44336', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                        <mdui-icon name="arrow_downward" style={{ fontSize: '16px' }}></mdui-icon> {t.Peers}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    )}
        </div>
    );
};

export default Downloader;

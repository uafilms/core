export const parseTorrentTitle = (title) => {
    const lower = title.toLowerCase();
    
    let quality = 'Unknown';
    if (lower.includes('2160p') || lower.includes('4k') || lower.includes('uhd')) quality = '4K UHD';
    else if (lower.includes('1080p')) quality = '1080p';
    else if (lower.includes('720p')) quality = '720p';
    else if (lower.includes('bdrip') || lower.includes('bdremux')) quality = 'BDRip';

    const codec = [];
    if (lower.includes('h.265') || lower.includes('hevc') || lower.includes('x265')) codec.push('H.265');
    else if (lower.includes('h.264') || lower.includes('avc') || lower.includes('x264')) codec.push('H.264');
    
    const tech = [];
    if (lower.includes('hdr')) tech.push('HDR');
    if (lower.includes('dolby vision') || lower.includes('dv')) tech.push('Dolby Vision');
    if (lower.includes('10bit')) tech.push('10-bit');
    if (lower.includes('3d') || lower.includes('halfoverunder')) tech.push('3D');

    const audio = [];
    if (lower.includes('ac3')) audio.push('AC3');
    if (lower.includes('dts')) audio.push('DTS');
    if (lower.includes('aac')) audio.push('AAC');

    const langs = [];
    if (lower.includes('ukr')) langs.push('UA');
    if (lower.includes('eng')) langs.push('EN');

    return { quality, codec, tech, audio, langs };
};
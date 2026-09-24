import fs from 'node:fs';
import path from 'node:path';

interface StudioBadgeConfig {
  slug: string;
  bg: [string, string]; // linear gradient
  accent: string;
  text: string;
  subtext?: string;
  icon?: string;
}

const BADGES: StudioBadgeConfig[] = [
  {
    slug: 'dniprofilm',
    bg: ['#0f2027', '#203a43'],
    accent: '#00d2ff',
    text: 'DniproFilm',
    subtext: 'STUDIO',
    icon: `<path d="M40 70 L90 50 L90 150 L40 130 Z" fill="#00d2ff" opacity="0.3"/><circle cx="100" cy="100" r="45" stroke="#00d2ff" stroke-width="8" fill="none"/><circle cx="100" cy="100" r="16" fill="#00d2ff"/>`,
  },
  {
    slug: 'tsikavaideya',
    bg: ['#2c1500', '#542600'],
    accent: '#ff9800',
    text: 'Цікава Ідея',
    subtext: 'STUDIO',
    icon: `<path d="M100 45 C75 45 60 65 60 85 C60 105 75 115 82 125 L118 125 C125 115 140 105 140 85 C140 65 125 45 100 45 Z" fill="#ffb300"/><rect x="85" y="132" width="30" height="6" rx="3" fill="#ffa000"/><rect x="90" y="142" width="20" height="5" rx="2.5" fill="#ffa000"/>`,
  },
  {
    slug: 'vodnerylo',
    bg: ['#200101', '#420606'],
    accent: '#ff2a2a',
    text: 'В одне рило',
    subtext: 'VOICE OVER',
    icon: `<circle cx="100" cy="95" r="46" fill="#ff2a2a"/><path d="M72 85 Q100 70 128 85 Q100 125 72 85 Z" fill="#1a0000"/><circle cx="86" cy="95" r="5" fill="#fff"/><circle cx="114" cy="95" r="5" fill="#fff"/>`,
  },
  {
    slug: 'robotagolosom',
    bg: ['#120826', '#2b1055'],
    accent: '#a855f7',
    text: 'Робота Голосом',
    subtext: 'AUDIO PROJECT',
    icon: `<rect x="65" y="80" width="10" height="40" rx="5" fill="#a855f7"/><rect x="85" y="60" width="10" height="80" rx="5" fill="#c084fc"/><rect x="105" y="70" width="10" height="60" rx="5" fill="#c084fc"/><rect x="125" y="85" width="10" height="30" rx="5" fill="#a855f7"/>`,
  },
  {
    slug: 'sunnysiders',
    bg: ['#1f1c05', '#3d3408'],
    accent: '#facc15',
    text: 'Sunnysiders',
    subtext: 'TEAM',
    icon: `<circle cx="100" cy="95" r="32" fill="#facc15"/><g stroke="#facc15" stroke-width="6" stroke-linecap="round"><line x1="100" y1="45" x2="100" y2="30"/><line x1="100" y1="145" x2="100" y2="160"/><line x1="50" y1="95" x2="35" y2="95"/><line x1="150" y1="95" x2="165" y2="95"/><line x1="65" y1="60" x2="52" y2="47"/><line x1="135" y1="130" x2="148" y2="143"/><line x1="65" y1="130" x2="52" y2="143"/><line x1="135" y1="60" x2="148" y2="47"/></g>`,
  },
  {
    slug: 'baibako',
    bg: ['#042617', '#084529'],
    accent: '#10b981',
    text: 'BaibaKo',
    subtext: 'TV',
    icon: `<text x="100" y="115" font-family="system-ui, sans-serif" font-weight="900" font-size="70" text-anchor="middle" fill="#10b981">BBK</text>`,
  },
  {
    slug: 'ozz',
    bg: ['#0b132b', '#1c2541'],
    accent: '#48cae4',
    text: 'OZZ',
    subtext: 'STUDIO',
    icon: `<text x="100" y="115" font-family="system-ui, sans-serif" font-weight="900" font-size="64" text-anchor="middle" fill="#48cae4" letter-spacing="2">OZZ</text>`,
  },
  {
    slug: 'omikron',
    bg: ['#082026', '#0f3d4a'],
    accent: '#06b6d4',
    text: 'Омікрон',
    subtext: 'ГУРТОМ',
    icon: `<text x="100" y="118" font-family="serif" font-weight="bold" font-size="80" text-anchor="middle" fill="#06b6d4">Ω</text>`,
  },
  {
    slug: 'cineplus',
    bg: ['#2b0707', '#540d0d'],
    accent: '#ef4444',
    text: 'Cine+',
    subtext: 'CHANNELS',
    icon: `<text x="100" y="112" font-family="system-ui, sans-serif" font-weight="900" font-size="54" text-anchor="middle" fill="#ef4444">CINE<tspan fill="#ffffff">+</tspan></text>`,
  },
  {
    slug: 'paramountcomedy',
    bg: ['#0d1527', '#1a284c'],
    accent: '#38bdf8',
    text: 'Paramount',
    subtext: 'COMEDY',
    icon: `<path d="M100 50 L140 120 L60 120 Z" fill="#38bdf8"/><path d="M100 70 L125 120 L75 120 Z" fill="#0d1527"/>`,
  },
  {
    slug: 'subtitles',
    bg: ['#18181b', '#27272a'],
    accent: '#e4e4e7',
    text: 'Субтитри',
    subtext: 'SUBTITLES',
    icon: `<rect x="55" y="65" width="90" height="60" rx="10" stroke="#e4e4e7" stroke-width="7" fill="none"/><text x="100" y="108" font-family="system-ui, sans-serif" font-weight="900" font-size="34" text-anchor="middle" fill="#e4e4e7" letter-spacing="3">CC</text>`,
  },
  {
    slug: 'gwean-maslinka',
    bg: ['#240e1f', '#4a153f'],
    accent: '#f43f5e',
    text: 'Gwean & Maslinka',
    subtext: 'DUBBING',
    icon: `<text x="100" y="112" font-family="system-ui, sans-serif" font-weight="900" font-size="50" text-anchor="middle" fill="#f43f5e">G&amp;M</text>`,
  },
  {
    slug: 'chornyi-veres',
    bg: ['#130a1c', '#2c1240'],
    accent: '#c084fc',
    text: 'Чорний Верес',
    subtext: 'СУБТИТРИ',
    icon: `<text x="100" y="115" font-family="serif" font-weight="bold" font-size="64" text-anchor="middle" fill="#c084fc">ЧВ</text>`,
  },
  {
    slug: 'projectualines',
    bg: ['#081729', '#0d2d52'],
    accent: '#38bdf8',
    text: 'Project U&A Lines',
    subtext: 'SUBTITLES',
    icon: `<text x="100" y="112" font-family="system-ui, sans-serif" font-weight="900" font-size="46" text-anchor="middle" fill="#38bdf8">U&amp;A</text>`,
  },
  {
    slug: 'anitube',
    bg: ['#240707', '#4a0e0e'],
    accent: '#ef4444',
    text: 'AniTube',
    subtext: 'COMMUNITY',
    icon: `<rect x="60" y="70" width="80" height="55" rx="14" fill="#ef4444"/><polygon points="92,84 116,97 92,111" fill="#ffffff"/>`,
  },
  {
    slug: 'kit',
    bg: ['#1c1404', '#3d2b07'],
    accent: '#fb923c',
    text: 'КІТ',
    subtext: 'СТУДІЯ',
    icon: `<text x="100" y="115" font-family="system-ui, sans-serif" font-weight="900" font-size="60" text-anchor="middle" fill="#fb923c">КІТ</text>`,
  },
  {
    slug: 'yaniam',
    bg: ['#111625', '#1e2942'],
    accent: '#818cf8',
    text: 'Yaniam',
    subtext: 'VOICEOVER',
    icon: `<text x="100" y="112" font-family="system-ui, sans-serif" font-weight="900" font-size="44" text-anchor="middle" fill="#818cf8">YAN</text>`,
  },
  {
    slug: 'hdrezka',
    bg: ['#1a0f02', '#361d04'],
    accent: '#f59e0b',
    text: 'HDrezka',
    subtext: 'STUDIO',
    icon: `<text x="100" y="115" font-family="system-ui, sans-serif" font-weight="900" font-size="46" text-anchor="middle" fill="#f59e0b">REZKA</text>`,
  }
];

function generateSvg(b: StudioBadgeConfig): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="grad-${b.slug}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${b.bg[0]}"/>
      <stop offset="100%" stop-color="${b.bg[1]}"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" rx="44" fill="url(#grad-${b.slug})"/>
  <rect width="196" height="196" x="2" y="2" rx="42" fill="none" stroke="${b.accent}" stroke-width="2" opacity="0.4"/>
  ${b.icon || ''}
  <text x="100" y="162" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="16" text-anchor="middle" fill="#ffffff" letter-spacing="0.5">${b.text}</text>
  ${b.subtext ? `<text x="100" y="178" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="9" text-anchor="middle" fill="${b.accent}" letter-spacing="2.5" opacity="0.9">${b.subtext}</text>` : ''}
</svg>`;
}

const dir = path.resolve('public/logos');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

for (const b of BADGES) {
  const filePath = path.join(dir, `${b.slug}.svg`);
  fs.writeFileSync(filePath, generateSvg(b), 'utf-8');
  console.log(`Generated logo: ${b.slug}.svg`);
}

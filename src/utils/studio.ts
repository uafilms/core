export interface StudioInfo {
  name: string;
  logoUrl?: string;
}

export interface StudioDefinition {
  name: string;
  aliases: string[];
  logoFile?: string;
  logoUrl?: string;
}

/**
 * База українських студій дубляжу, озвучення, телеканалів та фандаб команд
 */
export const KNOWN_STUDIOS: Record<string, StudioDefinition> = {
  // Телеканали та офіційні мовники
  '1plus1': {
    name: '1+1',
    aliases: ['1+1', '1 плюс 1', 'один плюс один'],
    logoFile: '1plus1.svg',
  },
  '2plus2': {
    name: '2+2',
    aliases: ['2+2', '2 плюс 2', 'два плюс два'],
    logoFile: '2plus2.svg',
  },
  tet: {
    name: 'ТЕТ',
    aliases: ['тет', 'tet'],
    logoFile: 'tet.svg',
  },
  plusplus: {
    name: 'Плюс-Плюс',
    aliases: ['плюс-плюс', 'плюс плюс', 'плюсплюс', 'plusplus'],
    logoFile: 'plusplus.svg',
  },
  ictv: {
    name: 'ICTV',
    aliases: ['ictv', 'айсітіві'],
    logoFile: 'ictv.svg',
  },
  ictv2: {
    name: 'ICTV2',
    aliases: ['ictv2', 'ictv 2'],
    logoFile: 'ictv2.svg',
  },
  novyi: {
    name: 'Новий канал',
    aliases: ['новий канал', 'новий', 'novyi'],
    logoFile: 'novyi.svg',
  },
  stb: {
    name: 'СТБ',
    aliases: ['стб', 'stb'],
    logoFile: 'stb.svg',
  },
  qtv: {
    name: 'QTV',
    aliases: ['qtv', 'куй тб'],
    logoFile: 'qtv.svg',
  },
  inter: {
    name: 'Інтер',
    aliases: ['інтер', 'inter'],
    logoFile: 'inter.svg',
  },
  k1: {
    name: 'К1',
    aliases: ['к1', 'k1'],
    logoFile: 'k1.svg',
  },
  ntn: {
    name: 'НТН',
    aliases: ['нтн', 'ntn'],
    logoFile: 'ntn.svg',
  },
  ukraina: {
    name: 'ТРК Україна',
    aliases: ['трк україна', 'україна', 'канал україна'],
    logoFile: 'ukraina.svg',
  },
  nlotv: {
    name: 'НЛО-ТВ',
    aliases: ['нло-тв', 'нло.tv', 'нло tv', 'нло'],
    logoFile: 'nlotv.svg',
  },
  suspilne: {
    name: 'Суспільне',
    aliases: ['суспільне', 'суспільне культура', 'перший', 'ua:перший'],
    logoFile: 'suspilne.svg',
  },
  dim: {
    name: 'Дім',
    aliases: ['дім', 'дім (телеканал)', 'dim'],
    logoFile: 'dim.svg',
  },
  cineplus: {
    name: 'Cine+',
    aliases: ['cine+', 'cine +', 'сіне плюс', 'cine-plus'],
    logoFile: 'cine-plus.png',
  },
  paramountcomedy: {
    name: 'Paramount Comedy',
    aliases: ['paramount comedy', 'paramount', 'comedy central', 'парамаунт'],
    logoFile: 'paramount.svg',
  },
  amc: {
    name: 'AMC',
    aliases: ['amc', 'амс'],
    logoFile: 'amc.svg',
  },
  megogo: {
    name: 'Megogo',
    aliases: ['megogo', 'мегого', 'megogo voice'],
    logoFile: 'megogo.svg',
  },
  sweettv: {
    name: 'Sweet.tv',
    aliases: ['sweet.tv', 'sweettv', 'світ тв'],
    logoFile: 'sweettv.svg',
  },
  netflix: {
    name: 'Netflix',
    aliases: ['netflix', 'нетфлікс'],
    logoFile: 'netflix.svg',
  },

  // Офіційні студії кінодубляжу
  postmodern: {
    name: 'Postmodern',
    aliases: ['постмодерн', 'postmodern', 'postmodern postproduction'],
    logoFile: 'postmodern.png',
  },
  ledoyen: {
    name: 'LeDoyen',
    aliases: ['ледоєн', 'ледоен', 'ле доєн', 'ledoyen', 'le-doyen', 'le doyen'],
    logoFile: 'ledoyen.png',
  },
  taktreba: {
    name: 'Так Треба Продакшн',
    aliases: ['так треба продакшн', 'тактребапродакшн', 'так треба', 'tak треба', 'tak treba', 'taktreba', 'ttp'],
    logoFile: 'taktreba.png',
  },
  cinemasound: {
    name: 'Cinema Sound Production',
    aliases: ['cinema sound', 'сінема саунд', 'синема саунд'],
    logoFile: 'cinemasound.png',
  },

  // Студії озвучки фільмів / серіалів
  dniprofilm: {
    name: 'DniproFilm',
    aliases: ['дніпрофільм', 'дніпрофілм', 'dniprofilm'],
    logoFile: 'dniprofilm.jpg',
  },
  tsikavaideya: {
    name: 'Цікава Ідея',
    aliases: ['цікава ідея', 'tsikava ideya'],
  },
  v_odneprylo: {
    name: 'В одне рило',
    aliases: ['в одне рило', 'в_одне_рило', 'vodnerylo'],
  },
  uaflix: {
    name: 'UaFlix',
    aliases: ['uaflix', 'уафлікс'],
    logoFile: 'uaflix.png',
  },
  hdrezka: {
    name: 'HDrezka Studio',
    aliases: ['hdrezka', 'резка'],
    logoFile: 'hdrezka.png',
  },
  bamboo: {
    name: 'BambooUA',
    aliases: ['bambooua', 'bamboo', 'бамбу'],
    logoFile: 'bamboo.png',
  },
  ukrdub: {
    name: 'UkrDub',
    aliases: ['ukrdub', 'укрдаб'],
    logoFile: 'ukrdub.png',
  },
  blueberry: {
    name: 'Blueberry Studio',
    aliases: ['blueberry studio', 'blueberry', 'блюберрі студіо', 'блюберрі'],
    logoFile: 'blueberry-studio.jpg',
  },
  sunnysiders: {
    name: 'Sunnysiders',
    aliases: ['sunnysiders', 'санісайдерс'],
  },
  baibako: {
    name: 'BaibaKo',
    aliases: ['baibako', 'baibakotv', 'байбако'],
  },
  ozz: {
    name: 'OZZ',
    aliases: ['ozz', 'озз'],
  },
  omikron: {
    name: 'Омікрон',
    aliases: ['омікрон', 'omikron'],
  },
  robotagolosom: {
    name: 'Робота Голосом',
    aliases: ['робота голосом', 'роботаголосом', 'рідний голос'],
    logoFile: 'robota-holosom.jpg',
  },
  unimay: {
    name: 'Unimay',
    aliases: ['unimay', 'юнімей', 'унімей', 'unimay media'],
    logoFile: 'unimay.jpg',
  },
  kachur: {
    name: 'Студія Качур',
    aliases: ['студія качур', 'качур', 'kachur', 'kachur studio'],
    logoFile: 'studio-kachur.jpg',
  },
  hatoshi: {
    name: 'HATOSHI',
    aliases: ['hatoshi', 'хатоші'],
    logoFile: 'hatoshi.jpg',
  },
  maysternyasliv: {
    name: 'Майстерня Слів',
    aliases: ['майстерня слів', 'майстерняслів', 'майстерня слiв', 'maysternya sliv', 'maysterna sliv'],
    logoFile: 'maysterna-sliv.jpg',
  },
  kit: {
    name: 'КІТ',
    aliases: ['кіт', 'студія кіт'],
  },
  yaniam: {
    name: 'Yaniam',
    aliases: ['yaniam', 'яніам'],
  },

  // Аніме-студії та фандаб команди
  fanvoxua: {
    name: 'FanVoxUA',
    aliases: ['fanvoxua', 'фанвоксюа', 'фанвокс', 'fanwoxua'],
    logoFile: 'fanvoxua.webp',
  },
  amanogawa: {
    name: 'Amanogawa',
    aliases: ['amanogawa', 'аманогава'],
    logoFile: 'amanogawa.webp',
  },
  didko: {
    name: 'Didko Studio',
    aliases: ['didko studio', 'didko', 'дідько'],
    logoFile: 'didko-studio.webp',
  },
  ufdub: {
    name: 'UFDUB',
    aliases: ['ufdub', 'юфдаб'],
  },
  kaizoku: {
    name: 'Клан Кайзоку',
    aliases: ['клан кайзоку', 'кайзоку', 'clan kaizoku', 'kaizoku'],
    logoFile: 'clan-kaizoku.webp',
  },
  glassmoon: {
    name: 'Glass Moon',
    aliases: ['glass moon', 'глас мун', 'glassmoon'],
    logoFile: 'glass-moon.webp',
  },
  aniua: {
    name: 'AniUA',
    aliases: ['aniua', 'аніюа'],
    logoFile: 'aniua.webp',
  },
  animesh: {
    name: 'Animesh',
    aliases: ['animesh', 'анімеш'],
    logoFile: 'animesh.webp',
  },
  kioto: {
    name: 'Кіото',
    aliases: ['кіото', 'kioto', 'kioto anime'],
    logoFile: 'kioto-anime.webp',
  },
  dzuski: {
    name: 'Dzuski',
    aliases: ['dzuski', 'дзуські'],
    logoFile: 'dzuski.webp',
  },
  cloverdub: {
    name: 'CloverDUB',
    aliases: ['cloverdub', 'кловердаб'],
    logoFile: 'cloverdub.webp',
  },
  inari: {
    name: 'Inari',
    aliases: ['inaridub', 'інарі', 'inari'],
    logoFile: 'inari.webp',
  },
  inariokami: {
    name: 'InariOkami',
    aliases: ['inariokami', 'інаріокамі', 'інарі окамі'],
    logoFile: 'inariokami.webp',
  },
  melvoice: {
    name: 'MelodicVoiceStudio',
    aliases: ['melvoice', 'melodicvoicestudio', 'мелвойс'],
    logoFile: 'melvoice.webp',
  },
  anime_classic: {
    name: 'Anime Classic',
    aliases: ['anime classic', 'аніме класік'],
    logoFile: 'anime-classic.webp',
  },
  moonanime: {
    name: 'MoonAnime',
    aliases: ['moonanime', 'мунаніме'],
    logoFile: 'subtytry-moonanime-studio.webp',
  },
  legat: {
    name: 'Legat',
    aliases: ['legat', 'легат'],
    logoFile: 'legat.webp',
  },
  mikai: {
    name: 'Mikai',
    aliases: ['mikai', 'мікай'],
    logoFile: 'mikai.webp',
  },
  tatakae: {
    name: 'TATAKAE',
    aliases: ['tatakae', 'татакае'],
  },
  dali_bude: {
    name: 'Далі буде',
    aliases: ['далі буде'],
  },

  // Інші команди з Mikai з реальними аватарами
  '10gu': {
    name: '10GU',
    aliases: ['10gu', '10 гу'],
    logoFile: '10gu.webp',
  },
  four_ua: {
    name: '4UA',
    aliases: ['4ua', '4 юа'],
    logoFile: '4ua.webp',
  },
  aleksalo: {
    name: 'AleksAlo',
    aliases: ['aleksalo', 'алексало'],
    logoFile: 'aleksalo.webp',
  },
  and5: {
    name: 'AND5 Studio',
    aliases: ['and5', 'and5 studio'],
    logoFile: 'and5-studio.webp',
  },
  anifanua: {
    name: 'AniFanUA',
    aliases: ['anifanua', 'аніфанюа'],
    logoFile: 'anifanua.webp',
  },
  anikoe: {
    name: 'AniKoe',
    aliases: ['anikoe', 'анікое'],
    logoFile: 'anikoe.webp',
  },
  animeoriginal: {
    name: 'AnimeOriginal',
    aliases: ['animeoriginal'],
    logoFile: 'animeoriginal.webp',
  },
  beysub: {
    name: 'Beysub Studio',
    aliases: ['beysub', 'бейсаб'],
    logoFile: 'beysub-studio.webp',
  },
  boku_no_pidval: {
    name: 'Боку но підвал',
    aliases: ['боку но підвал', 'boku no pidval'],
    logoFile: 'boku-no-pidval.webp',
  },
  borshdub: {
    name: 'BorshDUB',
    aliases: ['borshdub', 'борщдаб'],
    logoFile: 'borshdub.webp',
  },
  crystal_shade: {
    name: 'Crystal Shade',
    aliases: ['crystal shade', 'крістал шейд'],
    logoFile: 'crystal-shade.webp',
  },
  espada: {
    name: 'Espada Studio',
    aliases: ['espada', 'еспада'],
    logoFile: 'espada-studio.webp',
  },
  flayzer: {
    name: 'Flayzer',
    aliases: ['flayzer', 'флейзер'],
    logoFile: 'flayzer.webp',
  },
  futashine: {
    name: 'Futashine',
    aliases: ['futashine'],
    logoFile: 'futashine.webp',
  },
  hajimedub: {
    name: 'HajimeDUB',
    aliases: ['hajimedub', 'хаджімедаб'],
    logoFile: 'hajimedub.webp',
  },
  k0wbassa: {
    name: 'k0wbassa',
    aliases: ['k0wbassa', 'ковбаса'],
    logoFile: 'k0wbassa.webp',
  },
  kafori: {
    name: 'Kafori',
    aliases: ['kafori', 'кафорі'],
    logoFile: 'kafori.webp',
  },
  kawaii_dub: {
    name: 'Kawaii Dub',
    aliases: ['kawaii dub', 'каваі даб'],
    logoFile: 'kawaii-dub.webp',
  },
  kitsune: {
    name: 'Kitsune',
    aliases: ['kitsune', 'кіцуне'],
    logoFile: 'kitsune.webp',
  },
  lifecycle: {
    name: 'Life Cycle',
    aliases: ['life cycle', 'лайф сайкл', 'lifecycle'],
    logoFile: 'lifecycle.png',
  },
  lvp: {
    name: 'LVP',
    aliases: ['lvp'],
    logoFile: 'lvp.webp',
  },
  milki_dub: {
    name: 'Milki-Dub',
    aliases: ['milki-dub', 'мілкі даб'],
    logoFile: 'milki-dub.webp',
  },
  modeo: {
    name: 'Modeo',
    aliases: ['modeo'],
    logoFile: 'modeo.webp',
  },
  mogi: {
    name: 'Mogi',
    aliases: ['mogi', 'могі'],
    logoFile: 'mogi.webp',
  },
  morys: {
    name: 'Morys',
    aliases: ['morys', 'моріс'],
    logoFile: 'morys.webp',
  },
  mrcrashfox: {
    name: 'MrCrashFox',
    aliases: ['mrcrashfox', 'крашфокс'],
    logoFile: 'mrcrashfox.webp',
  },
  p1rsti: {
    name: 'p1rsti',
    aliases: ['p1rsti', 'персти'],
    logoFile: 'p1rsti.webp',
  },
  raccoonhouse: {
    name: 'RaccoonHouse',
    aliases: ['raccoonhouse', 'ракунхаус'],
    logoFile: 'raccoonhouse.webp',
  },
  ryukastudio: {
    name: 'Ryuka Studio',
    aliases: ['ryuka studio', 'рюка'],
    logoFile: 'ryukastudio.webp',
  },
  salovpalo: {
    name: 'Сало Впало',
    aliases: ['сало впало', 'salovpalo'],
    logoFile: 'salovpalo.webp',
  },
  shield_team: {
    name: 'Shield Team',
    aliases: ['shield team', 'шілд тім'],
    logoFile: 'shield-team.webp',
  },
  shiwa: {
    name: 'Shiwa',
    aliases: ['shiwa', 'шіва'],
    logoFile: 'shiwa.webp',
  },
  shogun: {
    name: 'Shogun',
    aliases: ['shogun', 'сьогун'],
    logoFile: 'shogun.webp',
  },
  togarashi: {
    name: 'Togarashi',
    aliases: ['togarashi', 'тогараші'],
    logoFile: 'togarashi.jpg',
  },
  sviydub: {
    name: 'СвійDUB',
    aliases: ['свійdub', 'свій dub', 'свійдаб', 'свій даб', 'sviydub', 'sviy dub', 'svijdub', 'svij dub'],
    logoFile: 'sviydub.jpg',
  },

  // Субтитри
  subtitles: {
    name: 'Субтитри',
    aliases: ['субтитри', 'subtitles'],
  },
  uaanisub: {
    name: 'UaAniSub',
    aliases: ['uaanisub', 'uaani sub', 'ua-ani-sub', 'уаанісаб', 'юаанісаб', 'уа ані саб'],
    logoFile: 'uaanisub.jpg',
  },
  svijsub: {
    name: 'СвійSUB',
    aliases: ['свійsub', 'свій sub', 'svijsub', 'svij sub', 'свийsub', 'свійсаб', 'свій саб'],
    logoFile: 'sviydub.jpg',
  },
  chornyi_veres: {
    name: 'Чорний Верес',
    aliases: ['чорний верес'],
  },
  project_ua_lines: {
    name: 'Project U&A Lines',
    aliases: ['project u&a lines', 'u&a lines'],
  },
  anitube: {
    name: 'AniTube',
    aliases: ['anitube', 'анітюб'],
  },
};

/**
 * Очищає сирий рядок аудіо від технічних префіксів / суфіксів
 */
export function cleanStudioName(rawAudio: string): string {
  if (!rawAudio) return 'Озвучення';

  let cleaned = rawAudio.trim().replace(/&#124;/g, '|');

  // Видаляємо обгортку "Ukrainian (...)"
  const ukrParen = cleaned.match(/^Ukrainian\s*\((.*)\)$/i);
  if (ukrParen) {
    cleaned = ukrParen[1].trim();
  }

  // Видаляємо суфікси [MoonAnime], [Ashdi], [1080p] тощо
  cleaned = cleaned.replace(/\[[^\]]+\]/g, '').trim();

  // Якщо рядок типу "субтитри | Робота Голосом" або "Субтитри | BambooUA"
  if (cleaned.includes('|')) {
    const parts = cleaned.split('|').map((p) => p.trim());
    cleaned = parts[parts.length - 1] || cleaned;
  }

  // Видаляємо технічні слова про багатоголосий / дубльований
  cleaned = cleaned.replace(/^(багатоголосий|двоголосий|одноголосий|професійний|аматорський)\s+(закадровий|дубльований|дубляж)?\s*[:-]?\s*/i, '').trim();

  // Видаляємо слово "Субтитри" на початку, якщо далі йде назва команди (напр. "Субтитри СвійSUB" -> "СвійSUB", "Субтитри (Чорний Верес)" -> "Чорний Верес")
  if (/^субтитри[\s:(-]+/i.test(cleaned) && cleaned.length > 9) {
    cleaned = cleaned.replace(/^субтитри[\s:(-]+/i, '').replace(/\)+$/, '').trim();
  }
  cleaned = cleaned.replace(/\s*\((?:субтитри|subtitles)\)$/i, '').trim();

  if (!cleaned || cleaned.toLowerCase() === 'не визначено' || cleaned.toLowerCase() === 'default') {
    return 'Невідома студія';
  }

  return cleaned;
}

/**
 * Визначає мову (uk або оригінальна або субтитри)
 */
export function detectAudioLang(audioName: string, originalLanguage?: string): string {
  const lower = audioName.toLowerCase();
  if (lower.includes('субтитр') || lower.includes('sub')) {
    return originalLanguage || 'none';
  }
  return 'uk';
}

/**
 * Шукає відому студію та її локальний або зовнішній логотип
 */
export function resolveStudioInfo(cleanedName: string, fallbackLogo?: string): StudioInfo {
  const lower = cleanedName.toLowerCase().trim();

  // Спеціальна обробка для загальних субтитрів (щоб не матчити саб-команди типу 'СвійSUB' через підрядок 'sub')
  if (lower === 'субтитри' || lower === 'subtitles' || lower === 'sub') {
    return {
      name: 'Субтитри',
    };
  }

  for (const [key, info] of Object.entries(KNOWN_STUDIOS)) {
    if (key === 'subtitles') continue;
    if (info.aliases.some((alias) => lower.includes(alias))) {
      return {
        name: info.name,
        logoUrl: info.logoFile ? `/logos/${info.logoFile}` : info.logoUrl,
      };
    }
  }

  // Використовуємо fallbackLogo тільки якщо це дійсно логотип/аватар команди (напр. Mikai avatars), а не скріншот відео
  const isLegitLogo = fallbackLogo && (
    fallbackLogo.includes('/avatars/') ||
    fallbackLogo.includes('/teams/') ||
    fallbackLogo.includes('/logos/')
  ) && !fallbackLogo.includes('/screen.jpg') && !fallbackLogo.includes('/stream');

  return {
    name: cleanedName,
    logoUrl: isLegitLogo ? fallbackLogo : undefined,
  };
}

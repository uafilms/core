declare const Lampa: any;

export function initTranslations(): void {
  if (typeof Lampa === 'undefined' || !Lampa.Lang) return;

  Lampa.Lang.add({
    title_online: {
      uk: 'Онлайн (UA)',
      en: 'Online (UA)',
      ru: 'Онлайн (UA)',
    },
    uafilms_title: {
      uk: 'UAFilms',
      en: 'UAFilms',
      ru: 'UAFilms',
    },
    uafilms_watch: {
      uk: 'Дивитися в UAFilms',
      en: 'Watch in UAFilms',
      ru: 'Смотреть в UAFilms',
    },
    uafilms_source: {
      uk: 'Джерело',
      en: 'Source',
      ru: 'Источник',
    },
    uafilms_voice: {
      uk: 'Озвучка',
      en: 'Voice',
      ru: 'Озвучка',
    },
    uafilms_season: {
      uk: 'Сезон',
      en: 'Season',
      ru: 'Сезон',
    },
    uafilms_episode: {
      uk: 'Серія',
      en: 'Episode',
      ru: 'Серия',
    },
    uafilms_all: {
      uk: 'Всі',
      en: 'All',
      ru: 'Все',
    },
    uafilms_loading: {
      uk: 'Пошук українських джерел...',
      en: 'Searching Ukrainian sources...',
      ru: 'Поиск украинских источников...',
    },
    uafilms_loading_episodes: {
      uk: 'Завантаження серій...',
      en: 'Loading episodes...',
      ru: 'Загрузка серий...',
    },
    uafilms_not_found: {
      uk: 'Українських джерел не знайдено',
      en: 'No Ukrainian sources found',
      ru: 'Украинских источников не найдено',
    },
    uafilms_error: {
      uk: 'Помилка підключення до сервера UAFilms',
      en: 'Connection error to UAFilms server',
      ru: 'Ошибка подключения к серверу UAFilms',
    },
    uafilms_nolink: {
      uk: 'Не вдалося отримати відеопотік',
      en: 'Failed to extract stream link',
      ru: 'Не удалось получить видеопоток',
    },
    uafilms_choose_voice: {
      uk: 'Оберіть озвучку',
      en: 'Choose translation',
      ru: 'Выберите озвучку',
    },
    uafilms_server_url: {
      uk: 'Адреса сервера UAFilms',
      en: 'UAFilms server URL',
      ru: 'Адрес сервера UAFilms',
    },
    uafilms_server_descr: {
      uk: 'Визначається автоматично. За потреби вкажіть вручну.',
      en: 'Auto-detected. Specify manually if needed.',
      ru: 'Определяется автоматически. При необходимости укажите вручную.',
    },
    uafilms_api_key_title: {
      uk: 'API-ключ UAFilms',
      en: 'UAFilms API Key',
      ru: 'API-ключ UAFilms',
    },
    uafilms_api_key_descr: {
      uk: "Необов'язково. Для зняття лімітів без перевірок.",
      en: 'Optional. Removes request limits without checks.',
      ru: 'Необязательно. Для снятия лимитов без проверок.',
    },
    uafilms_fav_sources: {
      uk: 'Улюблені джерела (CDN)',
      en: 'Favorite sources (CDNs)',
      ru: 'Любимые источники (CDN)',
    },
    uafilms_fav_sources_descr: {
      uk: 'Пріоритетні джерела (через кому: fenix, ashdi). Стоять першими та позначаються зірочкою ★.',
      en: 'Priority sources (comma-separated: fenix, ashdi). Placed first and marked with a star ★.',
      ru: 'Приоритетные источники (через запятую: fenix, ashdi). Стоят первыми и отмечаются звездочкой ★.',
    },
    uafilms_clear_marks: {
      uk: 'Очистити відмітки перегляду',
      en: 'Clear watched labels',
      ru: 'Очистить отметки просмотра',
    },
    uafilms_clear_timecode: {
      uk: 'Скинути прогрес перегляду',
      en: 'Reset playback progress',
      ru: 'Сбросить прогресс просмотра',
    },
    uafilms_copy_link: {
      uk: 'Скопіювати посилання',
      en: 'Copy stream URL',
      ru: 'Скопировать ссылку',
    },
    uafilms_copy_success: {
      uk: 'Посилання скопійовано в буфер обміну',
      en: 'Link copied to clipboard',
      ru: 'Ссылка скопирована в буфер обмена',
    },
    uafilms_back_to_episodes: {
      uk: '← Назад до списку серій',
      en: '← Back to episodes',
      ru: '← Назад к списку серий',
    },
  });
}

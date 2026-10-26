declare const Lampa: any;
declare const $: any;

const STORAGE_KEY = 'uafilms_anti_scam_v1';

export function isAntiScamNoticeViewed(): boolean {
  try {
    if (typeof Lampa !== 'undefined' && Lampa.Storage) {
      return Boolean(Lampa.Storage.get(STORAGE_KEY, false));
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    }
  } catch {
    // Ignore storage errors
  }
  return false;
}

export function markAntiScamNoticeViewed(): void {
  try {
    if (typeof Lampa !== 'undefined' && Lampa.Storage) {
      Lampa.Storage.set(STORAGE_KEY, true);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  } catch {
    // Ignore storage errors
  }
}

let isModalActive = false;

export function showAntiScamNotice(onClose?: () => void): boolean {
  if (isAntiScamNoticeViewed()) {
    if (onClose) onClose();
    return false;
  }

  if (isModalActive) return false;
  if (typeof Lampa === 'undefined' || !Lampa.Modal || !Lampa.Modal.open || typeof $ === 'undefined') {
    if (onClose) onClose();
    return false;
  }

  isModalActive = true;
  let remaining = 5;
  let locked = true;
  let timer: any = null;

  // Capture current controller name before opening modal to safely restore remote focus
  const prevController =
    (typeof Lampa !== 'undefined' &&
      Lampa.Controller &&
      Lampa.Controller.enabled &&
      Lampa.Controller.enabled().name) ||
    'content';

  const cleanup = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    isModalActive = false;
  };

  const noticeHtml = $(`
    <div class="uafilms-scam-notice" style="text-align: center; padding: 0.5em 0.2em; line-height: 1.5;">
      <div style="font-size: 1.35em; font-weight: bold; margin-bottom: 0.7em; color: #ffc107;">
        ⚠️ UAFilms — БЕЗКОШТОВНИЙ ПЛАГІН!
      </div>
      <div style="font-size: 1.05em; margin-bottom: 0.7em; line-height: 1.45;">
        Якщо з вас взяли гроші за встановлення, налаштування або доступ до цього плагіна (наприклад, 200 грн) — <b>вас ошукали шахраї</b>.
      </div>
      <div style="font-size: 0.95em; opacity: 0.85; margin-bottom: 0.9em;">
        Цей плагін є некомерційним і створений для спільноти. Він не потребує жодної плати чи підписок.
      </div>
      <div style="background: rgba(255, 255, 255, 0.08); padding: 0.8em; border-radius: 0.7em; font-size: 1em; line-height: 1.5;">
        Офіційний Telegram: <b style="color: #4da3ff;">t.me/uafilms_official</b><br>
        Офіційний сайт: <b style="color: #4da3ff;">films.aartzz.pp.ua</b>
      </div>
    </div>
  `);

  const closeModal = (proceedWithLaunch = true) => {
    cleanup();
    markAntiScamNoticeViewed();

    try {
      Lampa.Modal.close();
    } catch {
      // Ignore
    }

    if (proceedWithLaunch && onClose) {
      onClose();
    } else {
      // Return focus to the screen underneath so remote control never hangs
      try {
        if (typeof Lampa !== 'undefined' && Lampa.Controller && Lampa.Controller.toggle) {
          Lampa.Controller.toggle(prevController || 'content');
        }
      } catch {
        // Ignore
      }
    }
  };

  try {
    Lampa.Modal.open({
      title: 'Увага! UAFilms',
      html: noticeHtml,
      size: 'medium',
      align: 'center',
      buttons: [
        {
          name: `Зачекайте (${remaining})`,
          onSelect: () => {
            if (locked) {
              if (typeof Lampa !== 'undefined' && Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show(`Будь ласка, зачекайте ${remaining} с...`);
              }
              return;
            }
            closeModal(true);
          },
        },
      ],
      onBack: () => {
        // Pressing Back on remote control dismisses the warning cleanly
        closeModal(false);
      },
    });

    // Make sure remote controller is focused on modal
    try {
      if (typeof Lampa !== 'undefined' && Lampa.Controller && Lampa.Controller.toggle) {
        Lampa.Controller.toggle('modal');
      }
    } catch {
      // Ignore
    }

    timer = setInterval(() => {
      remaining--;
      const curModal = noticeHtml.closest('.modal');
      const curBtn =
        curModal.length > 0 ? curModal.find('.modal__button') : $('.modal:not(.hide) .modal__button');

      if (remaining > 0) {
        if (curBtn.length) {
          curBtn.text(`Зачекайте (${remaining})`);
        }
      } else {
        cleanup();
        locked = false;
        if (curBtn.length) {
          curBtn.text('Зрозуміло (ОК)');
          // Keep remote focus on modal
          try {
            if (typeof Lampa !== 'undefined' && Lampa.Controller && Lampa.Controller.toggle) {
              Lampa.Controller.toggle('modal');
            }
          } catch {
            // Ignore
          }
        }
      }
    }, 1000);

    return true;
  } catch {
    cleanup();
    if (onClose) onClose();
    return false;
  }
}

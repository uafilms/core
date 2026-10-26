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
let pendingCallbacks: Array<() => void> = [];

export function showAntiScamNotice(onClose?: () => void): boolean {
  if (isAntiScamNoticeViewed()) {
    if (onClose) onClose();
    return false;
  }

  if (onClose) {
    pendingCallbacks.push(onClose);
  }

  if (isModalActive) return false;
  if (typeof Lampa === 'undefined' || !Lampa.Modal || !Lampa.Modal.open || typeof $ === 'undefined') {
    const cbs = pendingCallbacks.slice();
    pendingCallbacks = [];
    cbs.forEach((cb) => cb());
    return false;
  }

  isModalActive = true;
  let remaining = 5;
  let locked = true;
  let timer: any = null;

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

  const closeModal = () => {
    cleanup();
    markAntiScamNoticeViewed();
    try {
      Lampa.Modal.close();
    } catch {
      // Ignore
    }
    const cbs = pendingCallbacks.slice();
    pendingCallbacks = [];
    cbs.forEach((cb) => cb());
  };

  try {
    Lampa.Modal.open({
      title: 'Увага! UAFilms',
      html: noticeHtml,
      size: 'medium',
      align: 'center',
      buttons: [
        {
          name: `ОК (${remaining})`,
          onSelect: () => {
            if (locked) return;
            closeModal();
          },
        },
      ],
      onBack: () => {
        if (locked) return;
        closeModal();
      },
    });

    const modalElem = noticeHtml.closest('.modal');
    const btn = modalElem.find('.modal__button');
    if (btn.length) {
      btn.css({
        opacity: '0.4',
        cursor: 'not-allowed',
        transition: 'opacity 0.2s ease',
      });
    }

    timer = setInterval(() => {
      remaining--;
      const curModal = noticeHtml.closest('.modal');
      const curBtn =
        curModal.length > 0 ? curModal.find('.modal__button') : $('.modal:not(.hide) .modal__button');
      if (remaining > 0) {
        if (curBtn.length) {
          curBtn.text(`ОК (${remaining})`);
        }
      } else {
        cleanup();
        locked = false;
        if (curBtn.length) {
          curBtn.text('ОК');
          curBtn.css({
            opacity: '1',
            cursor: 'pointer',
          });
          curBtn.addClass('focus');
          if (Lampa.Controller && Lampa.Controller.collectionFocus) {
            Lampa.Controller.collectionFocus(curBtn[0], curBtn.parent());
          }
        }
      }
    }, 1000);

    return true;
  } catch {
    cleanup();
    const cbs = pendingCallbacks.slice();
    pendingCallbacks = [];
    cbs.forEach((cb) => cb());
    return false;
  }
}

import axios from 'axios';

export const loaderEvent = new EventTarget();

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
});

const PROTECTED_PATHS = [
  '/v1/movies',
  '/v1/tv',
  '/v1/refresh',
  '/auth/login',
  '/auth/register',
  '/api/auth/login',
  '/api/auth/register',
  '/auth/telegram-start',
  '/auth/telegram-status',
  '/api/auth/telegram-start',
  '/api/auth/telegram-status',
];

export const waitForToken = () => {
  return new Promise((resolve) => {
    // Якщо Turnstile вимкнено або вже отримано, відразу повертаємо
    if (window.cfToken) return resolve(window.cfToken);

    const handler = () => {
      window.removeEventListener('cf_token_ready', handler);
      resolve(window.cfToken);
    };

    window.addEventListener('cf_token_ready', handler);

    // Таймаут на випадок затримки
    setTimeout(() => {
      window.removeEventListener('cf_token_ready', handler);
      resolve(window.cfToken || 'disabled');
    }, 10000);
  });
};

instance.interceptors.request.use(async config => {
  loaderEvent.dispatchEvent(new Event('start'));

  const authToken = localStorage.getItem('uafilms_auth_token');
  if (authToken && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  const isProtected = PROTECTED_PATHS.some(path => config.url && config.url.includes(path));

  if (isProtected && !window.cfToken) {
    const token = await waitForToken();
    if (token && token !== 'disabled') {
      config.headers['cf-turnstile-response'] = token;
    }
  } else if (window.cfToken && window.cfToken !== 'disabled') {
    config.headers['cf-turnstile-response'] = window.cfToken;
  }
  
  return config;
}, error => {
  loaderEvent.dispatchEvent(new Event('stop'));
  return Promise.reject(error);
});

instance.interceptors.response.use(response => {
  loaderEvent.dispatchEvent(new Event('stop'));
  return response;
}, async error => {
  loaderEvent.dispatchEvent(new Event('stop'));

  const config = error.config;
  const errorCode = error.response?.data?.error?.code;
  const isTurnstileFailure =
    error.response?.status === 403 &&
    errorCode === 'TURNSTILE_VERIFICATION_FAILED' &&
    config &&
    !config._turnstileRetried &&
    typeof window !== 'undefined' &&
    typeof window.refreshCfToken === 'function';

  // Turnstile tokens are single-use, so a token that worked for one request
  // is rejected on the next one. Fetch a fresh token and retry once.
  if (isTurnstileFailure) {
    config._turnstileRetried = true;
    loaderEvent.dispatchEvent(new Event('start'));
    let freshToken = null;
    try {
      freshToken = await window.refreshCfToken();
    } catch {
      freshToken = null;
    }
    if (freshToken && freshToken !== 'disabled') {
      config.headers = config.headers || {};
      config.headers['cf-turnstile-response'] = freshToken;
      return instance(config);
    }
    loaderEvent.dispatchEvent(new Event('stop'));
  }

  return Promise.reject(error);
});

export default instance;
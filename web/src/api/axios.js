import axios from 'axios';

export const loaderEvent = new EventTarget();

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// FIX: Тут НЕ має бути '/details'
const PROTECTED_PATHS = [
  '/get',         
  '/download',    
  '/torrents',    
  '/uaflix',      
  '/moonanime',   
  '/proxy'        
];

const waitForToken = () => {
  return new Promise((resolve) => {
    // Якщо Turnstile вимкнено, компонент відразу поставить 'disabled'
    if (window.cfToken) return resolve(window.cfToken);

    const handler = () => {
      window.removeEventListener('cf_token_ready', handler);
      resolve(window.cfToken);
    };

    window.addEventListener('cf_token_ready', handler);

    // Таймаут на всякий випадок
    setTimeout(() => {
      window.removeEventListener('cf_token_ready', handler);
      resolve(window.cfToken);
    }, 10000);
  });
};

instance.interceptors.request.use(async config => {
  loaderEvent.dispatchEvent(new Event('start'));
  
  const isProtected = PROTECTED_PATHS.some(path => config.url.includes(path));

  if (isProtected && !window.cfToken) {
    const token = await waitForToken();
    if (token) {
      config.headers['cf-turnstile-response'] = token;
    }
  } else if (window.cfToken) {
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
}, error => {
  loaderEvent.dispatchEvent(new Event('stop'));
  return Promise.reject(error);
});

export default instance;
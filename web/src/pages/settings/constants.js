export const SEGMENT_OPTIONS = [
  { value: 'off', label: 'Вимкнути' },
  { value: 'timeline', label: 'Показувати на повзунку' },
  { value: 'manual', label: 'Ручний скіп' },
  { value: 'auto', label: 'Авто скіп' },
];

export const SEGMENT_TYPES = [
  {
    key: 'intro',
    title: 'Інтро',
    description: 'Вступна заставка / опенінг',
    color: '#00c853',
  },
  {
    key: 'credits',
    title: 'Титри',
    description: 'Фінальні титри / закінчення',
    color: '#7c4dff',
  },
  {
    key: 'recap',
    title: 'Переказ',
    description: 'Короткий зміст попередніх серій',
    color: '#00b0ff',
  },
  {
    key: 'preview',
    title: 'Анонс',
    description: 'Анонс наступної серії',
    color: '#ff9100',
  },
];

export const DEFAULT_SEGMENTS = {
  intro: 'manual',
  credits: 'manual',
  recap: 'manual',
  preview: 'manual',
};

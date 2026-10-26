export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Найновіші додані' },
  { value: 'date_asc', label: 'Найстаріші додані' },
  { value: 'title_asc', label: 'За назвою (А - Я)' },
  { value: 'title_desc', label: 'За назвою (Я - А)' },
  { value: 'year_desc', label: 'За роком (спочатку нові)' },
  { value: 'year_asc', label: 'За роком (спочатку старі)' },
];

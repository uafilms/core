import { findAndFilter } from 'swearify';

export const filterText = (text, enabled) => {
  if (!enabled || !text) return text;
  const result = findAndFilter(text, '*', ['uk', 'ru', 'en']);
  return result.filtered_sentense;
};

import type { OmssSource } from '../types.js';

interface FilterCondition {
  field: string;
  operator: '==' | '!=' | '=in=' | '=out=';
  values: string[];
}

function matchWildcard(pattern: string, text: string): boolean {
  if (pattern === '*') return true;
  const regexPattern = '^' + pattern.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&').replace(/\*/g, '.*') + '$';
  const regex = new RegExp(regexPattern, 'i');
  return regex.test(text);
}

export function parseFilterExpression(filterStr: string): FilterCondition[] {
  if (!filterStr || !filterStr.trim()) return [];

  const rawConditions = filterStr.split(';').map(c => c.trim()).filter(Boolean);
  const conditions: FilterCondition[] = [];

  for (const raw of rawConditions) {
    // Check =in= or =out=
    const inOutMatch = raw.match(/^([a-zA-Z0-9_.]+)(=in=|=out=)\(([^)]*)\)$/);
    if (inOutMatch) {
      const field = inOutMatch[1];
      const operator = inOutMatch[2] as '=in=' | '=out=';
      const values = inOutMatch[3].split(',').map(v => v.trim()).filter(Boolean);
      conditions.push({ field, operator, values });
      continue;
    }

    // Check == or !=
    const eqMatch = raw.match(/^([a-zA-Z0-9_.]+)(==|!=)(.*)$/);
    if (eqMatch) {
      const field = eqMatch[1];
      const operator = eqMatch[2] as '==' | '!=';
      const val = eqMatch[3].trim();
      conditions.push({ field, operator, values: [val] });
      continue;
    }

    throw new Error(`Invalid filter condition: "${raw}"`);
  }

  return conditions;
}

export function applyFilterToSources(sources: OmssSource[], filterStr?: string): OmssSource[] {
  if (!filterStr || !filterStr.trim()) return sources;

  const conditions = parseFilterExpression(filterStr);
  if (conditions.length === 0) return sources;

  return sources.filter(source => {
    return conditions.every(cond => {
      let fieldValue: unknown;

      if (cond.field === 'quality') fieldValue = source.quality;
      else if (cond.field === 'type') fieldValue = source.type;
      else if (cond.field === 'streamable') fieldValue = String(source.streamable);
      else if (cond.field === 'provider.id') fieldValue = source.provider.id;
      else if (cond.field === 'provider.name') fieldValue = source.provider.name;
      else if (cond.field === 'audioTracks') fieldValue = source.audioTracks;
      else {
        // Unknown field
        return true;
      }

      if (Array.isArray(fieldValue)) {
        // Array field like audioTracks
        const arr = fieldValue.map(v => String(v));
        if (cond.operator === '==') {
          return arr.some(item => matchWildcard(cond.values[0], item));
        }
        if (cond.operator === '!=') {
          return !arr.some(item => matchWildcard(cond.values[0], item));
        }
        if (cond.operator === '=in=') {
          return arr.some(item => cond.values.some(v => matchWildcard(v, item)));
        }
        if (cond.operator === '=out=') {
          return !arr.some(item => cond.values.some(v => matchWildcard(v, item)));
        }
        return true;
      }

      const strVal = String(fieldValue ?? '');

      if (cond.operator === '==') {
        return matchWildcard(cond.values[0], strVal);
      }
      if (cond.operator === '!=') {
        return !matchWildcard(cond.values[0], strVal);
      }
      if (cond.operator === '=in=') {
        return cond.values.some(v => matchWildcard(v, strVal));
      }
      if (cond.operator === '=out=') {
        return !cond.values.some(v => matchWildcard(v, strVal));
      }

      return true;
    });
  });
}

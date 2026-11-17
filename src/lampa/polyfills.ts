/**
 * ES5 runtime shims for old Smart TV browsers.
 *
 * The plugin bundle is lowered to ES5, but the engines it targets (webOS,
 * Tizen, old Android boxes) also miss most ES2015 library additions. The
 * polyfills below cover the APIs the plugin actually uses, so it can run on
 * browsers that only understand ES5 syntax.
 */

declare const window: any;

type AnyObject = Record<string, any>;

function define(target: any, name: string, value: any): void {
  if (!target || typeof target[name] === 'function') return;
  try {
    Object.defineProperty(target, name, {
      value,
      configurable: true,
      writable: true,
      enumerable: false,
    });
  } catch {
    target[name] = value;
  }
}

function installPolyfills(): void {
  if (typeof Object === 'undefined') return;

  define(Object, 'assign', function (target: AnyObject) {
    if (target === null || target === undefined) {
      throw new TypeError('Cannot convert undefined or null to object');
    }
    const to = Object(target);
    for (let i = 1; i < arguments.length; i++) {
      const source = arguments[i];
      if (source === null || source === undefined) continue;
      for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          to[key] = source[key];
        }
      }
    }
    return to;
  });

  define(Object, 'entries', function (target: AnyObject) {
    const result: any[] = [];
    const object = Object(target);
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        result.push([key, object[key]]);
      }
    }
    return result;
  });

  define(Object, 'values', function (target: AnyObject) {
    const result: any[] = [];
    const object = Object(target);
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        result.push(object[key]);
      }
    }
    return result;
  });

  define(Array, 'from', function (items: any, mapFn?: (value: any, index: number) => any) {
    const result: any[] = [];
    if (items === null || items === undefined) return result;

    if (typeof items.length === 'number') {
      for (let i = 0; i < items.length; i++) {
        result.push(mapFn ? mapFn(items[i], i) : items[i]);
      }
      return result;
    }

    if (typeof Symbol !== 'undefined' && items[Symbol.iterator]) {
      const iterator = items[Symbol.iterator]();
      let step = iterator.next();
      while (!step.done) {
        result.push(mapFn ? mapFn(step.value, result.length) : step.value);
        step = iterator.next();
      }
    }

    return result;
  });

  define(Array.prototype, 'includes', function (this: any[], search: any, fromIndex?: number) {
    if (this === null || this === undefined) {
      throw new TypeError('Array.prototype.includes called on null or undefined');
    }
    const length = Number(this.length) || 0;
    let index = Number(fromIndex) || 0;
    if (index < 0) index = Math.max(length + index, 0);
    for (; index < length; index++) {
      const value = this[index];
      if (value === search || (value !== value && search !== search)) return true;
    }
    return false;
  });

  define(Array.prototype, 'find', function (this: any[], predicate: any, thisArg?: any) {
    const length = Number(this.length) || 0;
    for (let i = 0; i < length; i++) {
      const value = this[i];
      if (predicate.call(thisArg, value, i, this)) return value;
    }
    return undefined;
  });

  define(Array.prototype, 'findIndex', function (this: any[], predicate: any, thisArg?: any) {
    const length = Number(this.length) || 0;
    for (let i = 0; i < length; i++) {
      if (predicate.call(thisArg, this[i], i, this)) return i;
    }
    return -1;
  });

  define(String.prototype, 'includes', function (this: string, search: any, position?: number) {
    const start = Number(position) || 0;
    return String(this).indexOf(String(search), start) !== -1;
  });

  define(String.prototype, 'startsWith', function (this: string, search: any, position?: number) {
    const start = Number(position) || 0;
    return String(this).slice(start, start + String(search).length) === String(search);
  });

  define(String.prototype, 'endsWith', function (this: string, search: any, position?: number) {
    const text = String(this);
    const end = position === undefined ? text.length : Math.min(Number(position) || 0, text.length);
    const target = String(search);
    return text.slice(end - target.length, end) === target;
  });

  define(String.prototype, 'repeat', function (this: string, count: number) {
    const text = String(this);
    let result = '';
    for (let i = 0; i < count; i++) result += text;
    return result;
  });

  define(String.prototype, 'padStart', function (this: string, length: number, pad?: string) {
    const text = String(this);
    let filler = pad === undefined ? ' ' : String(pad);
    const target = Number(length) || 0;
    if (text.length >= target || !filler) return text;
    let prefix = '';
    while ((prefix + text).length < target) prefix += filler;
    return prefix.slice(0, target - text.length) + text;
  });
}

if (typeof window !== 'undefined') {
  installPolyfills();
}

export {};

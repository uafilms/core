const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

export function log(scope: string, message: string, ...args: any[]) {
  console.log(`${c.cyan}${scope.toLowerCase()}${c.reset} ${message.toLowerCase()}`, ...args);
}

export function logWarn(scope: string, message: string, ...args: any[]) {
  console.warn(`${c.yellow}${scope.toLowerCase()}${c.reset} ${message.toLowerCase()}`, ...args);
}

export function logError(scope: string, message: string, ...args: any[]) {
  console.error(`${c.red}${scope.toLowerCase()}${c.reset} ${message.toLowerCase()}`, ...args);
}

export function formatHttpLog(method: string, path: string, status: number, duration: number) {
  const statusColor = status >= 500 ? c.red : status >= 400 ? c.yellow : status >= 300 ? c.cyan : c.green;
  return `${c.cyan}uafilms${c.reset} ${c.dim}${method.toLowerCase()}${c.reset} ${path} ${statusColor}${status}${c.reset} ${c.dim}${duration}ms${c.reset}`;
}

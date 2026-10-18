/** JSON.parse з повторною спробою після зняття екранування лапок. */
export function parsePlayerjsJson(value: string): any | null {
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(value.replace(/\\'/g, "'").replace(/\\"/g, '"'));
    } catch {
      return null;
    }
  }
}

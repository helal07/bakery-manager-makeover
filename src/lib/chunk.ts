/**
 * Split a long id list into small groups. A long `.in()` filter makes the
 * request URL too big for the server proxy (HTTP 414), so callers fetch each
 * group in parallel and merge the rows.
 */
export function chunk<T>(items: T[], size = 20): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

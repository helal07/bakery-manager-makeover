/**
 * Strict location scoping.
 *
 * The whole app has exactly two kinds of location:
 *   - Factory  → `showroom_id IS NULL`
 *   - Showroom → `showroom_id = <id>`
 *
 * There is no "all locations" query. Every query against a location-scoped
 * table MUST go through `scopeTo` so a showroom can never read factory rows
 * (or another showroom's rows) by accidentally omitting the filter.
 */
export function scopeTo<T extends { eq: (c: string, v: unknown) => T; is: (c: string, v: null) => T }>(
  query: T,
  showroomId: string | null | undefined,
  column = "showroom_id",
): T {
  return showroomId ? query.eq(column, showroomId) : query.is(column, null);
}

/** True when the given scope means the factory. */
export function isFactoryScope(showroomId: string | null | undefined): boolean {
  return !showroomId;
}

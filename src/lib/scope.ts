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
export function scopeTo<T>(
  query: T,
  showroomId: string | null | undefined,
  column = "showroom_id",
): T {
  const q = query as any;
  return (showroomId ? q.eq(column, showroomId) : q.is(column, null)) as T;
}


/** True when the given scope means the factory. */
export function isFactoryScope(showroomId: string | null | undefined): boolean {
  return !showroomId;
}

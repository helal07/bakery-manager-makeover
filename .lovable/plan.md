# Make RBAC checks fast: load permissions once per session

## What's slow today

Confirmed by reading the code:

- `src/hooks/use-permissions.ts` runs three backend calls on **every mount** (`auth.getUser`,
  a `user_roles` read, and a `user_role_assignments` + `role_permissions` join). Nothing is cached.
- That hook is mounted by `src/components/app-shell.tsx`, by `PermissionGate`
  (`src/components/permission-gate.tsx`), and separately by ~10 page routes
  (production, recipes, sub-recipes, raw materials, employees, settings/access, etc.).
  So one navigation can fire the same permission queries several times over.
- `src/routes/_authenticated/route.tsx` `beforeLoad` also re-checks the session and role rows,
  and `src/hooks/use-showroom-scope.tsx` repeats the same `user_roles` + assignments reads again.
- `PermissionGate` renders a full-page "Checking permissions…" state while it loads, so every
  gated page visibly waits for its own round-trip.

Net effect: 5-8 duplicated permission requests per page change, plus a flash of the loading state.

## The fix: one cached permission source

1. **Wrap the permission load in TanStack Query** with a single stable key (`["rbac", userId]`),
   `staleTime` of ~5 minutes and `gcTime` longer, so repeated mounts reuse one in-flight/cached result
   instead of issuing new requests.
2. **Provide it through context** (`RbacProvider` mounted once inside the `_authenticated` layout,
   next to `ShowroomScopeProvider`). `usePermissions()` keeps its current API
   (`loading`, `isSuperadmin`, `permissions`, `can`, `canIn`, `hasAny`, `reload`) and just reads
   the context, so no call site has to change.
3. **Collapse the duplicated role reads**: the layout `beforeLoad`, the showroom scope, and the
   permission hook all query the same rows. They will share the one cached RBAC fetch — `beforeLoad`
   reads it via the router's query client (`ensureQueryData`) rather than issuing its own queries,
   and `use-showroom-scope` consumes the already-loaded roles/assignments instead of re-fetching.
4. **Persist across reloads** with a short-lived `localStorage` snapshot keyed by user id (same
   pattern already used for company settings and profile). On a hard refresh the UI renders from the
   snapshot immediately and revalidates in the background, removing the "Checking permissions…" flash.
5. **Invalidate on the events that matter**: sign-in/sign-out (existing `onAuthStateChange`),
   and after role/permission edits in `settings.access.tsx` — those call `reload()`, which will now
   invalidate the shared query key so every consumer updates at once.

## Result

- Permissions are fetched once per session (and refreshed in the background), not once per page.
- Navigation between gated pages is instant — no loading gate, no repeated round-trips.
- Access rules stay server-enforced: this is only client-side caching for UI gating; the database
  RLS policies remain the real boundary, so caching cannot grant extra access.

## Technical notes

- Files touched: `src/hooks/use-permissions.ts` (rewritten as provider + context hook),
  `src/routes/_authenticated/route.tsx` (mount provider, reuse cached data in `beforeLoad`),
  `src/hooks/use-showroom-scope.tsx` (consume shared RBAC data), and a small
  `src/lib/rbac-cache.ts` for the snapshot helpers.
- No database migration, no schema or policy change.
- `PermissionGate` keeps its deny UI but will only show the loading state on a genuine cold start.

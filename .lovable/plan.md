# Location Picker on Login + Switch Location Menu

Remove confusion about which showroom/factory you are working in, by forcing an explicit choice at sign-in and making the active location always visible and switchable.

## What you get

1. **Location chooser after login**
   - After a successful sign-in, before the dashboard is usable, a full-screen card shows every location the user is permitted to use (from their role assignments):
     - "Factory / All locations" tile — only for users with global access (superadmin/owner or a global role assignment).
     - One tile per assigned showroom, with name, code and city.
   - Clicking a tile locks the session to that location; all pages then work only in that scope.
   - Skipped automatically when the user has exactly one possible choice (single assigned showroom, no global access) — it is selected silently.
   - Appears once per sign-in (per browser session). Reloading a page later does not re-ask; the stored choice is reused.

2. **Always-visible active location**
   - The sticky header shows the current location as a labelled badge ("Factory" or the showroom name) instead of a bare dropdown, so it reads as state, not a filter.

3. **"Switch Location" in the menu**
   - New sidebar entry (near the top, above Dashboard-adjacent items) listing only the locations the user's roles grant.
   - Opens the same chooser screen; picking a location switches scope, clears cached per-location data, and returns to the dashboard.
   - Users with a single permitted location do not see the entry.

4. **Permission behaviour**
   - No new hardcoded roles. The list of tiles comes from the existing RBAC data (global access + assigned showroom ids), so an unpermitted showroom can never be selected, even by editing stored values.
   - If the stored location is no longer permitted (assignment removed), the chooser reopens on next load.

## Technical notes

- Extend `src/hooks/use-showroom-scope.tsx` with `needsSelection` (true when no valid stored choice and more than one option) and `clearSelection()`; keep the existing `setCurrentShowroomId` guards, which already reject non-permitted ids and reject `null` for non-global users.
- Track "asked this session" with a `sessionStorage` flag so the modal shows once per login, while the chosen location stays in `localStorage` under the existing `mf.currentShowroomId` key.
- New component `src/components/location-picker.tsx` rendering the tile grid; used both as the blocking overlay inside `ShowroomScopeProvider` (in `src/routes/_authenticated/route.tsx`'s component tree) and as the target of a new `/switch-location` route under `_authenticated`.
- `src/components/app-shell.tsx`: replace `ShowroomSwitcher`'s select with a read-only badge, and add the "Switch Location" nav item (rendered only when `showrooms.length + (hasGlobalAccess ? 1 : 0) > 1`).
- On switch, call `queryClient.clear()` (or invalidate all) so lists cached for the previous location are refetched.
- Sign-out already clears cache; also drop the session "asked" flag there so the next login re-prompts.

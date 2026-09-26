<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Never pass long id lists to `.in()` (>20 ids): embed the child table in `select()` or split with `chunk()` from `src/lib/chunk.ts` — the VPS proxy rejects long URLs (HTTP 414).
- Every new column used for filtering, joining or RLS (ref ids, showroom_id+date) gets an index in a numbered `sql/NN_*.sql` patch — the database grows daily.
- The Laravel 12 + MySQL 8 rewrite lives in `backend/` (migrations, models, services, API controllers); it is deployed separately on Coolify, so never import it from `src/` — the React app talks to it over HTTP only.
- `backend/` money columns are `decimal(14,2)` and quantity columns `decimal(14,4)`; ledger `qty` stays signed (IN positive, OUT negative) and `showroom_id NULL` means factory, matching the current database so no report total shifts.
- Only Laravel 12 core plus `laravel/sanctum` may be used in `backend/`; any further package needs the user's approval first.

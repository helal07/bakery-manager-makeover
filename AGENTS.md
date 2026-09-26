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

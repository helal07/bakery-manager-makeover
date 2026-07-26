import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/manifest")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

        let name = "Muzahid Food";
        let short = "Muzahid";
        const themeColor = "#7c3aed";
        const bgColor = "#ffffff";
        let iconUrl = "/favicon.ico";
        let iconType = "image/png";

        const detectType = (u: string): string => {
          const m = u.match(/^data:([^;,]+)[;,]/i);
          if (m) return m[1];
          const ext = u.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
          if (ext === "svg") return "image/svg+xml";
          if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
          if (ext === "webp") return "image/webp";
          if (ext === "ico") return "image/x-icon";
          return "image/png";
        };

        try {
          if (url && key) {
            const sb = createClient(url, key, { auth: { persistSession: false } });
            // Try is_current=true first, fall back to latest row.
            let row: { name?: string; logo_url?: string | null } | null = null;
            const primary = await sb
              .from("company_settings")
              .select("name, logo_url, updated_at")
              .eq("is_current", true)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            row = (primary.data as typeof row) ?? null;
            if (!row) {
              const fallback = await sb
                .from("company_settings")
                .select("name, logo_url, updated_at")
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              row = (fallback.data as typeof row) ?? null;
            }
            if (row?.name) {
              name = row.name;
              short = row.name.split(/\s+/)[0] || row.name;
            }
            const stored = (row?.logo_url as string) || "";
            if (stored) {
              if (/^(https?:|data:)/i.test(stored)) {
                iconUrl = stored;
              } else {
                const { data: signed } = await sb.storage
                  .from("company-logos")
                  .createSignedUrl(stored, 60 * 60 * 24 * 7);
                if (signed?.signedUrl) iconUrl = signed.signedUrl;
              }
              iconType = detectType(iconUrl);
            }
          }
        } catch {
          // fall through with defaults
        }

        const manifest = {
          name,
          short_name: short,
          description: `${name} — production, POS & inventory`,
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          theme_color: themeColor,
          background_color: bgColor,
          icons: [
            { src: iconUrl, sizes: "192x192", type: iconType, purpose: "any" },
            { src: iconUrl, sizes: "512x512", type: iconType, purpose: "any" },
            { src: iconUrl, sizes: "512x512", type: iconType, purpose: "maskable" },
          ],
        };


        return new Response(JSON.stringify(manifest), {
          status: 200,
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});

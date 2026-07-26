import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/manifest/webmanifest")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

        let name = "Muzahid Food";
        let short = "Muzahid";
        let themeColor = "#7c3aed";
        let bgColor = "#ffffff";
        let iconUrl = "/favicon.ico";

        try {
          if (url && key) {
            const sb = createClient(url, key, { auth: { persistSession: false } });
            const { data } = await sb
              .from("company_settings")
              .select("name, logo_url")
              .eq("is_current", true)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data?.name) {
              name = data.name;
              short = data.name.split(/\s+/)[0] || data.name;
            }
            const stored = (data?.logo_url as string) || "";
            if (stored) {
              if (/^(https?:|data:)/i.test(stored)) {
                iconUrl = stored;
              } else {
                const { data: signed } = await sb.storage
                  .from("company-logos")
                  .createSignedUrl(stored, 60 * 60 * 24 * 7);
                if (signed?.signedUrl) iconUrl = signed.signedUrl;
              }
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
            { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any" },
            { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any" },
            { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
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

import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_PREFIXES = ["/auth/v1", "/rest/v1", "/storage/v1", "/functions/v1"];
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "apikey",
  "authorization",
  "content-type",
  "if-match",
  "if-none-match",
  "prefer",
  "range",
  "x-client-info",
  "x-supabase-api-version",
];
const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "content-range",
  "content-type",
  "etag",
  "expires",
  "last-modified",
  "location",
  "preference-applied",
  "www-authenticate",
  "x-supabase-api-version",
];

function getTargetUrl(request: Request): URL | Response {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) return new Response("Missing backend URL", { status: 500 });

  const requestUrl = new URL(request.url);
  const target = requestUrl.searchParams.get("target");

  if (!target || !target.startsWith("/") || target.startsWith("//")) {
    return new Response("Invalid target", { status: 400 });
  }

  const targetUrl = new URL(target, supabaseUrl);
  const baseUrl = new URL(supabaseUrl);

  if (targetUrl.origin !== baseUrl.origin || !ALLOWED_PREFIXES.some((prefix) => targetUrl.pathname.startsWith(prefix))) {
    return new Response("Target not allowed", { status: 403 });
  }

  return targetUrl;
}

async function proxySupabaseRequest({ request }: { request: Request }) {
  const targetUrl = getTargetUrl(request);
  if (targetUrl instanceof Response) return targetUrl;

  const headers = new Headers();
  for (const header of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(header);
    if (value) headers.set(header, value);
  }

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });

  const responseHeaders = new Headers();
  for (const header of FORWARDED_RESPONSE_HEADERS) {
    const value = response.headers.get(header);
    if (value) responseHeaders.set(header, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const Route = createFileRoute("/api/public/supabase-proxy")({
  server: {
    handlers: {
      GET: proxySupabaseRequest,
      POST: proxySupabaseRequest,
      PUT: proxySupabaseRequest,
      PATCH: proxySupabaseRequest,
      DELETE: proxySupabaseRequest,
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
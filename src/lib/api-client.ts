import { API_BASE } from "@/lib/backend-mode";

/**
 * Small fetch-based client for the Laravel API (no extra packages).
 * - Bearer token from Sanctum
 * - X-Location-Id from the location picker ("factory" = showroom_id NULL)
 * - 401 clears the session and sends the user to /auth
 */
const TOKEN_KEY = "mf.apiToken";
const SESSION_KEY = "mf.apiSession";
const LOCATION_KEY = "mf.currentShowroomId"; // same key the location picker writes
const FACTORY_VALUE = "__factory__";

export type ApiLocation = { id: string; name: string; code: string | null; city: string | null; is_factory?: boolean | null };

export type ApiSession = {
  user: { id: string; name: string | null; email: string };
  profile: any;
  employee: any;
  roles: string[];
  permissions: string[];
  is_global_admin: boolean;
  is_factory_user: boolean;
  locations: ApiLocation[];
  can_access_factory: boolean;
};

export class ApiError extends Error {
  status: number;
  /** "42501" on 403 so existing permission checks keep working. */
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.code = status === 403 ? "42501" : undefined;
    this.details = details;
  }
}

const safeLs = {
  get(k: string) { try { return typeof window === "undefined" ? null : localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const getApiToken = () => safeLs.get(TOKEN_KEY);

export function getCachedApiSession(): ApiSession | null {
  const raw = safeLs.get(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as ApiSession; } catch { return null; }
}

function storeSession(token: string | null, session: ApiSession | null) {
  if (token) safeLs.set(TOKEN_KEY, token); else safeLs.del(TOKEN_KEY);
  if (session) safeLs.set(SESSION_KEY, JSON.stringify(session)); else safeLs.del(SESSION_KEY);
}

function currentLocationHeader(): string {
  const v = safeLs.get(LOCATION_KEY);
  return !v || v === FACTORY_VALUE ? "factory" : v;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${API_BASE}/api/${path.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function firstValidationMessage(body: any): string | null {
  const errs = body?.errors;
  if (errs && typeof errs === "object") {
    const first = Object.values(errs)[0];
    if (Array.isArray(first) && first[0]) return String(first[0]);
  }
  return null;
}

export async function apiRequest<T = any>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  opts: { query?: Query; body?: unknown; location?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getApiToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  headers["X-Location-Id"] = opts.location === undefined ? currentLocationHeader() : (opts.location ?? "factory");
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check your internet connection. / সার্ভারে সংযোগ হচ্ছে না।", 0);
  }

  const text = await res.text();
  let body: any = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }

  if (!res.ok) {
    if (res.status === 401 && path !== "auth/login") {
      storeSession(null, null);
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
        window.location.assign("/auth");
      }
    }
    const msg =
      firstValidationMessage(body) ??
      body?.message ??
      (res.status === 403 ? "You do not have permission to do this / এই কাজের অনুমতি নেই" : `Request failed (${res.status})`);
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

export const api = {
  get: <T = any>(path: string, query?: Query) => apiRequest<T>("GET", path, { query }),
  post: <T = any>(path: string, body?: unknown) => apiRequest<T>("POST", path, { body }),
  put: <T = any>(path: string, body?: unknown) => apiRequest<T>("PUT", path, { body }),
  del: <T = any>(path: string) => apiRequest<T>("DELETE", path),
};

/** Upload an image to the Laravel server; returns its public URL. */
export async function apiUpload(file: File, folder = "uploads"): Promise<{ path: string; url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", folder);
  const headers: Record<string, string> = { Accept: "application/json", "X-Location-Id": currentLocationHeader() };
  const token = getApiToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(buildUrl("uploads"), { method: "POST", headers, body: fd });
  const body: any = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(firstValidationMessage(body) ?? body?.message ?? `Upload failed (${res.status})`, res.status, body);
  return body;
}

// ---------------- auth ----------------

export async function apiLogin(email: string, password: string): Promise<ApiSession> {
  const res = await apiRequest<{ token: string; session: ApiSession }>("POST", "auth/login", {
    body: { email, password, device: "web" },
  });
  storeSession(res.token, res.session);
  return res.session;
}

/** Refreshes the session payload (roles, permissions, locations). */
export async function apiMe(): Promise<ApiSession | null> {
  if (!getApiToken()) return null;
  const session = await apiRequest<ApiSession>("GET", "auth/me");
  storeSession(getApiToken(), session);
  return session;
}

export async function apiLogout() {
  try { if (getApiToken()) await apiRequest("POST", "auth/logout"); } catch { /* token may already be gone */ }
  storeSession(null, null);
}

export async function apiChangePassword(current: string, password: string) {
  return apiRequest("POST", "auth/password", {
    body: { current_password: current, password, password_confirmation: password },
  });
}

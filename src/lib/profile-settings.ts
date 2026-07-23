import { supabase } from "@/integrations/supabase/client";

export type UserProfile = {
  name: string;
  email: string;
  phone?: string;
  bio?: string;
  avatarDataUrl?: string;
  language: "en" | "bn";
  timezone: string;
};

export type SoftwarePrefs = {
  theme: "system" | "light" | "dark";
  adminBarColor?: string;
  density: "comfortable" | "compact";
  dateFormat: "DD MMM YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY";
  lowStockAlerts: boolean;
  dailySummary: boolean;
  soundOnSale: boolean;
  autoBackup: boolean;
  backupFrequency: "daily" | "weekly" | "monthly";
  sessionTimeout: 15 | 30 | 60 | 240;
  twoFactor: boolean;
  receiptSize: "58mm" | "80mm" | "A4";
  printLogo: boolean;
};

const SOFTWARE_CACHE_KEY = "user-software-cache-v1";

export function getCachedSoftware(): SoftwarePrefs | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SOFTWARE_CACHE_KEY);
    return raw ? ({ ...defaultSoftware, ...JSON.parse(raw) } as SoftwarePrefs) : null;
  } catch { return null; }
}

export function cacheSoftware(s: SoftwarePrefs) {
  try { localStorage.setItem(SOFTWARE_CACHE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function applyThemePref(theme: SoftwarePrefs["theme"]) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const resolved = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export const defaultProfile: UserProfile = {
  name: "",
  email: "",
  phone: "",
  bio: "",
  language: "en",
  timezone: "Asia/Dhaka",
};

export const defaultSoftware: SoftwarePrefs = {
  theme: "system",
  density: "comfortable",
  dateFormat: "DD MMM YYYY",
  lowStockAlerts: true,
  dailySummary: true,
  soundOnSale: false,
  autoBackup: true,
  backupFrequency: "daily",
  sessionTimeout: 60,
  twoFactor: false,
  receiptSize: "80mm",
  printLogo: true,
};

const sb = supabase as any;

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

const PROFILE_CACHE_KEY = "user-profile-cache-v1";

export function getCachedProfile(): UserProfile | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch { return null; }
}

export async function getProfile(): Promise<UserProfile> {
  const uid = await currentUserId();
  if (!uid) return defaultProfile;
  const { data } = await sb
    .from("user_profiles")
    .select("name,email,phone,bio,avatar_url,language,timezone")
    .eq("user_id", uid)
    .maybeSingle();
  if (!data) return defaultProfile;
  const p: UserProfile = {
    name: data.name ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
    bio: data.bio ?? "",
    avatarDataUrl: data.avatar_url ?? undefined,
    language: (data.language ?? "en") as UserProfile["language"],
    timezone: data.timezone ?? "Asia/Dhaka",
  };
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  return p;
}

export async function saveProfile(p: UserProfile): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await sb.from("user_profiles").upsert(
    {
      user_id: uid,
      name: p.name,
      email: p.email,
      phone: p.phone ?? null,
      bio: p.bio ?? null,
      avatar_url: p.avatarDataUrl ?? null,
      language: p.language,
      timezone: p.timezone,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function getSoftware(): Promise<SoftwarePrefs> {
  const uid = await currentUserId();
  if (!uid) return defaultSoftware;
  const { data } = await sb
    .from("user_profiles")
    .select("software")
    .eq("user_id", uid)
    .maybeSingle();
  const merged = { ...defaultSoftware, ...((data?.software ?? {}) as Partial<SoftwarePrefs>) };
  cacheSoftware(merged);
  return merged;
}

export async function saveSoftware(s: SoftwarePrefs): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { error } = await sb.from("user_profiles").upsert(
    { user_id: uid, software: s },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  cacheSoftware(s);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("software-prefs-updated", { detail: s }));
  }
}

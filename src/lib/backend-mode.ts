/**
 * Which server the app talks to.
 *
 * Set `VITE_API_BASE_URL` (e.g. https://api.example.com) at build time to use
 * the Laravel API in `backend/`. Leave it empty to keep using the current
 * database — that is the default in Lovable while developing.
 */
export const API_BASE: string = String(import.meta.env.VITE_API_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

export const isLaravel = (): boolean => API_BASE.length > 0;

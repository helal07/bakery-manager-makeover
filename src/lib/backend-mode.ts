/**
 * App communicates exclusively with the local Laravel 12 API backend.
 */
export const API_BASE: string = String(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000")
  .trim()
  .replace(/\/+$/, "");

export const isLaravel = (): boolean => true;

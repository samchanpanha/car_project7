"use client";

import { useCallback, useEffect, useState } from "react";

/** localStorage keys — must mirror lib/auth.ts (LS_TOKEN_KEY/LS_PERSONA_KEY;
 *  duplicated as literals because this module is imported client-side and the
 *  server module pulls in Prisma). */
const LS_TOKEN_KEY = "khlan_ls_token";
const LS_PERSONA_KEY = "khlan_ls_persona";

/** Fallback session transport for cookie-blocked environments (embedded
 *  previews, strict third-party-cookie settings): when the browser refuses
 *  Set-Cookie, the client stores the signed token / persona id in localStorage
 *  and every API call carries them as headers. Returns {} on the server. */
export function authFallbackHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const h: Record<string, string> = {};
    const token = window.localStorage.getItem(LS_TOKEN_KEY);
    if (token) h["x-khlan-session"] = token;
    const persona = window.localStorage.getItem(LS_PERSONA_KEY);
    if (persona) h["x-khlan-persona"] = persona;
    return h;
  } catch {
    return {};
  }
}

/** Clear the localStorage fallback (logout / superseded session). */
export function clearAuthFallback(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LS_TOKEN_KEY);
    window.localStorage.removeItem(LS_PERSONA_KEY);
  } catch {
    /* ignore */
  }
}

interface FetchState<T> {
  status: "idle" | "loading" | "done" | "error";
  data: T | null;
  error: string | null;
}

export function useFetch<T>(url: string | null) {
  const [state, setState] = useState<FetchState<T>>(() => ({
    status: url ? "loading" : "idle",
    data: null,
    error: null,
  }));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const run = async () => {
      // yield once so state updates happen outside the synchronous effect body
      await Promise.resolve();
      if (cancelled) return;
      setState((s) => ({ ...s, status: "loading", error: null }));
      try {
        const res = await fetch(url, { headers: authFallbackHeaders() });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
        setState({ status: "done", data: json as T, error: null });
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({ ...s, status: "error", error: e instanceof Error ? e.message : "Request failed" }));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [url, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  const loading = url ? state.status === "loading" || state.status === "idle" : false;
  return { data: state.data, loading, error: state.error, refetch };
}

/** POST/DELETE/PATCH/PUT/GET helpers with JSON */
export async function apiSend<T>(
  url: string,
  method: "POST" | "DELETE" | "PATCH" | "PUT" | "GET" = "POST",
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      ...authFallbackHeaders(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}

/** Builds a query string, skipping empty values */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

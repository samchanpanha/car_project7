"use client";

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { useTheme } from "next-themes";
import { ShieldCheck } from "lucide-react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: (error?: unknown) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
          [key: string]: unknown;
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
      getResponse: (widgetId: string) => string | undefined;
    };
  }
}

export interface TurnstileRef {
  reset: () => void;
  getResponse: () => string | undefined;
}

export interface TurnstileProps {
  siteKey?: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (error?: unknown) => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact" | "flexible";
  className?: string;
}

let turnstileScriptLoadingPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptLoadingPromise) return turnstileScriptLoadingPromise;

  turnstileScriptLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
    if (existing) {
      if (window.turnstile) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", (e) => reject(e), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => {
      turnstileScriptLoadingPromise = null;
      reject(err);
    };
    document.head.appendChild(script);
  });

  return turnstileScriptLoadingPromise;
}

export const Turnstile = forwardRef<TurnstileRef, TurnstileProps>(function Turnstile(
  {
    siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
    onVerify,
    onExpire,
    onError,
    theme,
    size = "normal",
    className = "",
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const { resolvedTheme } = useTheme();
  const [fallbackMode, setFallbackMode] = useState(false);
  const [fallbackVerified, setFallbackVerified] = useState(false);

  // Stable callbacks in refs to avoid re-rendering Turnstile unnecessarily
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        if (fallbackMode) {
          setFallbackVerified(false);
          return;
        }
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
      getResponse: () => {
        if (fallbackMode) {
          return fallbackVerified ? "cf-turnstile-dummy-pass" : undefined;
        }
        if (widgetIdRef.current && window.turnstile) {
          return window.turnstile.getResponse(widgetIdRef.current);
        }
        return undefined;
      },
    }),
    [fallbackMode, fallbackVerified]
  );

  const effectiveTheme = theme || (resolvedTheme === "dark" ? "dark" : "light");

  useEffect(() => {
    let cancelled = false;

    // Set fallback timeout if script takes > 3.5s to load or fails
    const timer = setTimeout(() => {
      if (!window.turnstile && !cancelled) {
        setFallbackMode(true);
      }
    }, 3500);

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        clearTimeout(timer);

        // Clean up any previous widget instance
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // Widget may already be removed
          }
          widgetIdRef.current = null;
        }

        containerRef.current.innerHTML = "";

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: effectiveTheme,
          size,
          callback: (token: string) => {
            if (!cancelled) onVerifyRef.current?.(token);
          },
          "expired-callback": () => {
            if (!cancelled) onExpireRef.current?.();
          },
          "error-callback": (err: unknown) => {
            if (!cancelled) {
              setFallbackMode(true);
              onErrorRef.current?.(err);
            }
          },
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setFallbackMode(true);
          onErrorRef.current?.(err);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore cleanup errors on unmount
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, effectiveTheme, size]);

  if (fallbackMode) {
    return (
      <div className={`min-h-[65px] flex flex-col items-center justify-center gap-1.5 w-full max-w-[300px] ${className}`}>
        <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 w-full cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors shadow-sm select-none">
          <input
            type="checkbox"
            checked={fallbackVerified}
            onChange={(e) => {
              const checked = e.target.checked;
              setFallbackVerified(checked);
              if (checked) {
                onVerifyRef.current?.("cf-turnstile-dummy-pass");
              } else {
                onExpireRef.current?.();
              }
            }}
            className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
          />
          <span className="font-medium">
            {fallbackVerified ? "Verification passed" : "I am not a robot (Click to verify)"}
          </span>
          <ShieldCheck className={`h-4 w-4 ml-auto transition-colors ${fallbackVerified ? "text-emerald-500" : "text-slate-400"}`} />
        </label>
        <span className="text-[10px] text-slate-400 font-medium">Local/Offline verification active</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`min-h-[65px] flex items-center justify-center transition-opacity ${className}`}
      aria-label="Cloudflare Turnstile Verification"
    />
  );
});


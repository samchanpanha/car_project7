"use client";

// Shared "register to continue" panel for guest-only views (messages,
// favorites, sell). Browsing stays public — these surfaces simply explain
// what an account unlocks and route to the auth view.

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { Button } from "@/components/ui/button";
import { LockKeyhole } from "lucide-react";

export function GuestPanel({ icon }: { icon?: React.ReactNode }) {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          {icon ?? <LockKeyhole className="h-6 w-6" aria-hidden />}
        </span>
        <h1 className="mt-3 text-lg font-bold text-slate-900">{t("guestPanelTitle")}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{t("guestPanelBody")}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            onClick={() => navigate({ name: "auth", tab: "signup" })}
            className="h-11 bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400"
          >
            {t("guestCtaRegister")}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate({ name: "auth", tab: "login" })}
            className="h-11 font-semibold"
          >
            {t("guestCtaLogin")}
          </Button>
        </div>
      </div>
    </div>
  );
}

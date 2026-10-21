"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, HeartHandshake, FileSearch } from "lucide-react";

export function Footer() {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  return (
    <footer className="mt-auto bg-slate-950 text-slate-300" role="contentinfo">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="text-white font-semibold text-base mb-1">
              ខ្លាន <span className="text-amber-400">KhLan</span>
            </p>
            <p className="text-sm text-slate-400">{t("footerAbout")}</p>
            <p className="mt-3 text-xs text-slate-500">{t("currencyNote")}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white mb-2">{t("footerTrust")}</p>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-400 shrink-0" aria-hidden />
                <span>{t("legendVERIFIEDHint")}</span>
              </li>
              <li className="flex items-start gap-2">
                <FileSearch className="h-4 w-4 mt-0.5 text-teal-400 shrink-0" aria-hidden />
                <span>{t("footerAiNote")}</span>
              </li>
              <li className="flex items-start gap-2">
                <HeartHandshake className="h-4 w-4 mt-0.5 text-amber-400 shrink-0" aria-hidden />
                <span>{t("safetyNote")}</span>
              </li>
            </ul>
          </div>
          <div className="flex sm:justify-end">
            <nav className="flex flex-col gap-1.5 text-sm" aria-label="Footer">
              <button className="text-left hover:text-white cursor-pointer" onClick={() => navigate({ name: "browse" })}>
                {t("navBrowse")}
              </button>
              <button className="text-left hover:text-white cursor-pointer" onClick={() => navigate({ name: "sell" })}>
                {t("navSell")}
              </button>
              <button className="text-left hover:text-white cursor-pointer" onClick={() => navigate({ name: "favorites" })}>
                {t("navFavorites")}
              </button>
              <button className="text-left hover:text-white cursor-pointer" onClick={() => navigate({ name: "messages" })}>
                {t("navMessages")}
              </button>
            </nav>
          </div>
        </div>
        <Separator className="my-5 bg-slate-800" />
        <p className="text-xs text-slate-500 text-center">
          © {new Date().getFullYear()} KhLan ខ្លាន · {t("footerDemo")}
        </p>
      </div>
    </footer>
  );
}

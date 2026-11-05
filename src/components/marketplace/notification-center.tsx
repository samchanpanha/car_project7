"use client";

import { useAppStore } from "@/lib/store";
import { useRealtime, useRealtimeEvent, type RealtimeEvent } from "@/hooks/use-realtime";
import { useT } from "@/hooks/use-t";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";

/**
 * Keeps the realtime SSE stream open app-wide and funnels every meaningful
 * event into the in-session notification store. Mounted once in <AppChrome>
 * (authed users only — `useRealtime` already no-ops for guests).
 */
export function RealtimeNotifications() {
  useRealtime();
  const pushNotification = useAppStore((s) => s.pushNotification);
  useRealtimeEvent("*", (ev: RealtimeEvent) => {
    pushNotification({ type: ev.type, title: ev.title, message: ev.message });
  });
  return null;
}

/** Header bell — opens the in-session notification list (unread badge). */
export function NotificationBell() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const notifications = useAppStore((s) => s.notifications);
  const unread = useAppStore((s) => s.unread);
  const markNotificationsRead = useAppStore((s) => s.markNotificationsRead);
  const clearNotifications = useAppStore((s) => s.clearNotifications);

  return (
    <DropdownMenu onOpenChange={(open) => open && markNotificationsRead()}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition-colors hover:bg-slate-900 hover:text-white cursor-pointer"
          aria-label={t("notificationTitle")}
          aria-haspopup="menu"
        >
          <Bell className="h-4 w-4" aria-hidden />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("notificationTitle")}</span>
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={clearNotifications}
              className="text-[10px] font-semibold text-slate-400 hover:text-rose-600 cursor-pointer"
            >
              {t("clearAction")}
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Inbox className="mx-auto h-6 w-6 text-slate-300" aria-hidden />
            <p className="mt-2 text-xs text-slate-500">{t("notificationEmpty")}</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto kl-scroll">
            {notifications.map((n) => (
              <div key={n.id} className={cn("border-b border-slate-100 px-4 py-2.5 last:border-0")}>
                <p className="text-xs font-semibold text-slate-800">{n.title || n.type}</p>
                {n.message && (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 line-clamp-2">{n.message}</p>
                )}
                <p className="mt-1 text-[10px] text-slate-400">
                  {timeAgo(new Date(n.at).toISOString(), locale)}
                </p>
              </div>
            ))}
          </div>
        )}

        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={markNotificationsRead}
              className="w-full px-4 py-2 text-center text-[11px] font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              <CheckCheck className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              {t("notificationMarkAllRead")}
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

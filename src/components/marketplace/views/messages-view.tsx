"use client";

import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { useFetch, apiSend } from "@/lib/client-hooks";
import type { ConversationDetailDTO, ConversationListItemDTO, MessageDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2, MessageSquarePlus, Search, Send, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function MessagesView({ conversationId }: { conversationId?: string }) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);

  const list = useFetch<{ conversations: ConversationListItemDTO[] }>("/api/conversations");
  // parent remounts this component with a new key when navigation changes conversationId
  const [activeId, setActiveId] = useState<string | undefined>(conversationId);

  const conversations = list.data?.conversations ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 md:pb-10">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4">{t("messagesTitle")}</h1>
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        {/* Thread list */}
        <aside
          className={cn(
            "rounded-xl border border-slate-200 bg-white overflow-hidden",
            activeId && "hidden md:block"
          )}
        >
          <div className="p-3 border-b border-slate-100 flex items-center gap-2 text-xs text-slate-400">
            <Search className="h-3.5 w-3.5" aria-hidden />
            {conversations.length} {locale === "km" ? "ការសន្ទនា" : "conversations"}
          </div>
          {list.loading && !list.data ? (
            <div className="p-3 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquarePlus className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
              <p className="mt-3 text-sm font-medium text-slate-700">{t("noConversations")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("noConversationsHint")}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate({ name: "browse" })}>
                {t("navBrowse")}
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto kl-scroll">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      "flex w-full items-center gap-3 p-3 text-left transition-colors cursor-pointer hover:bg-slate-50",
                      activeId === c.id && "bg-amber-50/70"
                    )}
                  >
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {c.vehicle.thumbnail ? (
                         
                        <img src={c.vehicle.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">{c.sellerName}</span>
                        {c.lastMessage && (
                          <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(c.lastMessage.createdAt, locale)}</span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {c.vehicle.make} {c.vehicle.model} · {c.vehicle.year}
                      </span>
                      <span className={cn("block truncate text-xs", c.lastMessage?.isMine ? "text-slate-400" : "text-slate-600 font-medium")}>
                        {c.lastMessage ? c.lastMessage.body : "—"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 p-3 flex items-start gap-2 bg-slate-50">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" aria-hidden />
            <p className="text-[11px] leading-snug text-slate-500">{t("safetyNote")}</p>
          </div>
        </aside>

        {/* Thread */}
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[420px] flex flex-col">
          {activeId ? (
            <Thread key={activeId} conversationId={activeId} onBack={() => setActiveId(undefined)} />
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center text-sm text-slate-400">
              {t("selectConversation")}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Thread({ conversationId, onBack }: { conversationId: string; onBack: () => void }) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const { data, loading, refetch } = useFetch<{ conversation: ConversationDetailDTO }>(
    `/api/conversations/${conversationId}`
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages: MessageDTO[] = data?.conversation.messages ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (body.length < 2) return;
    setSending(true);
    try {
      await apiSend(`/api/conversations/${conversationId}/messages`, "POST", { body });
      setDraft("");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setSending(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex-1 space-y-3 p-4">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-12 w-1/2 ml-auto" />
        <Skeleton className="h-12 w-2/3" />
      </div>
    );
  }
  const conv = data?.conversation;
  if (!conv) return null;

  return (
    <>
      {/* Thread header */}
      <div className="flex items-center gap-3 border-b border-slate-100 p-3">
        <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={onBack} aria-label={t("backToResults")}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Button>
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
          {conv.vehicle.thumbnail ? (
             
            <img src={conv.vehicle.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {conv.seller.shopName || conv.seller.name}
            {conv.seller.verified && <span className="ml-1 text-emerald-600">✓</span>}
          </p>
          <button
            onClick={() => navigate({ name: "detail", vehicleId: conv.vehicle.id })}
            className="truncate text-xs text-amber-600 hover:underline cursor-pointer"
          >
            {conv.vehicle.make} {conv.vehicle.model} {conv.vehicle.year}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto kl-scroll p-4 space-y-2.5 max-h-[52vh] min-h-[320px]">
        {messages.map((m) =>
          m.isSystem ? (
            <div key={m.id} className="mx-auto max-w-sm rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="flex items-start justify-center gap-1.5 text-[11px] leading-relaxed text-amber-800">
                <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
                {m.body}
              </p>
            </div>
          ) : (
            <div key={m.id} className={cn("flex", m.isMine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-line",
                  m.isMine
                    ? "rounded-br-md bg-amber-500 text-slate-950"
                    : "rounded-bl-md bg-slate-100 text-slate-800"
                )}
              >
                {m.body}
                <span className={cn("mt-0.5 block text-right text-[10px]", m.isMine ? "text-slate-700/70" : "text-slate-400")}>
                  {timeAgo(m.createdAt, locale)}
                </span>
              </div>
            </div>
          )
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-100 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("typeMessage")}
            maxLength={1000}
            className="flex-1"
            aria-label={t("typeMessage")}
          />
          <Button
            type="submit"
            disabled={sending || draft.trim().length < 2}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950"
            aria-label={t("send")}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          </Button>
        </form>
      </div>
    </>
  );
}

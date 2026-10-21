"use client";

import { useAppStore, isGuest } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { apiSend } from "@/lib/client-hooks";

export function ContactDialog({
  open,
  onOpenChange,
  vehicleId,
  sellerName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vehicleId: string;
  sellerName: string;
}) {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const navigate = useAppStore((s) => s.navigate);
  const me = useAppStore((s) => s.me);
  const [message, setMessage] = useState(
    locale === "km" ? "សួស្តី ឡាននៅមានទេ?" : "Hello, is this car still available?"
  );
  const [sending, setSending] = useState(false);

  const templates =
    locale === "km"
      ? ["សួស្តី ឡាននៅមានទេ?", "តើអាចមកមើលឡានចុងសប្តាហ៍នេះបានទេ?", "តម្លៃអាចចរចាបានទេ? មានឯកសារអ្វីខ្លះ?"]
      : [t("template1"), t("template2"), t("template3")];

  const send = async () => {
    // Defense in depth: the CTAs are already gated — guests route to register.
    if (isGuest(me)) {
      onOpenChange(false);
      toast.info(t("authRequiredToast"));
      navigate({ name: "auth", tab: "signup" });
      return;
    }
    if (!message.trim() || message.trim().length < 2) return;
    setSending(true);
    try {
      const res = await apiSend<{ conversationId: string }>("/api/conversations", "POST", {
        vehicleId,
        message: message.trim(),
      });
      toast.success(t("contactSent"));
      onOpenChange(false);
      navigate({ name: "messages", conversationId: res.conversationId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorGeneric"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("contactTitle", { seller: sellerName })}</DialogTitle>
          <DialogDescription className="flex items-start gap-1.5 text-amber-700">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
            {t("safetyNote")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {templates.map((tpl) => (
              <button
                key={tpl}
                onClick={() => setMessage(tpl)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:border-amber-400 hover:text-amber-700 transition-colors cursor-pointer"
              >
                {tpl}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-message">{t("contactMessageLabel")}</Label>
            <Textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={1000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={send}
            disabled={sending || message.trim().length < 2}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
          >
            {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
            {t("contactSend")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

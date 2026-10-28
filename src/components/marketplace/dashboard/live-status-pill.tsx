"use client";

import { useRealtime, type ConnectionStatus } from "@/hooks/use-realtime";
import { useState } from "react";
import { apiSend } from "@/lib/client-hooks";
import { toast } from "sonner";
import { Loader2, Radio, Send, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LiveStatusPill({ className }: { className?: string }) {
  const { status, lastEvent } = useRealtime();
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  const sendTestPing = async () => {
    setTesting(true);
    try {
      await apiSend("/api/realtime/test", "POST");
      toast.success("Test ping sent to your stream!");
    } catch (e) {
      toast.error("Failed to send test event");
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Real-Time Synchronization Status"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer border shadow-xs hover:opacity-90",
          status === "connected" && "bg-emerald-50 text-emerald-800 border-emerald-200/80",
          status === "connecting" && "bg-amber-50 text-amber-800 border-amber-200/80 animate-pulse",
          status === "disconnected" && "bg-slate-100 text-slate-600 border-slate-200",
          className,
        )}
      >
        <span className="relative flex h-2 w-2">
          {status === "connected" && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              status === "connected" && "bg-emerald-500",
              status === "connecting" && "bg-amber-500",
              status === "disconnected" && "bg-slate-400",
            )}
          />
        </span>
        <span className="font-semibold">
          {status === "connected" && "Live Sync"}
          {status === "connecting" && "Connecting..."}
          {status === "disconnected" && "Offline"}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Radio className="h-5 w-5 text-emerald-600" />
              Real-Time Server Synchronization
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Your browser maintains a live Server-Sent Events (SSE) connection with the KhLan server.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="text-slate-600 font-medium">Connection Status:</span>
              <span className="flex items-center gap-1.5 font-bold">
                {status === "connected" && (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-emerald-700">Connected (Active)</span>
                  </>
                )}
                {status === "connecting" && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                    <span className="text-amber-700">Connecting...</span>
                  </>
                )}
                {status === "disconnected" && (
                  <>
                    <AlertCircle className="h-4 w-4 text-slate-500" />
                    <span className="text-slate-600">Disconnected</span>
                  </>
                )}
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5">
              <p className="font-semibold text-slate-800">Live Channels Synchronized:</p>
              <ul className="list-disc pl-4 text-slate-600 space-y-0.5">
                <li>Instant Telegram Bot Auto-Link detection</li>
                <li>Live Subscription Approval & Activation</li>
                <li>New Customer Test-Drive Appointments</li>
                <li>Real-Time Inquiries & Leads</li>
              </ul>
            </div>

            {lastEvent && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="font-semibold text-slate-700">Last Received Event:</span>
                <p className="mt-1 font-mono text-[11px] text-slate-800 bg-white p-2 rounded border border-slate-200">
                  {lastEvent.type} {lastEvent.title ? `· ${lastEvent.title}` : ""}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={sendTestPing}
              disabled={testing || status !== "connected"}
              className="text-xs"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Send Test Ping
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)} className="bg-slate-900 text-white text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


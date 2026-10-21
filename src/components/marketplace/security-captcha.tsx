"use client";

// Security Verification — English click-in-order captcha dialog, modeled on
// the classic "click the characters in order" verification: a photo-style
// panel with scattered, rotated letters, an instruction showing the target
// order, and a Refresh control. The server minted challenge is verified via
// POST /api/auth/captcha/verify which returns a single-use captchaToken that
// the parent form exchanges for login/registration.

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/hooks/use-t";
import { apiSend } from "@/lib/client-hooks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CaptchaTokenDTO {
  letter: string;
  x: number;
  y: number;
  rot: number;
}

interface CaptchaChallengeDTO {
  id: string;
  word: string;
  tokens: CaptchaTokenDTO[];
  expiresInSeconds: number;
}

export function SecurityCaptcha({
  open,
  onOpenChange,
  onVerified,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** called once with the single-use captcha token after a correct sequence */
  onVerified: (captchaToken: string) => void;
}) {
  const t = useT();
  const [challenge, setChallenge] = useState<CaptchaChallengeDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [clicked, setClicked] = useState<number[]>([]); // indexes into challenge.tokens
  const [error, setError] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [shake, setShake] = useState(0);
  const busyRef = useRef(false);

  const loadChallenge = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(false);
    setClicked([]);
    try {
      const res = await fetch("/api/auth/captcha", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text().catch(() => "Failed to load"));
      setChallenge((await res.json()) as CaptchaChallengeDTO);
    } catch {
      setChallenge(null);
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  }, []);

  // Load (or reload) a challenge each time the dialog opens.
  useEffect(() => {
    if (open) void loadChallenge();
  }, [open, loadChallenge]);

  const refresh = () => {
    if (challenge) {
      // best-effort abandon of the old challenge server-side
      void fetch("/api/auth/captcha", { cache: "no-store" }).catch(() => undefined);
    }
    void loadChallenge();
  };

  const completeSequence = useCallback(
    async (seq: number[], ch: CaptchaChallengeDTO) => {
      setVerifying(true);
      try {
        const res = await apiSend<{ ok: boolean; captchaToken: string }>(
          "/api/auth/captcha/verify",
          "POST",
          { id: ch.id, sequence: seq.map((i) => ch.tokens[i].letter).join("") },
        );
        toast.success(t("captchaSuccessToast"));
        setChallenge(null);
        onVerified(res.captchaToken);
        onOpenChange(false);
      } catch {
        setError(true);
        setShake((s) => s + 1);
        setClicked([]);
        // wrong order → a fresh puzzle keeps the flow simple and safe
        setTimeout(() => void loadChallenge(), 900);
      } finally {
        setVerifying(false);
      }
    },
    [loadChallenge, onOpenChange, onVerified, t],
  );

  const clickLetter = (index: number) => {
    if (!challenge || verifying || loading) return;
    if (clicked.includes(index)) return;
    const expected = challenge.word[clicked.length];
    const letter = challenge.tokens[index].letter;
    if (letter !== expected) {
      // wrong next letter → flash, reset, refresh puzzle shortly
      setError(true);
      setShake((s) => s + 1);
      setClicked([]);
      setTimeout(() => void loadChallenge(), 900);
      return;
    }
    setError(false);
    const next = [...clicked, index];
    setClicked(next);
    if (next.length === challenge.word.length) {
      void completeSequence(next, challenge);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setChallenge(null);
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-600" aria-hidden />
            {t("captchaTitle")}
          </DialogTitle>
          <DialogDescription>{t("captchaSubtitle")}</DialogDescription>
        </DialogHeader>

        {/* instruction */}
        <p className="text-sm text-slate-700" aria-live="polite">
          {t("captchaClickInOrder")}{" "}
          <span className="font-bold text-rose-600" dir="ltr">
            &ldquo;{(challenge?.word ?? "").split("").join(" ") || "…"}&rdquo;
          </span>
        </p>

        {/* photo-style panel with scattered letters */}
        <div
          key={shake}
          className={cn(
            "relative aspect-[5/3] w-full select-none overflow-hidden rounded-xl border border-slate-200",
            error && "animate-[khlan-shake_0.4s_ease-in-out]",
          )}
          style={{
            backgroundImage:
              "linear-gradient(160deg, hsl(204 60% 82%) 0%, hsl(205 55% 88%) 38%, hsl(210 40% 92%) 62%, hsl(28 32% 86%) 100%)",
          }}
          role="group"
          aria-label={t("captchaTitle")}
        >
          {/* soft "photo" texture: clouds + ground haze */}
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "radial-gradient(closest-side at 25% 30%, rgba(255,255,255,.85), transparent 70%), radial-gradient(closest-side at 70% 20%, rgba(255,255,255,.7), transparent 65%), radial-gradient(closest-side at 60% 85%, rgba(120,113,108,.25), transparent 70%)",
            }}
          />
          {/* grid lines like the reference captcha */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/3 top-0 h-full w-px bg-white/50" />
            <div className="absolute left-2/3 top-0 h-full w-px bg-white/50" />
            <div className="absolute left-0 top-1/2 h-px w-full bg-white/50" />
          </div>

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-hidden />
            </div>
          )}
          {!loading && !challenge && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <p className="text-xs text-slate-500">{t("captchaFailed")}</p>
              <Button size="sm" variant="outline" onClick={refresh} className="h-9">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                {t("captchaRefresh")}
              </Button>
            </div>
          )}
          {!loading &&
            challenge?.tokens.map((tok, i) => {
              const order = clicked.indexOf(i);
              return (
                <button
                  key={`${challenge.id}-${i}`}
                  type="button"
                  onClick={() => clickLetter(i)}
                  disabled={verifying || order >= 0}
                  aria-label={`${t("captchaClickInOrder")} ${tok.letter}`}
                  className={cn(
                    "absolute flex h-12 w-12 items-center justify-center rounded-lg text-4xl font-black text-slate-800/85 transition-opacity duration-200 hover:scale-110 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-amber-600 active:scale-95 md:text-[2.6rem] cursor-pointer",
                    order >= 0 ? "opacity-30" : "opacity-90",
                  )}
                  style={{
                    left: `${tok.x}%`,
                    top: `${tok.y}%`,
                    transform: `translate(-50%, -50%) rotate(${tok.rot}deg)`,
                    textShadow:
                      "0 1px 0 #fff, 0 -1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff, 0 0 10px rgba(255,255,255,.9)",
                  }}
                >
                  {tok.letter}
                  {order >= 0 && (
                    <span
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-950"
                      aria-hidden
                    >
                      {order + 1}
                    </span>
                  )}
                </button>
              );
            })}

          {verifying && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
              <span className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t("captchaVerifying")}
              </span>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs font-semibold text-rose-600" role="alert">
            {t("captchaFailed")}
          </p>
        )}

        {/* footer: refresh like the reference */}
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading || verifying}
            className="h-9 gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {t("captchaRefresh")}
          </Button>
          <span className="text-[11px] text-slate-400">
            {clicked.length}/{challenge?.word.length ?? 0}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

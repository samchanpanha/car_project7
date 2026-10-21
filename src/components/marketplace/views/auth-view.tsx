"use client";

// Auth view (Task 6-a) — password login, sign-up and OTP login.
// One centered card on the single-route SPA; every success triggers a full
// reload so SessionBoot / FavoritesBoot refetch with the new session cookie.

import { useEffect, useState } from "react";
import { useT } from "@/hooks/use-t";
import { apiSend } from "@/lib/client-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CarFront, ChevronDown, Eye, EyeOff, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { DictKey } from "@/lib/i18n";

const PHONE_RE = /^\+855\d{7,9}$/;

/** Server error → localized message when the server text is recognizable. */
function localAuthError(t: ReturnType<typeof useT>, msg: string): string {
  if (/Incorrect phone number or password/i.test(msg)) return t("authErrBadCreds");
  if (/already registered/i.test(msg)) return t("authErrPhoneTaken");
  if (/Invalid or expired code/i.test(msg)) return t("authErrCodeInvalid");
  if (/No account with this phone/i.test(msg)) return t("authErrNoAccount");
  return msg;
}

function parkWelcome(name: string, isNew: boolean) {
  try {
    sessionStorage.setItem("khlan_welcome", JSON.stringify({ name, isNew }));
  } catch {
    /* ignore */
  }
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="text-xs font-medium text-rose-600" role="alert">
      {msg}
    </p>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  autoComplete?: string;
}) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete={autoComplete}
        dir="ltr"
        className="h-11 pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t("authHidePw") : t("authShowPw")}
        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 cursor-pointer"
      >
        {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}

// ---------- login ----------

function LoginForm() {
  const t = useT();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!PHONE_RE.test(phone.trim())) return setError(t("authErrPhone"));
    if (!password) return setError(t("authErrPassword"));
    setBusy(true);
    try {
      const res = await apiSend<{ ok: boolean; user: { id: string; name: string } }>(
        "/api/auth/login",
        "POST",
        { phone: phone.trim(), password },
      );
      parkWelcome(res.user.name, false);
      toast.success(t("authWelcomeBack", { name: res.user.name }));
      window.location.reload();
    } catch (err) {
      setError(localAuthError(t, err instanceof Error ? err.message : t("errorGeneric")));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-phone">{t("authPhoneLabel")}</Label>
        <Input
          id="login-phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("authPhonePlaceholder")}
          autoComplete="tel"
          className="h-11 font-mono"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password">{t("authPasswordLabel")}</Label>
        <PasswordInput
          value={password}
          onChange={setPassword}
          ariaLabel={t("authPasswordLabel")}
          autoComplete="current-password"
        />
      </div>
      <FieldError msg={error} />
      <Button type="submit" disabled={busy} className="h-11 w-full bg-slate-900 text-white hover:bg-slate-800 font-semibold">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {t("authLoginBtn")}
      </Button>
    </form>
  );
}

// ---------- sign up ----------

function SignupForm() {
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [locale, setLocaleSel] = useState<"en" | "km">("km");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!name.trim()) return setError(t("authErrName"));
    if (!PHONE_RE.test(phone.trim())) return setError(t("authErrPhone"));
    if (password.length < 8) return setError(t("authErrPassword"));
    if (password !== confirm) return setError(t("authErrConfirm"));
    setBusy(true);
    try {
      const res = await apiSend<{ ok: boolean; user: { id: string; name: string } }>(
        "/api/auth/register",
        "POST",
        { name: name.trim(), phone: phone.trim(), password, locale },
      );
      parkWelcome(res.user.name, true);
      toast.success(t("authWelcomeNew"));
      window.location.reload();
    } catch (err) {
      setError(localAuthError(t, err instanceof Error ? err.message : t("errorGeneric")));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-name">{t("authNameLabel")}</Label>
        <Input
          id="signup-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("authNamePlaceholder")}
          autoComplete="name"
          className="h-11"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-phone">{t("authPhoneLabel")}</Label>
        <Input
          id="signup-phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("authPhonePlaceholder")}
          autoComplete="tel"
          className="h-11 font-mono"
        />
        <p className="text-[11px] text-slate-400">{t("authPhoneHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-password">{t("authPasswordLabel")}</Label>
        <PasswordInput
          value={password}
          onChange={setPassword}
          ariaLabel={t("authPasswordLabel")}
          autoComplete="new-password"
        />
        <p className="text-[11px] text-slate-400">{t("authPasswordHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-confirm">{t("authConfirmLabel")}</Label>
        <PasswordInput
          value={confirm}
          onChange={setConfirm}
          ariaLabel={t("authConfirmLabel")}
          autoComplete="new-password"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("authLocaleLabel")}</Label>
        <Select value={locale} onValueChange={(v) => setLocaleSel(v === "en" ? "en" : "km")}>
          <SelectTrigger className="h-11" aria-label={t("authLocaleLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="km">ភាសាខ្មែរ (Khmer)</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <FieldError msg={error} />
      <Button
        type="submit"
        disabled={busy}
        className="h-11 w-full bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {t("authSignupBtn")}
      </Button>
    </form>
  );
}

// ---------- OTP login ----------

function OtpForm() {
  const t = useT();
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(undefined);
    if (!PHONE_RE.test(phone.trim())) return setError(t("authErrPhone"));
    setBusy(true);
    try {
      const res = await apiSend<{ ok: boolean; devCode?: string }>("/api/auth/otp/send", "POST", {
        phone: phone.trim(),
        purpose: "LOGIN",
      });
      setDevCode(res.devCode ?? null);
      setStage("code");
      setCode("");
      setCountdown(60);
    } catch (err) {
      setError(localAuthError(t, err instanceof Error ? err.message : t("errorGeneric")));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!/^\d{6}$/.test(code)) return setError(t("authErrCode"));
    setBusy(true);
    try {
      const res = await apiSend<{ ok: boolean; user: { name: string } }>(
        "/api/auth/otp/verify",
        "POST",
        { phone: phone.trim(), code, purpose: "LOGIN" },
      );
      parkWelcome(res.user.name, false);
      toast.success(t("authWelcomeBack", { name: res.user.name }));
      window.location.reload();
    } catch (err) {
      setError(localAuthError(t, err instanceof Error ? err.message : t("errorGeneric")));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {stage === "phone" ? (
        <form onSubmit={(e) => send(e)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="otp-phone">{t("authPhoneLabel")}</Label>
            <Input
              id="otp-phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("authPhonePlaceholder")}
              autoComplete="tel"
              className="h-11 font-mono"
            />
          </div>
          <FieldError msg={error} />
          <Button type="submit" disabled={busy} className="h-11 w-full bg-slate-900 text-white hover:bg-slate-800 font-semibold">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {t("authOtpSendBtn")}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3" noValidate>
          <p className="text-xs text-slate-500">{t("authOtpSentStep", { phone: phone.trim() })}</p>
          {devCode && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-900">
              <TriangleAlert className="h-4 w-4 !text-amber-600" aria-hidden />
              <AlertDescription className="text-xs font-medium">
                {t("authDemoOtpAlert", { code: devCode })}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="otp-code">{t("authOtpCodeLabel")}</Label>
            <Input
              id="otp-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("authOtpCodePlaceholder")}
              autoComplete="one-time-code"
              className="h-11 text-center font-mono text-lg tracking-[0.4em]"
            />
          </div>
          <FieldError msg={error} />
          <Button
            type="submit"
            disabled={busy}
            className="h-11 w-full bg-slate-900 text-white hover:bg-slate-800 font-semibold"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {t("authOtpVerifyBtn")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || countdown > 0}
            onClick={() => send()}
            className="h-10 text-xs text-slate-500 hover:text-slate-800"
          >
            {countdown > 0 ? t("authOtpResendIn", { s: countdown }) : t("authOtpResend")}
          </Button>
        </form>
      )}
    </div>
  );
}

// ---------- demo credentials hint ----------

const DEMO_ACCOUNTS: Array<{ key: DictKey; phone: string }> = [
  { key: "roleBUYER", phone: "+85511998877" },
  { key: "roleDEALER", phone: "+85512998001" },
  { key: "roleDEALER", phone: "+85512998002" },
  { key: "roleSELLER", phone: "+85512998003" },
  { key: "roleSELLER", phone: "+85512998004" },
  { key: "roleSUPER_ADMIN", phone: "+85512998009" },
  { key: "roleDEALER", phone: "+85511223344" },
  { key: "roleDEALER", phone: "+85511556677" },
];

function DemoHint() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full min-h-[44px] items-center justify-between px-3 py-2 text-left cursor-pointer"
      >
        <span className="text-xs font-semibold text-slate-700">{t("authDemoHintTitle")}</span>
        <ChevronDown
          className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t border-slate-200 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-slate-500">
            {t("authDemoHintBody", { pw: "khlan123" })}
          </p>
          <ul className="mt-2 grid grid-cols-1 gap-1">
            {DEMO_ACCOUNTS.map((a, i) => (
              <li key={a.phone} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-600">
                  {i === 0 && "Dara · "}
                  {i === 1 && "Sokha · "}
                  {i === 2 && "PP Auto · "}
                  {i === 3 && "Vireak · "}
                  {i === 4 && "Sopheak · "}
                  {i === 5 && "Nita · "}
                  {i === 6 && "Chan · "}
                  {i === 7 && "Sophea · "}
                  {t(a.key)}
                </span>
                <span className="font-mono text-slate-500" dir="ltr">
                  {a.phone}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- page ----------

export function AuthView() {
  const t = useT();
  return (
    <section className="mx-auto w-full max-w-md px-4 my-8 sm:my-12" aria-label={t("authLoginTab")}>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-slate-950">
            <CarFront className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            ខ្លាន <span className="text-amber-600">KhLan</span>
          </h1>
          <p className="max-w-xs text-xs leading-relaxed text-slate-500">{t("authSubtitle")}</p>
        </div>

        <Tabs defaultValue="login">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="login" className="text-xs sm:text-sm">
              {t("authLoginTab")}
            </TabsTrigger>
            <TabsTrigger value="signup" className="text-xs sm:text-sm">
              {t("authSignupTab")}
            </TabsTrigger>
            <TabsTrigger value="otp" className="text-xs sm:text-sm">
              {t("authOtpTab")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="login" className="mt-4">
            <LoginForm />
          </TabsContent>
          <TabsContent value="signup" className="mt-4">
            <SignupForm />
          </TabsContent>
          <TabsContent value="otp" className="mt-4">
            <OtpForm />
          </TabsContent>
        </Tabs>

        <Separator className="my-4" />
        <DemoHint />
        <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
          {t("authDemoModeNote")}
        </p>
      </div>
      <div className="mt-3 flex justify-center">
        <Badge variant="outline" className="border-slate-200 text-[10px] font-medium text-slate-400">
          ខ្លាន KhLan · {t("tagline")}
        </Badge>
      </div>
    </section>
  );
}

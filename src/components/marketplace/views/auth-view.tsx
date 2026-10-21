"use client";

// Auth view — password login and sign-up, both protected by the English
// click-in-order "Security Verification" captcha (server-enforced via a
// single-use captchaToken). One centered card on the single-route SPA. A
// successful sign-in applies the new session IN PLACE (store → locale →
// favorites → navigate to the dashboard) with NO page reload — reloads are
// the fragile step inside embedded previews (sessionStorage may be lost and
// the redirect replay silently dropped, leaving the user logged in on Home).

import { useState } from "react";
import { useT } from "@/hooks/use-t";
import { useAppStore } from "@/lib/store";
import { apiSend, authFallbackHeaders, clearAuthFallback } from "@/lib/client-hooks";
import type { SessionDTO } from "@/lib/dashboard-types";
import { SecurityCaptcha } from "@/components/marketplace/security-captcha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CarFront, ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isLocale, type DictKey, type Locale } from "@/lib/i18n";

const PHONE_RE = /^\+855\d{7,9}$/;

/** Normalize Khmer phone input: accept 0-prefixed local numbers, bare
 *  8–9 digit numbers and 855-prefixed numbers — everything becomes
 *  +855XXXXXXXX so login/registration can never fail on formatting alone. */
function normalizePhone(raw: string): string {
  const d = raw.replace(/[\s\-().]/g, "");
  if (/^\+855\d{7,9}$/.test(d)) return d;
  if (/^855\d{7,9}$/.test(d)) return `+855${d.slice(3)}`;
  if (/^0\d{8,9}$/.test(d)) return `+855${d.slice(1)}`;
  if (/^\d{7,9}$/.test(d)) return `+855${d}`;
  return raw.trim();
}

/** Server error → localized message when the server text is recognizable. */
function localAuthError(t: ReturnType<typeof useT>, msg: string): string {
  if (/Incorrect phone number or password/i.test(msg)) return t("authErrBadCreds");
  if (/already registered/i.test(msg)) return t("authErrPhoneTaken");
  if (/No account with this phone/i.test(msg)) return t("authErrNoAccount");
  if (/Captcha/i.test(msg)) return t("captchaFailed");
  return msg;
}

/** Fetch the live session and verify it belongs to `userId` — returns the
 *  SessionDTO on success, null when the session did not persist (cookie
 *  refused AND no usable header fallback). */
async function fetchVerifiedSession(userId: string): Promise<SessionDTO | null> {
  try {
    const r = await fetch("/api/session", {
      cache: "no-store",
      headers: authFallbackHeaders(),
    });
    if (!r.ok) return null;
    const s = (await r.json()) as SessionDTO;
    return s.authed && s.user?.id === userId ? s : null;
  } catch {
    return null;
  }
}

/** Apply a freshly authenticated session to the RUNNING app — store, locale,
 *  favorites — without any page reload. Also drops parked reload artifacts
 *  from older attempts so no future reload replays a stale toast/redirect. */
async function applySessionInPlace(session: SessionDTO): Promise<void> {
  const store = useAppStore.getState();
  store.setMe(session);
  try {
    sessionStorage.removeItem("khlan_go_dashboard");
    sessionStorage.removeItem("khlan_welcome");
  } catch {
    /* ignore */
  }
  // A real account's locale is the user's own configuration.
  if (isLocale(session.user.locale)) {
    store.setLocale(session.user.locale);
  }
  // Re-sync favorites that previously belonged to the guest/persona session.
  try {
    const fr = await fetch("/api/favorites", {
      cache: "no-store",
      headers: authFallbackHeaders(),
    });
    if (fr.ok) {
      const fj = (await fr.json()) as { vehicleIds?: string[] };
      store.setFavorites(fj.vehicleIds ?? []);
    }
  } catch {
    /* favorites are non-critical — the dashboard view refetches */
  }
}

/** Store the header-transport fallback after a login whose cookie was
 *  refused (embedded preview / strict browser). */
function storeTokenFallback(token: string) {
  try {
    window.localStorage.setItem("khlan_ls_token", token);
    // A real login supersedes any demo persona (mirrors the server cookie).
    window.localStorage.removeItem("khlan_ls_persona");
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
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!PHONE_RE.test(normalizePhone(phone))) return setError(t("authErrPhone"));
    if (!password) return setError(t("authErrPassword"));
    // Valid credentials open the Security Verification dialog; the actual
    // login request fires only after the captcha is solved.
    setCaptchaOpen(true);
  };

  const doLogin = async (captchaToken: string) => {
    setError(undefined);
    setBusy(true);
    try {
      const res = await apiSend<{ ok: boolean; user: { id: string; name: string; role: string }; sessionToken?: string }>(
        "/api/auth/login",
        "POST",
        { phone: normalizePhone(phone), password, captchaToken },
      );
      // The session must actually persist — cookies are refused in embedded
      // previews, so fall back to the signed token via a request header.
      let session = await fetchVerifiedSession(res.user.id);
      if (!session) {
        if (res.sessionToken) {
          storeTokenFallback(res.sessionToken);
        }
        session = await fetchVerifiedSession(res.user.id);
        if (!session) {
          clearAuthFallback();
          setBusy(false);
          setCaptchaOpen(false);
          setError(t("authErrCookieBlocked"));
          return;
        }
      } else {
        // Cookie path worked — drop any stale localStorage fallback.
        clearAuthFallback();
      }
      // Apply the session in place and land on the dashboard — no reload,
      // nothing left to lose between login and the dashboard.
      await applySessionInPlace(session);
      toast.success(t("authWelcomeBack", { name: res.user.name }));
      useAppStore.getState().navigate({ name: "dashboard" });
      setBusy(false);
      setCaptchaOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("errorGeneric");
      setError(localAuthError(t, msg));
      setBusy(false);
      // Expired/used captcha token → ask for a fresh verification.
      if (/captcha/i.test(msg)) setCaptchaOpen(true);
    }
  };

  return (
    <>
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
      <SecurityCaptcha open={captchaOpen} onOpenChange={setCaptchaOpen} onVerified={doLogin} />
    </>
  );
}

// ---------- sign up ----------

function SignupForm() {
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [locale, setLocaleSel] = useState<Locale>("km");
  const [busy, setBusy] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!name.trim()) return setError(t("authErrName"));
    if (!PHONE_RE.test(normalizePhone(phone))) return setError(t("authErrPhone"));
    if (password.length < 8) return setError(t("authErrPassword"));
    if (password !== confirm) return setError(t("authErrConfirm"));
    // Registration continues after the Security Verification captcha.
    setCaptchaOpen(true);
  };

  const doSignup = async (captchaToken: string) => {
    setError(undefined);
    setBusy(true);
    try {
      const res = await apiSend<{ ok: boolean; user: { id: string; name: string }; sessionToken?: string }>(
        "/api/auth/register",
        "POST",
        { name: name.trim(), phone: normalizePhone(phone), password, locale, captchaToken },
      );
      // Same session-persistence guard as login (cookie → header fallback).
      let session = await fetchVerifiedSession(res.user.id);
      if (!session) {
        if (res.sessionToken) {
          storeTokenFallback(res.sessionToken);
        }
        session = await fetchVerifiedSession(res.user.id);
        if (!session) {
          clearAuthFallback();
          setBusy(false);
          setCaptchaOpen(false);
          setError(t("authErrCookieBlocked"));
          return;
        }
      } else {
        clearAuthFallback();
      }
      // New accounts are BUYER role — land them on their account dashboard
      // too, fully in-memory (see doLogin).
      await applySessionInPlace(session);
      toast.success(t("authWelcomeNew"));
      useAppStore.getState().navigate({ name: "dashboard" });
      setBusy(false);
      setCaptchaOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("errorGeneric");
      setError(localAuthError(t, msg));
      setBusy(false);
      if (/captcha/i.test(msg)) setCaptchaOpen(true);
    }
  };

  return (
    <>
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
          <Select value={locale} onValueChange={(v) => { if (isLocale(v)) setLocaleSel(v); }}>
            <SelectTrigger className="h-11" aria-label={t("authLocaleLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="km">ភាសាខ្មែរ (Khmer)</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="zh">中文 (Chinese)</SelectItem>
              <SelectItem value="vi">Tiếng Việt (Vietnamese)</SelectItem>
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
      <SecurityCaptcha open={captchaOpen} onOpenChange={setCaptchaOpen} onVerified={doSignup} />
    </>
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
                  {i === 5 && "Nita (Admin) · "}
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

export function AuthView({ initialTab }: { initialTab?: "login" | "signup" }) {
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

        <Tabs defaultValue={initialTab ?? "login"}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login" className="text-xs sm:text-sm">
              {t("authLoginTab")}
            </TabsTrigger>
            <TabsTrigger value="signup" className="text-xs sm:text-sm">
              {t("authSignupTab")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="login" className="mt-4">
            <LoginForm />
          </TabsContent>
          <TabsContent value="signup" className="mt-4">
            <SignupForm />
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

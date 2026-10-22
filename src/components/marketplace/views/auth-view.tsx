"use client";

// Auth view — password login and sign-up, both protected by the English
// click-in-order "Security Verification" captcha (server-enforced via a
// single-use captchaToken). One centered card on the single-route SPA. A
// successful sign-in applies the new session IN PLACE (store → locale →
// favorites → navigate to the dashboard) with NO page reload — reloads are
// the fragile step inside embedded previews (sessionStorage may be lost and
// the redirect replay silently dropped, leaving the user logged in on Home).

import { useEffect, useRef, useState } from "react";
import { useT } from "@/hooks/use-t";
import { useAppStore } from "@/lib/store";
import { apiSend, authFallbackHeaders, clearAuthFallback, useFetch } from "@/lib/client-hooks";
import { fileToDataUrl } from "@/lib/image-client";
import { formatUsd } from "@/lib/format";
import type { SessionDTO } from "@/lib/dashboard-types";
import type { PaymentConfigDTO, SubscriptionPaymentDTO } from "@/lib/commerce-types";
import { SecurityCaptcha } from "@/components/marketplace/security-captcha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Building2,
  CalendarClock,
  Camera,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
  ImageIcon,
  Loader2,
  Maximize2,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
  TriangleAlert,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { KhqrZoomDialog, TrxIdGuideDialog } from "@/components/marketplace/trx-guide-dialog";
import { cn } from "@/lib/utils";
import { isLocale, type DictKey, type Locale } from "@/lib/i18n";

const PHONE_RE = /^\+855\d{7,9}$/;

/** Self-selectable account types at registration — staff roles (ADMIN /
 *  SUPER_ADMIN) are intentionally absent: they are provisioned internally. */
const ACCOUNT_TYPES = ["BUYER", "SELLER", "DEALER"] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];

const ACCOUNT_TYPE_META: Record<
  AccountType,
  { icon: typeof UserRound; labelKey: DictKey; hintKey: DictKey }
> = {
  BUYER: { icon: UserRound, labelKey: "roleBUYER", hintKey: "authRoleBuyerHint" },
  SELLER: { icon: Tag, labelKey: "roleSELLER", hintKey: "authRoleSellerHint" },
  DEALER: { icon: Store, labelKey: "roleDEALER", hintKey: "authRoleDealerHint" },
};

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

// ---------- Registration Subscription Step (Shown when Free Trial is Inactive) ----------

interface PlanOption {
  key: "BASIC" | "PRO" | "ENTERPRISE";
  title: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number;
  popular?: boolean;
  listingsLimit: number;
  featuredLimit: number;
  seats: number;
  features: string[];
}

const DEFAULT_PLANS: PlanOption[] = [
  {
    key: "BASIC",
    title: "Basic Plan",
    tagline: "Great for individual sellers getting started",
    priceMonthly: 19,
    priceYearly: 190,
    listingsLimit: 15,
    featuredLimit: 3,
    seats: 1,
    features: [
      "Up to 15 car listings",
      "3 featured homepage spots",
      "1 seller account",
      "Standard buyer lead handling",
    ],
  },
  {
    key: "PRO",
    title: "Professional Plan",
    tagline: "Best for growing sellers & independent dealerships",
    priceMonthly: 49,
    priceYearly: 490,
    popular: true,
    listingsLimit: 50,
    featuredLimit: 10,
    seats: 5,
    features: [
      "Up to 50 car listings",
      "10 featured homepage spots",
      "5 staff member seats",
      "Instant Telegram lead alerts",
      "Priority marketplace search ranking",
    ],
  },
  {
    key: "ENTERPRISE",
    title: "Enterprise Dealership",
    tagline: "For premier car showrooms and large inventory",
    priceMonthly: 149,
    priceYearly: 1490,
    listingsLimit: 999,
    featuredLimit: 30,
    seats: 20,
    features: [
      "Unlimited car listings",
      "30 featured homepage spots",
      "20 staff accounts & role permissions",
      "Priority verification badge",
      "Dedicated account manager",
    ],
  },
];

function RegistrationSubscriptionStep({
  user,
  onComplete,
  onCancel,
}: {
  user: { id: string; name: string; role: AccountType; phone: string };
  onComplete: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [currency, setCurrency] = useState<"USD" | "KHR">("USD");
  const [selectedPlan, setSelectedPlan] = useState<"BASIC" | "PRO" | "ENTERPRISE">("PRO");
  const [manualRef, setManualRef] = useState("");
  const [evidenceImage, setEvidenceImage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [readingImage, setReadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState(false);
  const [submittedPayment, setSubmittedPayment] = useState<SubscriptionPaymentDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomQrOpen, setZoomQrOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Fetch live settings and payment config (KHQR images, account name, etc.)
  const paymentConfig = useFetch<PaymentConfigDTO>("/api/tenant/payments/config");
  const platformSettings = useFetch<{
    freeTrialEnabled: boolean;
    freeTrialDays: number;
    plans?: Array<{
      plan: string;
      priceUsdMonthly?: number;
      priceUsdYearly?: number;
      listingsLimit?: number;
      featuredLimit?: number;
      seats?: number;
      enabled?: boolean;
    }>;
  }>("/api/platform-settings");

  // Filter only active, enabled plans (excluding FREE and disabled plans like BASIC if disabled)
  const plans: PlanOption[] = (
    platformSettings.data?.plans
      ? DEFAULT_PLANS.filter((def) =>
          platformSettings.data?.plans?.some(
            (p) => p.plan === def.key && (p as any).enabled !== false,
          ),
        )
      : DEFAULT_PLANS
  ).map((def) => {
    const live = platformSettings.data?.plans?.find((p) => p.plan === def.key);
    if (!live) return def;
    return {
      ...def,
      priceMonthly: live.priceUsdMonthly ?? def.priceMonthly,
      priceYearly: live.priceUsdYearly ?? def.priceYearly,
      listingsLimit: live.listingsLimit ?? def.listingsLimit,
      featuredLimit: live.featuredLimit ?? def.featuredLimit,
      seats: live.seats ?? def.seats,
    };
  });

  // Ensure selected plan is one of the available active plans
  useEffect(() => {
    if (plans.length > 0 && !plans.some((p) => p.key === selectedPlan)) {
      setSelectedPlan(plans[0].key);
    }
  }, [plans, selectedPlan]);

  const currentPlan = plans.find((p) => p.key === selectedPlan) || plans[0] || DEFAULT_PLANS[1];
  const priceUsd = billingCycle === "YEARLY" ? currentPlan.priceYearly : currentPlan.priceMonthly;
  const priceKhr = priceUsd * 4100;

  const manual = paymentConfig.data?.manual;
  const qrSrc =
    billingCycle === "YEARLY"
      ? manual?.khqrImageYearly || "/khqr/khqr-yearly.jpg"
      : manual?.khqrImageMonthly || "/khqr/khqr-monthly.jpg";

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setReadingImage(true);
    try {
      const dataUrl = await fileToDataUrl(file, 1280, 0.85);
      setEvidenceImage(dataUrl);
    } catch {
      toast.error("Could not process the selected screenshot");
    } finally {
      setReadingImage(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const submitPayment = async () => {
    if (!manualRef.trim() && !evidenceImage) {
      setError("Please enter your bank Trx ID reference or attach a payment screenshot");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiSend<{ payment: SubscriptionPaymentDTO; waitMinutes: number }>(
        "/api/tenant/payments",
        "POST",
        {
          plan: selectedPlan,
          billingCycle,
          currency,
          manualRef: manualRef.trim() || undefined,
          evidenceImage: evidenceImage ?? undefined,
          note: note.trim() || undefined,
        },
      );

      if (res.payment.status === "VERIFIED") {
        setVerified(true);
        toast.success("🎉 Payment verified! Your subscription is active.");
        const s = await fetchVerifiedSession(user.id);
        if (s) await applySessionInPlace(s);
        setTimeout(() => {
          onComplete();
        }, 1200);
      } else {
        setSubmittedPayment(res.payment);
        toast.info("Payment submitted! Checking ABA automated verification...");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit payment";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const checkStatus = async () => {
    setChecking(true);
    try {
      const r = await fetch("/api/tenant/payments", {
        cache: "no-store",
        headers: authFallbackHeaders(),
      });
      if (!r.ok) throw new Error("Fetch failed");
      const payments = (await r.json()) as SubscriptionPaymentDTO[];
      const matched = payments.find((p) => p.status === "VERIFIED");
      if (matched) {
        setVerified(true);
        toast.success("🎉 Payment verified! Your subscription is active.");
        const s = await fetchVerifiedSession(user.id);
        if (s) await applySessionInPlace(s);
        setTimeout(() => {
          onComplete();
        }, 1000);
      } else {
        toast.info("Still awaiting bank confirmation. If you just sent money, please wait a few seconds and check again.");
      }
    } catch {
      toast.error("Could not verify status at this moment");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step Indicator Header */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
              ✓
            </span>
            <span className="text-xs font-semibold text-slate-700">Account Created</span>
            <span className="text-slate-300">→</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-slate-950">
              2
            </span>
            <span className="text-xs font-bold text-amber-950">Choose Plan & Pay KHQR</span>
            <span className="text-slate-300">→</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-500">
              3
            </span>
            <span className="text-xs font-medium text-slate-400">Dashboard</span>
          </div>
          <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900 font-semibold text-[11px]">
            {user.role === "DEALER" ? "Dealer Account" : "Seller Account"}
          </Badge>
        </div>

        <div className="mt-3">
          <h2 className="text-sm font-bold text-slate-900">
            Welcome, {user.name}! Activate your {user.role === "DEALER" ? "Dealership" : "Seller"} dashboard
          </h2>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            Free trial days are currently <span className="font-semibold text-rose-700">inactive</span> for new sellers & dealers.
            Choose a subscription plan below and complete payment via KHQR to activate your selling tools.
          </p>
        </div>
      </div>

      {/* Verified Success State */}
      {verified && (
        <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <AlertTitle className="text-sm font-bold text-emerald-900">
            Subscription Activated Successfully!
          </AlertTitle>
          <AlertDescription className="text-xs text-emerald-800">
            Your payment was verified via ABA PayWay. Redirecting you to your dashboard now...
          </AlertDescription>
        </Alert>
      )}

      {/* Submitted & Awaiting Verification State */}
      {submittedPayment && !verified && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-sky-950">
                Payment Submitted — Awaiting Bank Verification
              </p>
              <p className="mt-1 text-xs text-sky-800 leading-relaxed">
                Reference: <code className="bg-sky-100 px-1.5 py-0.5 rounded font-mono font-bold text-sky-900">{submittedPayment.reference}</code>
                {manualRef && (
                  <span className="ml-1.5">
                    · Trx ID: <code className="bg-sky-100 px-1.5 py-0.5 rounded font-mono font-bold text-sky-900">{manualRef}</code>
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-sky-700">
                Our Telegram banking integration is listening for the ABA payment alert. You can check status below or proceed directly to your dashboard.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-sky-200/80">
            <Button
              size="sm"
              onClick={checkStatus}
              disabled={checking}
              className="bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs h-9"
            >
              {checking && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", checking && "hidden")} />
              Re-check Instant Verification
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onComplete}
              className="border-sky-300 text-sky-900 hover:bg-sky-100 text-xs h-9"
            >
              Continue to Dashboard (Pending)
            </Button>
          </div>
        </div>
      )}

      {/* Billing Cycle & Currency Switchers */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-amber-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">Billing Cycle:</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setBillingCycle("MONTHLY")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
                billingCycle === "MONTHLY"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("YEARLY")}
              className={cn(
                "flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer",
                billingCycle === "YEARLY"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              <span>Yearly</span>
              <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[9px] font-bold text-slate-950">
                Save 2 Mo
              </span>
            </button>
          </div>
        </div>

        {/* Currency Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">Currency:</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              className={cn(
                "px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1",
                currency === "USD"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              <span>💵 USD ($)</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrency("KHR")}
              className={cn(
                "px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1",
                currency === "KHR"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              <span>៛ KHR (Riel)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Plan Selection Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {plans.map((p) => {
          const isSelected = selectedPlan === p.key;
          const pPriceUsd = billingCycle === "YEARLY" ? p.priceYearly : p.priceMonthly;
          const pPriceKhr = pPriceUsd * 4100;
          return (
            <div
              key={p.key}
              onClick={() => setSelectedPlan(p.key)}
              className={cn(
                "relative flex flex-col justify-between rounded-xl border p-4 transition-all cursor-pointer text-left",
                isSelected
                  ? "border-amber-500 bg-amber-50/30 ring-2 ring-amber-500 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs",
              )}
            >
              {p.popular && (
                <span className="absolute -top-2.5 right-3 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-slate-950 shadow-xs">
                  Most Popular
                </span>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">{p.title}</span>
                  <div
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full border",
                      isSelected
                        ? "border-amber-500 bg-amber-500 text-white"
                        : "border-slate-300 bg-white",
                    )}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5" />}
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 min-h-[30px] leading-tight">
                  {p.tagline}
                </p>

                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold text-slate-900">
                    {currency === "USD" ? `$${pPriceUsd}` : `៛${pPriceKhr.toLocaleString()}`}
                  </span>
                  <span className="text-xs text-slate-400">
                    /{billingCycle === "YEARLY" ? "year" : "month"}
                  </span>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                  {p.features.map((feat, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px]">
                      <Check className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-2">
                <Button
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "w-full text-xs font-semibold h-8",
                    isSelected
                      ? "bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                      : "border-slate-200 text-slate-700",
                  )}
                >
                  {isSelected ? "Selected" : "Select Plan"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Payment Box: KHQR Code and Bank Details */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">
              PayWay by ABA KHQR · Standard Bakong
            </h3>
          </div>
          <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-bold">
            {billingCycle === "YEARLY" ? "1 Year Plan (12 Mo)" : "1 Month Plan"} · {currency}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          {/* QR Image Box with Click to Zoom */}
          <div
            onClick={() => setZoomQrOpen(true)}
            className="group relative flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-3 text-center shadow-xs cursor-pointer hover:border-amber-400 hover:shadow-md transition-all"
            title="Click to view full size QR code"
          >
            <div className="relative">
              <img
                src={qrSrc}
                alt="ABA KHQR Payment"
                className="h-48 w-48 rounded-lg object-contain transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-md">
                  <Maximize2 className="h-3.5 w-3.5 text-amber-600" />
                  Click to Zoom / Scan
                </span>
              </div>
            </div>
            <div className="mt-2 text-center">
              <span className="text-[11px] font-medium text-slate-500">
                Payee: <strong className="text-slate-800">{manual?.accountName || "SAM CHAN PANHA"}</strong>
              </span>
              <p className="text-[10px] text-amber-600 font-semibold mt-0.5 flex items-center justify-center gap-1">
                <Maximize2 className="h-3 w-3" /> Click to enlarge QR
              </p>
            </div>
          </div>

          {/* Amount and Instructions */}
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
              <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">
                Amount to Transfer ({currency})
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">
                  {currency === "USD" ? `$${priceUsd}.00 USD` : `៛${priceKhr.toLocaleString()} KHR`}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  ({currency === "USD" ? `៛${priceKhr.toLocaleString()} KHR` : `$${priceUsd}.00 USD`})
                </span>
              </div>
              <p className="mt-1 text-[11px] text-emerald-900/80">
                For {currentPlan.title} ({billingCycle === "YEARLY" ? "1 Year" : "1 Month"})
              </p>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              1. Click the QR code to enlarge and scan with <strong>ABA Mobile</strong> or any banking app.<br />
              2. Transfer exact amount: <strong>{currency === "USD" ? `$${priceUsd}.00 USD` : `៛${priceKhr.toLocaleString()} KHR`}</strong>.<br />
              3. Enter the bank transaction reference (Trx ID / APV) below.<br />
              4. Click <strong>Verify & Complete Payment</strong> to activate your dashboard.
            </p>

            <div className="flex items-center gap-1.5 text-[11px] text-sky-800 bg-sky-50 border border-sky-200 rounded-lg p-2">
              <Zap className="h-4 w-4 text-sky-600 shrink-0" />
              <span>
                <strong>Instant Auto-Approval:</strong> Enter the ABA Trx ID or APV from your receipt to auto-activate in real-time.
              </span>
            </div>
          </div>
        </div>

        {/* Verification Input Fields */}
        <div className="pt-3 border-t border-slate-200 space-y-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <Label htmlFor="reg-pay-ref" className="text-xs font-semibold text-slate-700">
                Bank Transaction Reference / Trx ID <span className="text-rose-600">*</span>
              </Label>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
              >
                <HelpCircle className="h-3.5 w-3.5 text-amber-600" />
                <span>Where to find Trx ID? (Sample Receipt)</span>
              </button>
            </div>
            <Input
              id="reg-pay-ref"
              value={manualRef}
              onChange={(e) => setManualRef(e.target.value)}
              placeholder="e.g. 179264913984347 or 179264741214086 (from receipt)"
              className="h-10 font-mono text-sm bg-white"
            />
            <p className="text-[11px] text-slate-500">
              Found on your payment confirmation screen or SMS / bank notification receipt.
            </p>
          </div>

          {/* Screenshot upload (optional) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">
              Payment Screenshot / Proof (Optional)
            </Label>
            {evidenceImage ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2">
                <img
                  src={evidenceImage}
                  alt="Receipt Preview"
                  className="h-14 w-14 rounded-md object-cover border"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Receipt Attached
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEvidenceImage(null)}
                    className="h-6 px-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  >
                    Remove image
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={readingImage}
                className="flex min-h-[40px] w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:border-amber-400 hover:bg-amber-50/30"
              >
                {readingImage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4 text-slate-400" />
                )}
                Upload confirmation screenshot
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickImage(e.target.files?.[0])}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-pay-note" className="text-xs text-slate-600">
              Note (Optional)
            </Label>
            <Input
              id="reg-pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Paid from ABA account Sam Chanpanha"
              className="h-9 bg-white text-xs"
              maxLength={200}
            />
          </div>

          {error && <FieldError msg={error} />}

          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              onClick={submitPayment}
              disabled={submitting || (!manualRef.trim() && !evidenceImage)}
              className="flex-1 h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-sm"
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Verify & Complete Payment
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="h-11 border-slate-200 text-slate-600 hover:text-slate-900 text-xs"
            >
              Cancel / Back to Sign In
            </Button>
          </div>
        </div>
      </div>

      <KhqrZoomDialog
        open={zoomQrOpen}
        onOpenChange={setZoomQrOpen}
        qrSrc={qrSrc}
        accountName={manual?.accountName || "SAM CHAN PANHA"}
        amountText={currency === "USD" ? `$${priceUsd}.00 USD` : `៛${priceKhr.toLocaleString()} KHR`}
        planTitle={currentPlan.title}
        currency={currency}
      />

      <TrxIdGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        onUseSample={(sampleId) => setManualRef(sampleId)}
      />
    </div>
  );
}

// ---------- sign up ----------

function SignupForm({ onStepChange }: { onStepChange?: (isPaymentStep: boolean) => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [role, setRole] = useState<AccountType>("BUYER");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [locale, setLocaleSel] = useState<Locale>("km");
  const [busy, setBusy] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Free trial & registration subscription state
  const [step, setStep] = useState<"FORM" | "PAYMENT">("FORM");
  const [registeredUser, setRegisteredUser] = useState<{
    id: string;
    name: string;
    role: AccountType;
    phone: string;
  } | null>(null);

  const platformSettings = useFetch<{
    freeTrialEnabled: boolean;
    freeTrialDays: number;
  }>("/api/platform-settings");

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
      const res = await apiSend<{
        ok: boolean;
        user: { id: string; name: string; role: string };
        sessionToken?: string;
        freeTrialActive?: boolean;
        requiresSubscription?: boolean;
      }>(
        "/api/auth/register",
        "POST",
        { name: name.trim(), phone: normalizePhone(phone), password, role, locale, captchaToken },
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
      await applySessionInPlace(session);

      // Free Trial Inactive check: If user is SELLER or DEALER and Free Trial is inactive,
      // transition to the Subscription Payment step!
      if (res.requiresSubscription) {
        setRegisteredUser({
          id: res.user.id,
          name: res.user.name,
          role,
          phone: normalizePhone(phone),
        });
        setStep("PAYMENT");
        onStepChange?.(true);
        setBusy(false);
        setCaptchaOpen(false);
        toast.info("Account created! Please select your subscription plan to activate dashboard access.");
        return;
      }

      // Regular flow (BUYER or active Free Trial):
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

  if (step === "PAYMENT" && registeredUser) {
    return (
      <RegistrationSubscriptionStep
        user={registeredUser}
        onComplete={async () => {
          const s = await fetchVerifiedSession(registeredUser.id);
          if (s) await applySessionInPlace(s);
          useAppStore.getState().navigate({ name: "dashboard" });
        }}
        onCancel={() => {
          setStep("FORM");
          onStepChange?.(false);
        }}
      />
    );
  }

  const freeTrialEnabled = platformSettings.data?.freeTrialEnabled ?? true;
  const freeTrialDays = platformSettings.data?.freeTrialDays ?? 30;

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
          <Label htmlFor="signup-role">{t("authRoleLabel")}</Label>
          <Select
            value={role}
            onValueChange={(v) => {
              if ((ACCOUNT_TYPES as readonly string[]).includes(v)) setRole(v as AccountType);
            }}
          >
            <SelectTrigger id="signup-role" className="h-11" aria-label={t("authRoleLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map((r) => {
                const Icon = ACCOUNT_TYPE_META[r].icon;
                return (
                  <SelectItem key={r} value={r} className="py-2">
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-amber-600" aria-hidden />
                      <span className="font-medium">{t(ACCOUNT_TYPE_META[r].labelKey)}</span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-slate-400">{t(ACCOUNT_TYPE_META[role].hintKey)}</p>

          {/* Role Status Note (Free Trial Active / Inactive) */}
          {role === "BUYER" ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs text-emerald-900">
              <span className="font-semibold text-emerald-800">✓ 100% Free Buyer Account</span>
              <p className="mt-0.5 text-[11px] text-emerald-700">
                Browse cars, save favorites, request appointments and vehicle reports with zero fees.
              </p>
            </div>
          ) : freeTrialEnabled ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs text-emerald-900">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>{freeTrialDays}-Day Free Trial Included</span>
              </div>
              <p className="mt-0.5 text-[11px] text-emerald-700">
                Immediate access to your dashboard upon registration. No upfront payment required!
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              <div className="flex items-center gap-1.5 font-semibold text-amber-800">
                <TriangleAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span>Free Trial is Currently Inactive</span>
              </div>
              <p className="mt-0.5 text-[11px] text-amber-700 leading-relaxed">
                New {role === "DEALER" ? "dealerships" : "sellers"} will be prompted to select a subscription plan and complete KHQR payment to activate dashboard access.
              </p>
            </div>
          )}
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
  const [tab, setTab] = useState<string>(initialTab ?? "login");
  const [isPaymentStep, setIsPaymentStep] = useState(false);

  return (
    <section
      className={cn(
        "mx-auto w-full px-4 my-8 sm:my-12 transition-all duration-300",
        isPaymentStep ? "max-w-3xl" : "max-w-md",
      )}
      aria-label={t("authLoginTab")}
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-slate-950">
            <CarFront className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            ខ្លាន <span className="text-amber-600">KhLan</span>
          </h1>
          <p className="max-w-xs text-xs leading-relaxed text-slate-500">
            {isPaymentStep ? "Complete subscription payment to activate your dashboard" : t("authSubtitle")}
          </p>
        </div>

        <Tabs value={isPaymentStep ? "signup" : tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
          {!isPaymentStep && (
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" className="text-xs sm:text-sm">
                {t("authLoginTab")}
              </TabsTrigger>
              <TabsTrigger value="signup" className="text-xs sm:text-sm">
                {t("authSignupTab")}
              </TabsTrigger>
            </TabsList>
          )}
          {!isPaymentStep && (
            <TabsContent value="login" className="mt-4">
              <LoginForm />
            </TabsContent>
          )}
          <TabsContent value="signup" className={cn("mt-4", isPaymentStep && "mt-0")}>
            <SignupForm onStepChange={setIsPaymentStep} />
          </TabsContent>
        </Tabs>

        {!isPaymentStep && (
          <>
            <Separator className="my-4" />
            <DemoHint />
            <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
              {t("authDemoModeNote")}
            </p>
          </>
        )}
      </div>
      <div className="mt-3 flex justify-center">
        <Badge variant="outline" className="border-slate-200 text-[10px] font-medium text-slate-400">
          ខ្លាន KhLan · {t("tagline")}
        </Badge>
      </div>
    </section>
  );
}

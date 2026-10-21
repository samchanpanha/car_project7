"use client";

// Profile settings dialog (Task 6-a) — every logged-in user's own
// configuration: profile, phone + verification, password, Telegram status.
// Opened from the header AccountMenu (and reusable anywhere in the SPA).

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/hooks/use-t";
import { apiSend } from "@/lib/client-hooks";
import type { SessionDTO } from "@/lib/dashboard-types";
import { initials } from "@/components/marketplace/dashboard/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  LogIn,
  MessageCircle,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PHONE_RE = /^\+855\d{7,9}$/;

type ProfileUserDTO = { id: string; name: string; locale: string; avatarUrl: string | null; phone: string; phoneVerified: boolean };

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="text-xs font-medium text-rose-600" role="alert">
      {msg}
    </p>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
      <span className="text-amber-600" aria-hidden>
        {icon}
      </span>
      {children}
    </h3>
  );
}

function AvatarPreview({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`${name} avatar`}
        className="h-14 w-14 shrink-0 rounded-full border border-slate-200 object-cover"
      />
    );
  }
  return (
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-slate-950"
      aria-hidden
    >
      {initials(name || "?")}
    </span>
  );
}

// ---------- section a: profile ----------

function ProfileSection({ me }: { me: SessionDTO }) {
  const t = useT();
  const setMe = useAppStore((s) => s.setMe);
  const setLocale = useAppStore((s) => s.setLocale);
  const [name, setName] = useState(me.user.name);
  const [locale, setLocaleSel] = useState<"en" | "km">(me.user.locale === "en" ? "en" : "km");
  const [avatar, setAvatar] = useState(me.user.avatarUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!name.trim()) return setError(t("authErrName"));
    if (avatar.trim() && !/^https?:\/\/.+/i.test(avatar.trim())) {
      return setError(t("profileErrAvatar"));
    }
    setBusy(true);
    try {
      const res = await apiSend<{ ok: boolean; user: ProfileUserDTO }>("/api/account/profile", "PATCH", {
        name: name.trim(),
        locale,
        avatarUrl: avatar.trim() ? avatar.trim() : null,
      });
      const cur = useAppStore.getState().me;
      if (cur) {
        setMe({
          ...cur,
          user: { ...cur.user, name: res.user.name, locale: res.user.locale, avatarUrl: res.user.avatarUrl },
          phoneVerified: res.user.phoneVerified,
        });
      }
      setLocale(res.user.locale === "en" ? "en" : "km");
      toast.success(t("profileSavedToast"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3" noValidate>
      <SectionTitle icon={<UserRound className="h-4 w-4" />}>{t("profileSectionProfile")}</SectionTitle>
      <div className="flex items-center gap-3">
        <AvatarPreview name={name || me.user.name} avatarUrl={avatar.trim() || null} />
        <p className="text-[11px] leading-relaxed text-slate-400">
          {t("profileAvatarLabel")} — {me.user.phone}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pf-name">{t("profileNameLabel")}</Label>
        <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("profileLocaleLabel")}</Label>
        <Select value={locale} onValueChange={(v) => setLocaleSel(v === "en" ? "en" : "km")}>
          <SelectTrigger className="h-10" aria-label={t("profileLocaleLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="km">ភាសាខ្មែរ (Khmer)</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pf-avatar">{t("profileAvatarLabel")}</Label>
        <Input
          id="pf-avatar"
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder={t("profileAvatarPlaceholder")}
          dir="ltr"
          className="h-10 font-mono text-xs"
        />
      </div>
      <FieldError msg={error} />
      <Button
        type="submit"
        disabled={busy}
        className="h-11 w-full bg-slate-900 font-semibold text-white hover:bg-slate-800 sm:w-40"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {t("profileSave")}
      </Button>
    </form>
  );
}

// ---------- section b: phone ----------

function PhoneSection({ me }: { me: SessionDTO }) {
  const t = useT();
  const setMe = useAppStore((s) => s.setMe);
  const [newPhone, setNewPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const verified = me.phoneVerified !== false;

  const patchStoreUser = (u: ProfileUserDTO) => {
    const cur = useAppStore.getState().me;
    if (cur) {
      setMe({ ...cur, user: { ...cur.user, phone: u.phone, locale: u.locale }, phoneVerified: u.phoneVerified });
    }
  };

  const updatePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!PHONE_RE.test(newPhone.trim())) return setError(t("authErrPhone"));
    setBusy(true);
    try {
      const res = await apiSend<{ ok: boolean; user: ProfileUserDTO }>("/api/account/profile", "PATCH", {
        phone: newPhone.trim(),
      });
      patchStoreUser(res.user);
      setNewPhone("");
      toast.success(t("profilePhoneUpdatedToast"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle icon={<ShieldCheck className="h-4 w-4" />}>{t("profileSectionPhone")}</SectionTitle>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">{t("profileCurrentPhone")}:</span>
        <span className="font-mono text-sm font-semibold text-slate-900" dir="ltr">
          {me.user.phone}
        </span>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] font-semibold",
            verified
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-300 bg-amber-50 text-amber-800",
          )}
        >
          {verified ? t("profilePhoneVerified") : t("profilePhoneUnverified")}
        </Badge>
      </div>

      <form onSubmit={updatePhone} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="pf-phone">{t("profileNewPhoneLabel")}</Label>
          <Input
            id="pf-phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder={t("authPhonePlaceholder")}
            className="h-10 font-mono"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={busy}
          className="h-10 w-full font-semibold sm:w-auto"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {t("profilePhoneUpdateBtn")}
        </Button>
      </form>
      <FieldError msg={error} />
    </div>
  );
}

// ---------- section c: security ----------

function SecuritySection() {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (next.length < 8) return setError(t("authErrPassword"));
    if (next !== confirm) return setError(t("authErrConfirm"));
    setBusy(true);
    try {
      // Accounts without a password (Telegram-only) send an empty current password.
      await apiSend("/api/account/password", "POST", {
        currentPassword: current || "",
        newPassword: next,
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(t("profilePwChangedToast"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <SectionTitle icon={<ShieldCheck className="h-4 w-4" />}>{t("profileSectionSecurity")}</SectionTitle>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pf-curpw">{t("profileCurrentPw")}</Label>
        <Input
          id="pf-curpw"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          dir="ltr"
          className="h-10"
        />
        <p className="text-[11px] text-slate-400">{t("profileCurrentPwHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pf-newpw">{t("profileNewPw")}</Label>
        <Input
          id="pf-newpw"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          dir="ltr"
          className="h-10"
        />
        <p className="text-[11px] text-slate-400">{t("authPasswordHint")}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pf-cfpw">{t("profileNewPwConfirm")}</Label>
        <Input
          id="pf-cfpw"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          dir="ltr"
          className="h-10"
        />
      </div>
      <FieldError msg={error} />
      <Button
        type="submit"
        disabled={busy}
        className="h-11 w-full bg-slate-900 font-semibold text-white hover:bg-slate-800 sm:w-44"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {t("profileChangePw")}
      </Button>
    </form>
  );
}

// ---------- section d: telegram ----------

function TelegramSection({ me }: { me: SessionDTO }) {
  const t = useT();
  const linked = me.telegramLinked;
  return (
    <div className="flex flex-col gap-2">
      <SectionTitle icon={<MessageCircle className="h-4 w-4" />}>{t("profileSectionTelegram")}</SectionTitle>
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] font-semibold",
            linked
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-100 text-slate-600",
          )}
        >
          {linked ? t("profileTgLinked") : t("profileTgNotLinked")}
        </Badge>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400">
        {linked ? t("profileTgLinkedHint") : t("profileTgNotLinkedHint")}
      </p>
    </div>
  );
}

// ---------- dialog shell ----------

export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const me = useAppStore((s) => s.me);
  const navigate = useAppStore((s) => s.navigate);
  const showForm = Boolean(me?.authed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("profileTitle")}</DialogTitle>
          <DialogDescription>{t("profileDescription")}</DialogDescription>
        </DialogHeader>

        {!showForm ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-slate-500">
              <LogIn className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-slate-900">{t("profileLoginRequired")}</p>
            <p className="text-xs leading-relaxed text-slate-500">{t("profileLoginRequiredHint")}</p>
            <Button
              onClick={() => {
                onOpenChange(false);
                navigate({ name: "auth" });
              }}
              className="h-11 bg-amber-500 font-semibold text-slate-950 hover:bg-amber-400"
            >
              {t("profileGoLogin")}
            </Button>
          </div>
        ) : (
          me && (
            <div className="flex flex-col gap-5">
              <ProfileSection me={me} />
              <Separator />
              <PhoneSection me={me} />
              <Separator />
              <SecuritySection />
              <Separator />
              <TelegramSection me={me} />
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

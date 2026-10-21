# Task 6-a — Frontend auth (login/registration, account config, Telegram Mini App)

Agent: full-stack-developer (frontend auth) — work completed and verified by main orchestrator
Status: DONE — lint 0/0, tsc no new errors, all 9 E2E flows passed in agent-browser session `auth6a`, DB restored to 8 seeded users.

## Deliverables
- NEW `src/lib/telegram.ts` — tg()/isInTelegram()/initTelegram()/tgSendAuth()/tgHaptic()/setupBackButton(), fully feature-detected, typed, no `any`.
- NEW `src/components/marketplace/views/auth-view.tsx` — Log in / Sign up / OTP login tabs, demo credentials collapsible, devCode demo alerts, 60s resend countdown, inline localized errors.
- NEW `src/components/marketplace/profile-dialog.tsx` — 4 sections (Profile+locale+avatar, Phone+OTP verification, Security/password incl. passwordless "", Telegram status) + login-required empty state.
- MODIFIED `src/components/marketplace/header.tsx` — PersonaMenu → AccountMenu (authed branch: avatar/name, phone, badges, Profile settings, Log out; demo branch: "Log in / Sign up" entry + persona switcher + demo caption).
- MODIFIED `src/app/page.tsx` — TelegramBoot (initData handshake once, loop-guarded reload "khlan_tg_authed", BackButton per view, theme vars via ref), View case "auth", SessionBoot split (data effect + mount-only toast replay) + authed-locale-on-boot.
- MODIFIED `src/app/layout.tsx` — telegram-web-app.js beforeInteractive.
- MODIFIED `src/lib/i18n.ts` — +82 keys (en/km 451/451 in sync).
- MODIFIED `src/lib/store.ts` — View union + `{ name: "auth" }` only.

## Key notes for later agents
- SessionBoot no longer depends on `t` (stale-session overwrite on locale change fixed); one-shot toasts parked in sessionStorage: `khlan_switched`, `khlan_welcome` ({name}), `khlan_loggedout`, `khlan_tg_authed` (reload guard).
- Authed session locale is applied to the UI on boot (account preference); demo personas keep default en + manual toggle.
- Server error strings are localized client-side when recognizable (bad creds / phone taken / invalid code / no account).
- PRE-EXISTING (not mine, api/** off-limits): tsc errors at `src/app/api/account/profile/route.ts:49` and `src/app/api/auth/telegram/route.ts:38` (type-only; runtime OK).

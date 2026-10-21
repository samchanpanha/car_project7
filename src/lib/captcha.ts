// Security Verification captcha — English click-in-order challenge.
// The client receives a scatter of distorted English letters plus the target
// order (displayed as an instruction, like the classic "click the idiom in
// order" captcha). The server stores the expected word per challenge id and
// only issues a short-lived, single-use captchaToken when the clicked
// sequence matches. Login and registration require that token.

import crypto from "node:crypto";

const SECRET = process.env.AUTH_SECRET || "khlan-dev-secret-change-me";

export const CAPTCHA_CHALLENGE_TTL_MS = 3 * 60 * 1000;
export const CAPTCHA_TOKEN_TTL_MS = 5 * 60 * 1000;

/** Keep the in-memory store bounded on long-running dev processes. */
const MAX_STORED_CHALLENGES = 2000;
const MAX_CONSUMED_TOKENS = 5000;

/** 4–6 letter English words, every letter distinct (click-order friendly). */
const WORDS = [
  "CARS",
  "DRIVE",
  "SEDAN",
  "TURBO",
  "GEARS",
  "PLATE",
  "KHMER",
  "LEXUS",
  "PRADO",
  "ROADS",
  "BRAKE",
  "TYRES",
  "SPARK",
  "BUMPER",
  "CABIN",
  "PEDAL",
  "VALET",
  "HATCH",
  "WAGON",
  "COUPE",
] as const;

export interface CaptchaTokenDTO {
  letter: string;
  /** percent position inside the image panel (center of the glyph) */
  x: number;
  y: number;
  /** rotation in degrees (-42..42) */
  rot: number;
}

export interface CaptchaChallengeDTO {
  id: string;
  word: string;
  tokens: CaptchaTokenDTO[];
  expiresInSeconds: number;
}

interface StoredChallenge {
  word: string;
  expiresAt: number;
}

// IMPORTANT: Next.js bundles each route separately — plain module-level Maps
// would give every route its own store. Anchor the shared state on globalThis
// so the challenge written by GET /api/auth/captcha is readable by
// POST /api/auth/captcha/verify in the same process.
interface CaptchaGlobal {
  __khlanCaptcha?: {
    challenges: Map<string, StoredChallenge>;
    consumedNonces: Set<string>;
  };
}

const g = globalThis as CaptchaGlobal;
if (!g.__khlanCaptcha) {
  g.__khlanCaptcha = { challenges: new Map(), consumedNonces: new Set() };
}
const challenges = g.__khlanCaptcha.challenges;
const consumedNonces = g.__khlanCaptcha.consumedNonces;

function pruneExpired(now: number) {
  if (challenges.size > MAX_STORED_CHALLENGES / 2) {
    for (const [id, ch] of challenges) {
      if (ch.expiresAt <= now) challenges.delete(id);
    }
  }
  if (consumedNonces.size > MAX_CONSUMED_TOKENS) {
    consumedNonces.clear(); // tokens are short-lived; full reset is safe
  }
}

/**
 * Build a fresh challenge: random word, letters shuffled across a 4×3 slot
 * grid (no overlaps) with random rotation and small jitter.
 */
export function createCaptchaChallenge(): CaptchaChallengeDTO {
  const now = Date.now();
  pruneExpired(now);

  const word = WORDS[crypto.randomInt(0, WORDS.length)];
  const id = crypto.randomUUID();

  // 4 cols × 3 rows slot centers (percent of panel size)
  const slots: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      slots.push({ x: ((col + 0.5) / 4) * 100, y: ((row + 0.5) / 3) * 100 });
    }
  }
  // Fisher–Yates shuffle the slots, then take one per letter.
  for (let i = slots.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  const tokens: CaptchaTokenDTO[] = [...word].map((letter, i) => ({
    letter,
    x: Math.min(91, Math.max(9, slots[i].x + (crypto.randomInt(-8, 9) * 0.7))),
    y: Math.min(84, Math.max(16, slots[i].y + (crypto.randomInt(-8, 9) * 0.6))),
    rot: crypto.randomInt(-42, 43),
  }));
  // Shuffle token order so neighbors in the array aren't the answer order.
  for (let i = tokens.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
  }

  challenges.set(id, { word, expiresAt: now + CAPTCHA_CHALLENGE_TTL_MS });
  return {
    id,
    word,
    tokens,
    expiresInSeconds: CAPTCHA_CHALLENGE_TTL_MS / 1000,
  };
}

/** Check a clicked sequence against the stored challenge (single attempt ok —
 *  the challenge stays valid until expiry so the user can retry or refresh). */
export function verifyCaptchaAnswer(id: string, sequence: string): boolean {
  const stored = challenges.get(id);
  if (!stored) return false;
  const now = Date.now();
  if (stored.expiresAt <= now) {
    challenges.delete(id);
    return false;
  }
  return sequence.trim().toUpperCase() === stored.word;
}

/** Release a challenge (client refresh / explicit abandon). */
export function consumeCaptchaChallenge(id: string): void {
  challenges.delete(id);
}

// ---------- single-use captcha token ----------

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(`captcha:${payload}`).digest("hex");
}

/** Issue a short-lived single-use token handed to login/register. */
export function issueCaptchaToken(): string {
  const exp = Date.now() + CAPTCHA_TOKEN_TTL_MS;
  const nonce = crypto.randomBytes(12).toString("hex");
  const payload = `${exp}.${nonce}`;
  return `cap.${payload}.${sign(payload)}`;
}

/** Validate + burn a captcha token. True exactly once per token. */
export function consumeCaptchaToken(token: string | undefined | null): boolean {
  if (!token || !token.startsWith("cap.")) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [, expRaw, nonce, sig] = parts;
  const payload = `${expRaw}.${nonce}`;
  const expected = sign(payload);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const key = `${nonce}.${sig.slice(0, 16)}`;
  if (consumedNonces.has(key)) return false;
  consumedNonces.add(key);
  return true;
}

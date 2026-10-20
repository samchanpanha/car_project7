import ZAI from "z-ai-web-dev-sdk";
import type { ReportCheck } from "@/lib/types";

const SYSTEM_PROMPT =
  "You write vehicle history report summaries for a Cambodian marketplace. " +
  "You MUST restate only the provided check results. Never upgrade a status, " +
  "never invent facts, never say a car is accident-free. " +
  'Respond with STRICT JSON only: {"summaryEn":"...","summaryKm":"..."} — ' +
  "2-3 sentences each, plain language.";

const LLM_TIMEOUT_MS = 30_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("LLM timeout")), ms)),
  ]);
}

function extractJson(raw: string): unknown {
  // strip code fences, then slice from first { to last }
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Deterministic fallback built from the checks, used whenever the LLM fails. */
export function fallbackSummary(checks: ReportCheck[]): { summaryEn: string; summaryKm: string } {
  const count = (s: string) => checks.filter((c) => c.status === s).length;
  const verified = count("VERIFIED");
  const evidence = count("EVIDENCE_FOUND");
  const inconsistent = count("INCONSISTENT");
  const notVerified = count("NOT_VERIFIED");
  const noData = count("NO_DATA");

  const gapAreas = checks
    .filter((c) => c.status === "NO_DATA" || c.status === "INCONSISTENT")
    .slice(0, 3);
  const areasEn = gapAreas.map((c) => c.title).join(", ") || "none — but always inspect in person";
  const areasKm =
    gapAreas.map((c) => c.titleKm).join(", ") || "គ្មាន — ប៉ុន្តែសូមពិនិត្យដោយខ្លួនឯងជានិច្ច";

  const summaryEn =
    `Based on ${checks.length} checks: ${verified} verified, ${evidence} supported by evidence, ` +
    `${inconsistent} inconsistencies flagged, ${notVerified} unverified, ${noData} with no data. ` +
    `Key items to verify in person: ${areasEn}.`;

  const summaryKm =
    `ផ្អែកលើការវិភាគ ${checks.length} ចំណុច៖ ${verified} ចំណុចបានផ្ទៀងផ្ទាត់, ` +
    `${evidence} ចំណុចមានភស្ដុតាងគាំទ្រ, ${inconsistent} ចំណុចមានភាពមិនសមស្រប, ` +
    `${notVerified} ចំណុចមិនទាន់ផ្ទៀងផ្ទាត់, ${noData} ចំណុចគ្មានទិន្នន័យ។ ` +
    `ចំណុចសំខាន់ៗដែលត្រូវផ្ទាល់ពិនិត្យដោយខ្លួនឯង៖ ${areasKm}។`;

  return { summaryEn, summaryKm };
}

/**
 * Bilingual report summary. Tries the LLM (30s timeout, defensive JSON parse)
 * and falls back to a deterministic template on any failure.
 */
export async function summarizeReport(
  vehicleTitle: string,
  checks: ReportCheck[],
): Promise<{ summaryEn: string; summaryKm: string }> {
  const fallback = fallbackSummary(checks);
  try {
    const zai = await ZAI.create();
    const completion = await withTimeout(
      zai.chat.completions.create({
        messages: [
          { role: "assistant", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Vehicle: ${vehicleTitle}\nCheck results JSON:\n${JSON.stringify(checks)}`,
          },
        ],
        thinking: { type: "disabled" },
      }),
      LLM_TIMEOUT_MS,
    );
    const text = completion.choices[0]?.message?.content ?? "";
    const parsed = extractJson(text) as { summaryEn?: unknown; summaryKm?: unknown };
    const summaryEn = typeof parsed.summaryEn === "string" ? parsed.summaryEn.trim() : "";
    const summaryKm = typeof parsed.summaryKm === "string" ? parsed.summaryKm.trim() : "";
    if (!summaryEn || !summaryKm) throw new Error("Invalid summary payload");
    return { summaryEn, summaryKm };
  } catch (err) {
    console.error("[summarizer] LLM summary failed, using fallback:", err);
    return fallback;
  }
}

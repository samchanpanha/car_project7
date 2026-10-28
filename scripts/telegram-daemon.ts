#!/usr/bin/env node
// Continuous Telegram background sync worker for KhLan.
// Automatically captures PayWay alerts, verifies transactions,
// handles mobile 1-tap approvals & rejections, and executes commands 24/7.

import { db } from "../src/lib/db";
import { getManualPaymentConfig, resolveTelegramConfig } from "../src/lib/api/payments";
import { syncTelegramGroupUpdates, previewTelegramGroupUpdates } from "../src/lib/api/aba-sync";

const POLL_INTERVAL_MS = 2500;
const ERROR_BACKOFF_MS = 5000;
const DRY_RUN = process.argv.includes("--dry-run");

let isRunning = true;

process.on("SIGINT", () => {
  console.log("\n[Telegram Daemon] Received SIGINT. Shutting down gracefully...");
  isRunning = false;
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[Telegram Daemon] Received SIGTERM. Shutting down gracefully...");
  isRunning = false;
  process.exit(0);
});

async function run() {
  console.log("==================================================");
  console.log("🚗 KhLan Telegram Group Sync & Approval Daemon");
  console.log("==================================================");

  let consecutiveErrors = 0;

  while (isRunning) {
    try {
      if (DRY_RUN) {
        const config = await getManualPaymentConfig();
        const { botToken, chatId } = resolveTelegramConfig(config);
        const targetChat = chatId || "-1004489863210";
        if (!botToken) {
          console.warn("[Dry Run] Waiting for bot token...");
          await new Promise((r) => setTimeout(r, 10_000));
          continue;
        }
        const previews = await previewTelegramGroupUpdates(botToken, targetChat);
        console.log(`[Dry Run] ${previews.length} ABA PayWay message(s) parsed.`);
        previews.forEach((p, i) => {
          console.log(`  #${i + 1}: Trx=${p.trxId}, APV=${p.apv}, ${p.currency} ${p.amount} => $${p.amountUsd}, Payer=${p.payerName}, Date=${p.transactionDateRaw}`);
        });
        await new Promise((r) => setTimeout(r, 10_000));
        continue;
      }

      const config = await getManualPaymentConfig();
      const { botToken, chatId } = resolveTelegramConfig(config);

      if (!botToken) {
        console.warn("[Telegram Daemon] Waiting for bot token to be configured...");
        await new Promise((r) => setTimeout(r, 10_000));
        continue;
      }

      const targetChat = chatId || "-1004489863210";
      const outcome = await syncTelegramGroupUpdates(botToken, targetChat);

      if (outcome.processed > 0 || outcome.newTransactions > 0 || outcome.approvalsProcessed > 0 || outcome.rejectionsProcessed > 0) {
        const timestamp = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Phnom_Penh" });
        console.log(
          `[Telegram Daemon ${timestamp}] ⚡ Processed: ${outcome.processed} | New TX: ${outcome.newTransactions} | Matched: ${outcome.matchedPayments} | Approvals: ${outcome.approvalsProcessed} | Rejections: ${outcome.rejectionsProcessed} | Commands: ${outcome.commandsProcessed}`,
        );
      }

      consecutiveErrors = 0;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    } catch (err) {
      consecutiveErrors++;
      const delay = Math.min(ERROR_BACKOFF_MS * consecutiveErrors, 30_000);
      console.error(`[Telegram Daemon] Error in loop (retrying in ${delay / 1000}s):`, err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

run().catch((err) => {
  console.error("[Telegram Daemon Fatal Error]:", err);
  process.exit(1);
});

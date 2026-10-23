// ABA PayWay / Bank Transaction sync & matching engine.
// Persists every transaction posted in the Telegram group to custom.db,
// with deduplication protection, same-time collision detection, and automated verification.

import { db } from "@/lib/db";
import { parseAbaPayWayMessage, isAbaPayWayMessage, type ParsedAbaTransaction } from "./aba-parser";
import { verifyPaymentAndActivate, rejectPayment } from "./payments";
import { updateTelegramMessageResolution, answerTelegramCallbackQuery } from "./telegram-notify";

export interface SyncOutcome {
  processed: number;
  newTransactions: number;
  matchedPayments: number;
  duplicatesPrevented: number;
  sameTimeCollisions: number;
  approvalsProcessed: number;
  rejectionsProcessed: number;
  commandsProcessed: number;
  errors: string[];
}

/**
 * Stores an ABA PayWay transaction into the database with:
 * 1. Strict deduplication verification (prevents re-recording same Trx ID or double-activating).
 * 2. Same-time collision detection (prevents misattribution when 2 transactions happen at the exact same time).
 * 3. Safe auto-verification against open subscription requests.
 */
export async function recordAbaTransaction(
  parsed: ParsedAbaTransaction,
  meta?: { messageId?: number; chatId?: string; botToken?: string },
): Promise<{
  transaction: any;
  matched: boolean;
  paymentId?: string;
  isDuplicate?: boolean;
  isSameTimeCollision?: boolean;
  isAmbiguous?: boolean;
  isUnderpaid?: boolean;
  error?: string;
}> {
  try {
    // ---------------- 1. DEDUPLICATION CHECK ----------------
    // Check if this exact transaction was already recorded
    const existing = await db.abaTransaction.findUnique({
      where: { trxId: parsed.trxId },
      include: {
        subscriptionPayment: {
          include: { tenant: { select: { id: true, name: true } } },
        },
      },
    });

    if (existing) {
      console.log(`[ABA Deduplication] Duplicate transaction detected for Trx ID ${parsed.trxId}`);
      // Mark as duplicate, increment counter, do NOT re-activate
      const updatedDuplicate = await db.abaTransaction.update({
        where: { id: existing.id },
        data: {
          isDuplicate: true,
          duplicateCount: { increment: 1 },
          verificationNote: `Duplicate notification received at ${new Date().toISOString()}`,
        },
        include: {
          subscriptionPayment: {
            include: { tenant: { select: { id: true, name: true } } },
          },
        },
      });

      return {
        transaction: updatedDuplicate,
        matched: existing.status === "MATCHED",
        paymentId: existing.subscriptionPaymentId ?? undefined,
        isDuplicate: true,
      };
    }

    // ---------------- 2. SAME-TIME COLLISION DETECTION ----------------
    // Check if any other transaction exists with the exact same minute / time (within 60s)
    const timeStart = new Date(parsed.transactionDate.getTime() - 60_000);
    const timeEnd = new Date(parsed.transactionDate.getTime() + 60_000);

    const sameTimeTxs = await db.abaTransaction.findMany({
      where: {
        transactionDate: { gte: timeStart, lte: timeEnd },
        trxId: { not: parsed.trxId },
      },
    });

    const hasSameTimeCollision = sameTimeTxs.length > 0;
    const collisionIds = hasSameTimeCollision ? sameTimeTxs.map((t) => t.trxId).join(",") : null;

    if (hasSameTimeCollision) {
      console.warn(
        `[ABA Collision] Same-time transaction detected: Trx ${parsed.trxId} collides with [${collisionIds}] at ${parsed.transactionDateRaw}`,
      );
      // Update existing colliding transactions bidirectionally with the new Trx ID
      for (const coll of sameTimeTxs) {
        const existingList = coll.collisionTrxIds ? coll.collisionTrxIds.split(",").filter(Boolean) : [];
        if (!existingList.includes(parsed.trxId)) {
          existingList.push(parsed.trxId);
        }
        await db.abaTransaction.update({
          where: { id: coll.id },
          data: {
            sameTimeCollision: true,
            collisionTrxIds: existingList.join(","),
            verificationNote: `Same-time collision with Trx ID(s): ${existingList.join(", ")} at ${coll.transactionDateRaw || "same time"}`,
          },
        });
      }
    }

    // ---------------- 3. INSERT NEW TRANSACTION ----------------
    const tx = await db.abaTransaction.create({
      data: {
        source: parsed.source,
        trxId: parsed.trxId,
        apv: parsed.apv,
        rawMessage: parsed.rawMessage,
        messageId: meta?.messageId,
        chatId: meta?.chatId,
        amount: parsed.amount,
        currency: parsed.currency,
        amountUsd: parsed.amountUsd,
        payerName: parsed.payerName,
        payerAccount: parsed.payerAccount,
        bankCode: parsed.bankCode,
        merchantName: parsed.merchantName,
        transactionDateRaw: parsed.transactionDateRaw,
        transactionDate: parsed.transactionDate,
        status: "UNMATCHED",
        isDuplicate: false,
        duplicateCount: 0,
        sameTimeCollision: hasSameTimeCollision,
        collisionTrxIds: collisionIds,
        verificationNote: hasSameTimeCollision
          ? `Same-time transaction collision with Trx: ${collisionIds}`
          : "Verified unique transaction timestamp",
      },
    });

    // ---------------- 4. ATTEMPT SAFE MATCHING & VERIFICATION ----------------
    const pendingPayments = await db.subscriptionPayment.findMany({
      where: { status: "AWAITING_VERIFICATION" },
      include: { tenant: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    if (pendingPayments.length === 0) {
      return { transaction: tx, matched: false, isSameTimeCollision: hasSameTimeCollision };
    }

    // Strategy A: Match by explicit manualRef (Trx ID or APV) — Deterministic & collision-immune
    let matchedPayment = pendingPayments.find((p) => {
      if (!p.manualRef) return false;
      const ref = p.manualRef.trim().toLowerCase();
      const trx = parsed.trxId.toLowerCase();
      const apv = (parsed.apv || "").toLowerCase();
      return ref.includes(trx) || trx.includes(ref) || (apv && ref.includes(apv));
    });

    let matchedStrategy = "AUTO_TRX_ID";

    // Strategy B: Match by Amount and Recent Timing (if no exact ref match)
    if (!matchedPayment) {
      const nowMs = parsed.transactionDate.getTime();
      const candidates = pendingPayments.filter((p) => {
        const timeDiffMinutes = Math.abs(nowMs - p.createdAt.getTime()) / (1000 * 60);
        if (timeDiffMinutes > 120) return false;

        // USD match
        const usdDiff = Math.abs(p.amountUsd - parsed.amountUsd);
        if (usdDiff < 0.5) return true;

        // KHR match
        const khrAmount = p.amountUsd * 4100;
        const khrDiff = Math.abs(khrAmount - parsed.amount);
        return khrDiff < 500;
      });

      // COLLISION GUARD:
      // If there are multiple candidate payments, OR if another transaction occurred at the SAME time
      // with a similar amount, DO NOT GUESS! Flag as AMBIGUOUS to protect dealer accounts.
      if (
        candidates.length > 1 ||
        (hasSameTimeCollision && sameTimeTxs.some((t) => Math.abs(t.amountUsd - parsed.amountUsd) < 0.5))
      ) {
        console.warn(
          `[ABA Collision Guard] Same-time ambiguity for Trx ${parsed.trxId}: multiple candidates found. Held for manual admin confirmation.`,
        );

        const ambiguousTx = await db.abaTransaction.update({
          where: { id: tx.id },
          data: {
            status: "AMBIGUOUS",
            verificationNote: `Ambiguous same-time collision: ${candidates.length} candidate payment(s) and ${sameTimeTxs.length} concurrent bank alert(s) at ${parsed.transactionDateRaw || "same time"}. Requires admin confirmation.`,
          },
        });

        if (meta?.botToken && meta?.chatId) {
          try {
            await fetch(`https://api.telegram.org/bot${meta.botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: meta.chatId,
                text: `⚠️ Same-Time Payment Collision!\nTrx: ${parsed.trxId} (${parsed.currency === "KHR" ? "៛" : "$"}${parsed.amount})\nTime: ${parsed.transactionDateRaw}\nMultiple dealers have pending requests around this time. Please confirm manually in the KhLan Admin Dashboard.`,
              }),
            });
          } catch {
            // best effort notification
          }
        }

        return {
          transaction: ambiguousTx,
          matched: false,
          isSameTimeCollision: true,
          isAmbiguous: true,
        };
      }

      // Safe match: Exactly 1 candidate payment and no colliding transactions
      if (candidates.length === 1 && !hasSameTimeCollision) {
        matchedPayment = candidates[0];
        matchedStrategy = "AUTO_AMOUNT_TIME";
      }
    }

    if (!matchedPayment) {
      if (meta?.botToken && meta?.chatId) {
        try {
          const alertLines = [
            `📥 PayWay Alert Captured`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `💰 Amount: ${parsed.currency === "KHR" ? "៛" : "$"}${parsed.amount.toLocaleString()} ($${parsed.amountUsd.toFixed(2)})`,
            `🏦 Trx ID: ${parsed.trxId}${parsed.apv ? ` | APV: ${parsed.apv}` : ""}`,
            `👤 Payer: ${parsed.payerName || "Customer"}${parsed.payerAccount ? ` (${parsed.payerAccount})` : ""}`,
            `📅 Date: ${parsed.transactionDateRaw || "Recent"}`,
            "",
            `📌 Status: UNMATCHED (Saved in Database). Will automatically link & activate when the seller/dealer submits this Trx ID in their payment form.`,
          ];
          await fetch(`https://api.telegram.org/bot${meta.botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: meta.chatId,
              text: alertLines.join("\n"),
              reply_markup: {
                inline_keyboard: [
                  [{ text: "📋 Check Pending Requests", callback_data: "view_pending" }],
                ],
              },
            }),
          });
        } catch {
          // best effort
        }
      }
      return { transaction: tx, matched: false, isSameTimeCollision: hasSameTimeCollision };
    }

    // ---------------- 5. VERIFY PAYMENT & ACTIVATE SUBSCRIPTION ----------------
    console.log(
      `[ABA Sync] Matching Trx ${parsed.trxId} to Payment ${matchedPayment.reference} (${matchedStrategy})`,
    );

    // Double-check payment isn't already verified (concurrency protection)
    if (matchedPayment.status === "VERIFIED") {
      return { transaction: tx, matched: false, isDuplicate: true };
    }

    // CHECK IF FULL SUBSCRIPTION PRICE WAS PAID:
    const requiredUsd = matchedPayment.amountUsd;
    const receivedUsd = parsed.amountUsd;
    const isPaidInFull = receivedUsd >= (requiredUsd - 0.05);

    if (!isPaidInFull) {
      console.warn(
        `[ABA Sync] Partial / Underpayment detected for Trx ${parsed.trxId}: Required $${requiredUsd.toFixed(2)}, Received $${receivedUsd.toFixed(2)}. Held in PENDING for admin review.`,
      );

      const underpaidNote = `⚠️ Underpaid: Bank received ${parsed.currency === "KHR" ? "៛" : "$"}${parsed.amount.toLocaleString()} ($${receivedUsd.toFixed(2)}) but subscription plan requires $${requiredUsd.toFixed(2)}. Held in PENDING for admin review.`;

      // Update ABA transaction as UNDERPAID
      const underpaidTx = await db.abaTransaction.update({
        where: { id: tx.id },
        data: {
          status: "UNDERPAID",
          subscriptionPaymentId: matchedPayment.id,
          verificationNote: underpaidNote,
        },
      });

      // Update SubscriptionPayment note and keep status as AWAITING_VERIFICATION (pending)
      await db.subscriptionPayment.update({
        where: { id: matchedPayment.id },
        data: {
          note: underpaidNote,
          verifiedByName: `ABA Partial Payment (${parsed.trxId})`,
        },
      });

      // Alert in Telegram group
      if (meta?.botToken && meta?.chatId) {
        const alertText = [
          `⚠️ Partial / Underpayment Received!`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `🏢 Dealer: ${matchedPayment.tenant.name}`,
          `📋 Plan: ${matchedPayment.plan} (${matchedPayment.billingCycle})`,
          `💰 Required: $${requiredUsd.toFixed(2)}`,
          `💵 Received: ${parsed.currency === "KHR" ? "៛" : "$"}${parsed.amount.toLocaleString()} ($${receivedUsd.toFixed(2)}) by ${parsed.payerName || "Customer"}`,
          `🏦 Trx ID: ${parsed.trxId}`,
          `⚠️ Not paid in full: Subscription kept in PENDING for manual admin check!`,
        ].join("\n");

        try {
          await fetch(`https://api.telegram.org/bot${meta.botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: meta.chatId, text: alertText }),
          });
        } catch {
          // best effort
        }
      }

      return {
        transaction: underpaidTx,
        matched: false,
        paymentId: matchedPayment.id,
        isUnderpaid: true,
      };
    }

    // FULL PAYMENT CONFIRMED: Auto-approve & Activate!
    await verifyPaymentAndActivate(matchedPayment, `aba-payway:${parsed.trxId}`);

    // Update ABA transaction record
    const updatedTx = await db.abaTransaction.update({
      where: { id: tx.id },
      data: {
        status: "MATCHED",
        subscriptionPaymentId: matchedPayment.id,
        matchedAt: new Date(),
        matchedBy: matchedStrategy,
        verificationNote: `Verified in Telegram group (Full payment $${receivedUsd.toFixed(2)} received) & auto-approved subscription for ${matchedPayment.tenant.name}`,
      },
    });

    // Update SubscriptionPayment with ABA details
    await db.subscriptionPayment.update({
      where: { id: matchedPayment.id },
      data: {
        verifiedByName: `ABA PayWay (${parsed.trxId})`,
        notifiedSeller: true,
        notifiedAt: new Date(),
        note: `Verified in Telegram group: Full payment received ($${receivedUsd.toFixed(2)}) via ABA Trx ${parsed.trxId}`,
      },
    });

    // ---------------- 6. UPDATE TELEGRAM PROOF & SEND CONFIRMATION ----------------
    if (
      meta?.botToken &&
      matchedPayment.telegramGroupId &&
      matchedPayment.telegramMessageId
    ) {
      const updatedCaption = [
        `🔐 KhLan — Subscription Payment Verified`,
        `🏢 Tenant: ${matchedPayment.tenant.name}`,
        `📋 Plan: ${matchedPayment.plan} (${matchedPayment.billingCycle})`,
        `💰 Amount: $${matchedPayment.amountUsd.toFixed(2)}`,
        `🔖 Reference: ${matchedPayment.reference}`,
        "",
        `⚡ AUTO-MATCHED & VERIFIED via ABA PayWay!`,
        `🏦 Trx ID: ${parsed.trxId} | APV: ${parsed.apv || "N/A"}`,
        `💵 Received: ${parsed.currency === "KHR" ? "៛" : "$"}${parsed.amount.toLocaleString()}`,
        `📅 ${new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" })}`,
      ].join("\n");

      await updateTelegramMessageResolution(
        meta.botToken,
        matchedPayment.telegramGroupId,
        matchedPayment.telegramMessageId,
        updatedCaption,
        Boolean(matchedPayment.evidenceImage),
      );
    }

    if (meta?.botToken && meta?.chatId) {
      const confirmText = [
        `✅ Auto-Matched & Activated!`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🏢 Dealer: ${matchedPayment.tenant.name}`,
        `📋 Plan: ${matchedPayment.plan} (${matchedPayment.billingCycle})`,
        `🔖 Ref: ${matchedPayment.reference}`,
        `💳 ABA Trx ID: ${parsed.trxId}`,
        `💰 Paid: ${parsed.currency === "KHR" ? "៛" : "$"}${parsed.amount.toLocaleString()} by ${parsed.payerName || "Customer"}`,
        `🎉 Subscription is now ACTIVE!`,
      ].join("\n");

      try {
        await fetch(`https://api.telegram.org/bot${meta.botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: meta.chatId, text: confirmText }),
        });
      } catch {
        // best effort notification
      }
    }

    return {
      transaction: updatedTx,
      matched: true,
      paymentId: matchedPayment.id,
      isSameTimeCollision: hasSameTimeCollision,
    };
  } catch (err) {
    console.error("[recordAbaTransaction] Error:", err);
    return {
      transaction: null,
      matched: false,
      error: err instanceof Error ? err.message : "Sync error",
    };
  }
}

export interface TelegramCallbackQueryPayload {
  id: string;
  from: {
    id: number;
    is_bot?: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  message?: {
    message_id: number;
    chat: {
      id: number | string;
      title?: string;
      type: string;
    };
    caption?: string;
    text?: string;
  };
  data?: string;
}

/**
 * Handles inline keyboard button clicks ([✅ Approve] / [❌ Reject]) from Telegram group:
 * - Approves/rejects payment in database
 * - Activates subscription
 * - Matches corresponding ABA transaction
 * - Updates message in Telegram group with final resolution badge
 * - Answers callback query popup
 */
export async function processTelegramCallbackQuery(
  query: TelegramCallbackQueryPayload,
  botToken: string,
  targetChatId: string = "-1004489863210",
): Promise<{ ok: boolean; action?: string; paymentId?: string; message?: string }> {
  const data = query.data || "";
  const user = query.from;
  const adminName = user.username ? `@${user.username}` : user.first_name || "Admin";

  if (data === "noop") {
    await answerTelegramCallbackQuery(botToken, query.id, "This payment request has already been finalized.");
    return { ok: true, action: "noop" };
  }

  if (data === "view_pending") {
    const pending = await db.subscriptionPayment.findMany({
      where: { status: "AWAITING_VERIFICATION" },
      include: { tenant: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    if (pending.length === 0) {
      await answerTelegramCallbackQuery(botToken, query.id, "No pending subscription requests right now.", true);
      return { ok: true, action: "view_pending" };
    }

    await answerTelegramCallbackQuery(botToken, query.id, `Found ${pending.length} pending request(s).`);
    const chatId = query.message?.chat?.id ? String(query.message.chat.id) : targetChatId;

    for (const p of pending) {
      const text = [
        `📋 Pending Subscription: ${p.reference}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🏢 Dealer: ${p.tenant.name}`,
        `📋 Plan: ${p.plan} (${p.billingCycle})`,
        `💰 Amount: $${p.amountUsd.toFixed(2)}`,
        p.manualRef ? `🏦 Bank Ref: ${p.manualRef}` : null,
        "",
        `Tap below to approve or reject:`,
      ].filter(Boolean).join("\n");

      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✅ Approve & Activate", callback_data: `approve:${p.id}` },
                  { text: "❌ Reject", callback_data: `reject:${p.id}` },
                ],
              ],
            },
          }),
        });
      } catch {
        // best effort
      }
    }
    return { ok: true, action: "view_pending" };
  }

  // 1. Handle fraud alert cancellation / dismissal
  if (data.startsWith("fraud_cancel:")) {
    const alertId = data.replace(/^fraud_cancel:/, "").trim();
    const alert = await (db as any).fraudAlert.findUnique({
      where: { id: alertId },
    });

    if (alert) {
      await (db as any).fraudAlert.update({
        where: { id: alertId },
        data: {
          status: "DISMISSED",
          resolvedBy: adminName,
          resolvedAt: new Date(),
        },
      });
    }

    await answerTelegramCallbackQuery(botToken, query.id, "Fraud alert dismissed.");

    const chatId = query.message?.chat?.id ? String(query.message.chat.id) : targetChatId;
    const messageId = query.message?.message_id;
    const isPhoto = Boolean(query.message?.caption);
    const originalText = query.message?.caption || query.message?.text || "";

    if (chatId && messageId) {
      const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });
      const updatedCaption = `${originalText.replace(/👮 Choose Admin Security Action:[\s\S]*$/, "").trim()}\n\n❌ FRAUD ALERT DISMISSED by ${adminName}\n📅 ${timestamp} (Phnom Penh)`;
      await updateTelegramMessageResolution(
        botToken,
        chatId,
        messageId,
        updatedCaption,
        isPhoto,
        `❌ Dismissed by ${adminName}`,
      );
    }
    return { ok: true, action: "fraud_cancel", paymentId: alertId };
  }

  // 2. Handle fraud alert user & shop blacklisting
  if (data.startsWith("fraud_blacklist:")) {
    const alertId = data.replace(/^fraud_blacklist:/, "").trim();
    const alert = await (db as any).fraudAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      await answerTelegramCallbackQuery(botToken, query.id, "Fraud alert record not found", true);
      return { ok: false, message: "Fraud alert not found" };
    }

    const targetUser = await db.user.findUnique({ where: { id: alert.userId } });
    const targetTenant = await db.tenant.findUnique({ where: { id: alert.tenantId } });

    // A. Blacklist User
    await (db.user as any).update({
      where: { id: alert.userId },
      data: {
        isBlacklisted: true,
        blacklistReason: `Blacklisted by ${adminName} via Telegram: submitted invalid/foreign payment slip (paid to "${alert.detectedPayee || "foreign merchant"}")`,
        blacklistedAt: new Date(),
      },
    });

    // B. Blacklist Tenant
    await db.tenant.update({
      where: { id: alert.tenantId },
      data: {
        status: "BLACKLISTED",
      },
    });

    // C. Blacklist Tenant Memberships
    await db.tenantMember.updateMany({
      where: { tenantId: alert.tenantId },
      data: { status: "BLACKLISTED" },
    });

    // D. Reject any pending payment requests
    await db.subscriptionPayment.updateMany({
      where: {
        tenantId: alert.tenantId,
        status: { in: ["PENDING", "AWAITING_VERIFICATION"] },
      },
      data: {
        status: "REJECTED",
        rejectionReason: `User & Dealership blacklisted by ${adminName} for submitting invalid payment slip`,
        reviewedAt: new Date(),
        reviewedById: `telegram:${adminName}`,
      },
    });

    // E. Mark FraudAlert resolved
    await (db as any).fraudAlert.update({
      where: { id: alertId },
      data: {
        status: "BLACKLISTED",
        resolvedBy: adminName,
        resolvedAt: new Date(),
      },
    });

    await answerTelegramCallbackQuery(
      botToken,
      query.id,
      `🚫 USER & SHOP BLACKLISTED!\n\nUser ${targetUser?.name || "User"} has been banned from the marketplace.`,
      true,
    );

    const chatId = query.message?.chat?.id ? String(query.message.chat.id) : targetChatId;
    const messageId = query.message?.message_id;
    const isPhoto = Boolean(query.message?.caption);
    const originalText = query.message?.caption || query.message?.text || "";

    if (chatId && messageId) {
      const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });
      const updatedCaption = [
        originalText.replace(/👮 Choose Admin Security Action:[\s\S]*$/, "").trim(),
        "",
        `🚫 USER & SHOP BLACKLISTED by ${adminName}!`,
        `👤 User: ${targetUser?.name} (${targetUser?.phone})`,
        `🏢 Dealership: ${targetTenant?.name}`,
        `📅 ${timestamp} (Phnom Penh)`,
        `⛔ Access permanently revoked. All pending payments rejected.`,
      ].join("\n");

      await updateTelegramMessageResolution(
        botToken,
        chatId,
        messageId,
        updatedCaption,
        isPhoto,
        `🚫 Blacklisted by ${adminName}`,
      );

      // Post audit confirmation
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: [
              `🚫 Security Enforcement: Account Blacklisted`,
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
              `👤 User: ${targetUser?.name} (${targetUser?.phone})`,
              `🏢 Dealership: ${targetTenant?.name}`,
              `👮 Admin: ${adminName}`,
              `📅 ${timestamp} (Phnom Penh)`,
              `⚡ Status: PERMANENTLY BANNED FROM PLATFORM`,
              `Reason: Foreign payment slip submitted (paid to "${alert.detectedPayee || "foreign merchant"}")`,
            ].join("\n"),
          }),
        });
      } catch {}
    }

    return { ok: true, action: "fraud_blacklist", paymentId: alertId };
  }

  // 3. Handle blacklist directly from payment submission [Blacklist User] button
  if (data.startsWith("blacklist_payment:")) {
    const payId = data.replace(/^blacklist_payment:/, "").trim();
    const payment = await db.subscriptionPayment.findUnique({
      where: { id: payId },
      include: { tenant: { include: { members: { where: { role: "OWNER" }, include: { user: true } } } } },
    });

    if (!payment) {
      await answerTelegramCallbackQuery(botToken, query.id, "Payment not found", true);
      return { ok: false, message: "Payment not found" };
    }

    const ownerMember = payment.tenant.members[0];
    const targetUser = ownerMember?.user;

    if (targetUser) {
      await (db.user as any).update({
        where: { id: targetUser.id },
        data: {
          isBlacklisted: true,
          blacklistReason: `Blacklisted by ${adminName} via Telegram for payment fraud on ${payment.reference}`,
          blacklistedAt: new Date(),
        },
      });
    }

    await db.tenant.update({
      where: { id: payment.tenantId },
      data: { status: "BLACKLISTED" },
    });

    await db.tenantMember.updateMany({
      where: { tenantId: payment.tenantId },
      data: { status: "BLACKLISTED" },
    });

    await db.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: "REJECTED",
        rejectionReason: `Blacklisted by ${adminName} for fraudulent submission`,
        reviewedAt: new Date(),
        reviewedById: `telegram:${adminName}`,
        notifiedSeller: true,
        notifiedAt: new Date(),
      },
    });

    await answerTelegramCallbackQuery(botToken, query.id, `🚫 Dealership ${payment.tenant.name} Blacklisted!`, true);

    const chatId = query.message?.chat?.id ? String(query.message.chat.id) : payment.telegramGroupId || targetChatId;
    const messageId = query.message?.message_id || payment.telegramMessageId;
    const isPhoto = Boolean(query.message?.caption);
    const originalText = query.message?.caption || query.message?.text || "";

    if (chatId && messageId) {
      const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });
      const updatedCaption = `${originalText.replace(/⚡ Tap below to verify[\s\S]*$/, "").trim()}\n\n🚫 DEALER BLACKLISTED by ${adminName}\n📅 ${timestamp} (Phnom Penh)\n⛔ Access permanently revoked.`;
      await updateTelegramMessageResolution(
        botToken,
        chatId,
        messageId,
        updatedCaption,
        isPhoto,
        `🚫 Blacklisted by ${adminName}`,
      );
    }

    return { ok: true, action: "blacklist_payment", paymentId: payId };
  }

  const [action, paymentId] = data.split(":");
  if (!paymentId || (action !== "approve" && action !== "reject")) {
    await answerTelegramCallbackQuery(botToken, query.id, "Unknown action");
    return { ok: false, message: "Unknown action" };
  }

  const payment = await db.subscriptionPayment.findUnique({
    where: { id: paymentId },
    include: { tenant: true },
  });

  if (!payment) {
    await answerTelegramCallbackQuery(botToken, query.id, "Payment record not found in database", true);
    return { ok: false, message: "Payment not found" };
  }

  const chatId = query.message?.chat?.id ? String(query.message.chat.id) : payment.telegramGroupId || targetChatId;
  const messageId = query.message?.message_id || payment.telegramMessageId;
  const isPhoto = Boolean(query.message?.caption);
  const originalText = query.message?.caption || query.message?.text || "";

  if (action === "approve") {
    if (payment.status === "VERIFIED") {
      await answerTelegramCallbackQuery(botToken, query.id, "Already verified!");
      if (chatId && messageId) {
        const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });
        await updateTelegramMessageResolution(
          botToken,
          chatId,
          messageId,
          `${originalText}\n\n✅ ALREADY VERIFIED & ACTIVE\n📅 ${timestamp}`,
          isPhoto,
          "✅ Approved & Active",
        );
      }
      return { ok: true, action: "approve", paymentId };
    }

    // Verify & Activate subscription
    try {
      await verifyPaymentAndActivate(payment, `telegram:${adminName}`);
    } catch (actErr: any) {
      console.error("[processTelegramCallbackQuery] verifyPaymentAndActivate failed:", actErr);
      await answerTelegramCallbackQuery(
        botToken,
        query.id,
        `⚠️ Could not approve: ${actErr.message || "Unknown error"}`,
        true,
      );
      return { ok: false, message: actErr.message };
    }

    // Update payment record
    await db.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        verifiedByName: adminName,
        notifiedSeller: true,
        notifiedAt: new Date(),
        note: payment.note ? `${payment.note} | Approved in Telegram by ${adminName}` : `Approved in Telegram by ${adminName}`,
      },
    });

    // If there's an associated ABA transaction, link & match it
    if (payment.manualRef) {
      const trimmedRef = payment.manualRef.trim();
      const matchingAbaTx = await db.abaTransaction.findFirst({
        where: {
          OR: [
            { trxId: trimmedRef },
            { apv: trimmedRef },
          ],
          status: { in: ["UNMATCHED", "UNDERPAID", "AMBIGUOUS"] },
        },
      });
      if (matchingAbaTx) {
        await db.abaTransaction.update({
          where: { id: matchingAbaTx.id },
          data: {
            status: "MATCHED",
            subscriptionPaymentId: payment.id,
            matchedAt: new Date(),
            matchedBy: `TELEGRAM:${adminName}`,
            verificationNote: `Approved in Telegram group by ${adminName}`,
          },
        });
      }
    }

    await answerTelegramCallbackQuery(
      botToken,
      query.id,
      `✅ Approved! ${payment.tenant.name}'s subscription is now ACTIVE.`,
    );

    if (chatId && messageId) {
      const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });
      const updatedCaption = [
        originalText.split("━━━━━━━━━━━━━━━━━━━━━━━━━━━")[0].replace(/⚡ Tap below to verify[\s\S]*$/, "").trim() ||
          `🔐 KhLan — Subscription Payment (${payment.reference})`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🏢 Dealer / Tenant: ${payment.tenant.name}`,
        `📋 Plan: ${payment.plan} (${payment.billingCycle})`,
        `💰 Amount: $${payment.amountUsd.toFixed(2)}`,
        payment.manualRef ? `🏦 Bank Ref: ${payment.manualRef}` : null,
        "",
        `✅ PROCESSING COMPLETE · APPROVED & ACTIVATED`,
        `👤 Verified by: ${adminName}`,
        `📅 ${timestamp} (Phnom Penh)`,
        `🎉 Status: ACTIVE · Auto-Updated in System`,
      ].filter(Boolean).join("\n");

      await updateTelegramMessageResolution(
        botToken,
        chatId,
        messageId,
        updatedCaption,
        isPhoto,
        `✅ Processing Complete · Approved by ${adminName}`,
      );

      // Post confirmation announcement in the Telegram group
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: [
              `🎉 Payment Verified & Processing Complete!`,
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
              `🏢 Dealer / Tenant: ${payment.tenant.name}`,
              `📋 Plan: ${payment.plan} (${payment.billingCycle})`,
              `💰 Amount: $${payment.amountUsd.toFixed(2)}`,
              `🔖 Reference: ${payment.reference}`,
              payment.manualRef ? `🏦 Bank Ref: ${payment.manualRef}` : null,
              `👤 Approved by: ${adminName}`,
              `📅 ${timestamp} (Phnom Penh)`,
              `⚡ Status: PROCESSING COMPLETE · SUBSCRIPTION ACTIVE!`,
            ].filter(Boolean).join("\n"),
          }),
        });
      } catch {}
    }

    return { ok: true, action: "approve", paymentId };
  }

  if (action === "reject") {
    if (payment.status === "REJECTED") {
      await answerTelegramCallbackQuery(botToken, query.id, "Already rejected");
      return { ok: true, action: "reject", paymentId };
    }

    const rejectionReason = `Rejected via Telegram by ${adminName}`;
    try {
      await rejectPayment(payment, `telegram:${adminName}`, rejectionReason);
    } catch (rejErr: any) {
      console.error("[processTelegramCallbackQuery] rejectPayment failed:", rejErr);
      await answerTelegramCallbackQuery(
        botToken,
        query.id,
        `⚠️ Could not reject: ${rejErr.message || "Unknown error"}`,
        true,
      );
      return { ok: false, message: rejErr.message };
    }

    await db.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        verifiedByName: adminName,
        notifiedSeller: true,
        notifiedAt: new Date(),
      },
    });

    await answerTelegramCallbackQuery(botToken, query.id, `❌ Payment Rejected for ${payment.tenant.name}`);

    if (chatId && messageId) {
      const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });
      const updatedCaption = [
        originalText.split("━━━━━━━━━━━━━━━━━━━━━━━━━━━")[0].replace(/⚡ Tap below to verify[\s\S]*$/, "").trim() ||
          `🔐 KhLan — Subscription Payment (${payment.reference})`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🏢 Dealer / Tenant: ${payment.tenant.name}`,
        `📋 Plan: ${payment.plan} (${payment.billingCycle})`,
        `💰 Amount: $${payment.amountUsd.toFixed(2)}`,
        `🔖 Reference: ${payment.reference}`,
        "",
        `❌ REJECTED by ${adminName}`,
        `📅 ${timestamp} (Phnom Penh)`,
        `⚠️ Status: REJECTED (Subscription NOT activated)`,
      ].join("\n");

      await updateTelegramMessageResolution(
        botToken,
        chatId,
        messageId,
        updatedCaption,
        isPhoto,
        `❌ Rejected by ${adminName}`,
      );

      // Post rejection notice in the Telegram group
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: [
              `❌ Payment Rejected`,
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
              `🏢 Dealer / Tenant: ${payment.tenant.name}`,
              `🔖 Reference: ${payment.reference}`,
              `👤 Rejected by: ${adminName}`,
              `📅 ${timestamp} (Phnom Penh)`,
              `⚠️ Status: REJECTED (Subscription NOT activated)`,
            ].join("\n"),
          }),
        });
      } catch {}
    }

    return { ok: true, action: "reject", paymentId };
  }

  return { ok: false, message: "Unhandled action" };
}

/**
 * Handles text commands and replies posted in the Telegram group (/status, /pending, /approve, /reject, /aba, /sync, /help)
 */
export async function handleTelegramGroupCommand(
  rawMsgOrText: any,
  arg2?: any,
  arg3?: any,
  arg4?: any,
): Promise<boolean> {
  let text = "";
  let chatId: string | number = "-1004489863210";
  let senderName = "Admin";
  let botToken = "";
  let replyToMsg: any = null;

  if (typeof rawMsgOrText === "object" && rawMsgOrText !== null) {
    const msg = rawMsgOrText;
    text = (msg.text || msg.caption || "").trim();
    chatId = msg.chat?.id || "-1004489863210";
    senderName = msg.from?.username ? `@${msg.from.username}` : msg.from?.first_name || "Admin";
    botToken = String(arg2 || "");
    replyToMsg = msg.reply_to_message;
  } else {
    text = String(rawMsgOrText || "").trim();
    chatId = arg2;
    senderName = String(arg3 || "Admin");
    botToken = String(arg4 || "");
  }

  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // /aba <alert> or /payway <alert>
  if (lower.startsWith("/aba") || lower.startsWith("/payway")) {
    const rawAlert = trimmed.replace(/^\/(?:aba|payway)(?:@\w+)?/i, "").trim();
    if (!rawAlert) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `ℹ️ Usage: /aba <paste PayWay notification message>\nExample: /aba PayWay by ABA: ៛200 paid by Sam Chanpanha (*674) on Oct 22, 01:05 PM via ABA KHQR at SAM CHAN PANHA. Trx. ID: 179264913984347, APV: 135160.`,
          }),
        });
      } catch {}
      return true;
    }

    const parsed = parseAbaPayWayMessage(rawAlert);
    if (!parsed) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `⚠️ Could not parse Trx ID or Amount from the message. Please ensure it contains 'Trx. ID: ...' and an amount.`,
          }),
        });
      } catch {}
      return true;
    }

    const res = await recordAbaTransaction(parsed, {
      chatId: String(chatId),
      botToken,
    });

    const replyMsg = res.isDuplicate
      ? `ℹ️ Duplicate Trx ID ${parsed.trxId}: already recorded in database. Duplicate count incremented.`
      : res.matched
      ? `✅ Auto-Matched & Activated! Trx ID ${parsed.trxId} matched pending subscription payment. Processing complete!`
      : `📥 Saved Trx ${parsed.trxId} (${parsed.currency === "KHR" ? "៛" : "$"}${parsed.amount.toLocaleString()}) to database (Status: UNMATCHED).`;

    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: replyMsg }),
      });
    } catch {}
    return true;
  }

  // /status
  if (lower === "/status" || lower.startsWith("/status@")) {
    const [txCount, matchedCount, unmatchedCount, pendingCount, activeSubs] = await Promise.all([
      db.abaTransaction.count(),
      db.abaTransaction.count({ where: { status: "MATCHED" } }),
      db.abaTransaction.count({ where: { status: "UNMATCHED" } }),
      db.subscriptionPayment.count({ where: { status: "AWAITING_VERIFICATION" } }),
      db.subscription.count({ where: { status: "ACTIVE" } }),
    ]);

    const msg = [
      `📊 KhLan Telegram Syncer Status`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👥 Group: MyABApayway (${chatId})`,
      `💳 Total ABA Transactions: ${txCount}`,
      `✅ Matched & Verified: ${matchedCount}`,
      `📥 Unmatched (Awaiting match): ${unmatchedCount}`,
      `⏳ Pending Dealer Requests: ${pendingCount}`,
      `🏢 Active Subscriptions: ${activeSubs}`,
      `📅 Server Time: ${new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" })}`,
    ].join("\n");

    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: msg }),
      });
    } catch {}
    return true;
  }

  // /pending
  if (lower === "/pending" || lower.startsWith("/pending@")) {
    const pending = await db.subscriptionPayment.findMany({
      where: { status: "AWAITING_VERIFICATION" },
      include: { tenant: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    if (pending.length === 0) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ No pending payments! All subscription requests have been verified.`,
          }),
        });
      } catch {}
      return true;
    }

    for (const p of pending) {
      const card = [
        `📋 Pending Subscription: ${p.reference}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🏢 Dealer: ${p.tenant.name}`,
        `📋 Plan: ${p.plan} (${p.billingCycle})`,
        `💰 Amount: $${p.amountUsd.toFixed(2)}`,
        p.manualRef ? `🏦 Bank Ref: ${p.manualRef}` : null,
        `📅 Submitted: ${p.createdAt.toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" })}`,
        "",
        `Tap below to approve or reject:`,
      ].filter(Boolean).join("\n");

      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: card,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✅ Approve & Activate", callback_data: `approve:${p.id}` },
                  { text: "❌ Reject", callback_data: `reject:${p.id}` },
                ],
              ],
            },
          }),
        });
      } catch {}
    }
    return true;
  }

  // Check if message is an APPROVE intent:
  // 1. /approve ...
  // 2. OR reply to a payment card with words: approve, approved, ok, yes, done, y, ✅
  const isApproveIntent =
    lower.startsWith("/approve") ||
    (Boolean(replyToMsg) && /^(approve|approved|ok|yes|y|done|verified|activate|✅)($|\s)/i.test(lower));

  // Check if message is a REJECT intent:
  // 1. /reject ...
  // 2. OR reply to a payment card with words: reject, rejected, no, cancel, deny, declined, ❌
  const isRejectIntent =
    lower.startsWith("/reject") ||
    (Boolean(replyToMsg) && /^(reject|rejected|no|cancel|deny|declined|❌)($|\s)/i.test(lower));

  if (isApproveIntent) {
    let targetPayment: any = null;

    // 1. If this was a reply to a message sent by the bot
    if (replyToMsg?.message_id) {
      targetPayment = await db.subscriptionPayment.findFirst({
        where: {
          telegramMessageId: replyToMsg.message_id,
          status: "AWAITING_VERIFICATION",
        },
        include: { tenant: true },
      });

      if (!targetPayment) {
        // Try extracting reference like PAY-20261023-XXXXXX from reply text/caption
        const refMatch = (replyToMsg.caption || replyToMsg.text || "").match(/PAY-\d{8}-[A-Za-z0-9]+/);
        if (refMatch) {
          targetPayment = await db.subscriptionPayment.findFirst({
            where: { reference: refMatch[0], status: "AWAITING_VERIFICATION" },
            include: { tenant: true },
          });
        }
      }
    }

    // 2. If query was supplied in command (/approve <query>)
    const query = trimmed.replace(/^\/approve(?:@\w+)?/i, "").trim();
    if (!targetPayment && query) {
      const q = query.toLowerCase();
      const allPending = await db.subscriptionPayment.findMany({
        where: { status: "AWAITING_VERIFICATION" },
        include: { tenant: true },
        orderBy: { createdAt: "desc" },
      });
      targetPayment = allPending.find(
        (p) =>
          p.reference.toLowerCase() === q ||
          p.reference.toLowerCase().includes(q) ||
          (p.manualRef && p.manualRef.toLowerCase() === q) ||
          (p.manualRef && p.manualRef.toLowerCase().includes(q)) ||
          p.id.toLowerCase() === q ||
          p.tenant.name.toLowerCase().includes(q),
      ) ?? null;
    }

    // 3. If no query and not replied, check if there is exactly 1 pending payment
    if (!targetPayment && !query) {
      const allPending = await db.subscriptionPayment.findMany({
        where: { status: "AWAITING_VERIFICATION" },
        include: { tenant: true },
        orderBy: { createdAt: "desc" },
      });

      if (allPending.length === 1) {
        targetPayment = allPending[0];
      } else if (allPending.length === 0) {
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: `ℹ️ No pending payments waiting for verification.`,
            }),
          });
        } catch {}
        return true;
      } else {
        // Multiple pending, prompt admin with interactive buttons
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: `📋 Multiple pending payments found (${allPending.length}). Tap which one to approve:`,
              reply_markup: {
                inline_keyboard: allPending.map((p) => [
                  {
                    text: `✅ Approve ${p.reference} (${p.tenant.name} - $${p.amountUsd})`,
                    callback_data: `approve:${p.id}`,
                  },
                ]),
              },
            }),
          });
        } catch {}
        return true;
      }
    }

    if (!targetPayment) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `⚠️ No pending payment found matching '${query || "your message"}'. Type /pending to list pending requests.`,
          }),
        });
      } catch {}
      return true;
    }

    // Execute approval & activate subscription
    try {
      await verifyPaymentAndActivate(targetPayment, `telegram:${senderName}`);
      await db.subscriptionPayment.update({
        where: { id: targetPayment.id },
        data: {
          verifiedByName: senderName,
          notifiedSeller: true,
          notifiedAt: new Date(),
          note: targetPayment.note
            ? `${targetPayment.note} | Approved via Telegram by ${senderName}`
            : `Approved via Telegram by ${senderName}`,
        },
      });

      // Link matching ABA transaction
      if (targetPayment.manualRef) {
        const trimmedRef = targetPayment.manualRef.trim();
        await db.abaTransaction.updateMany({
          where: {
            OR: [{ trxId: trimmedRef }, { apv: trimmedRef }],
            status: { in: ["UNMATCHED", "UNDERPAID", "AMBIGUOUS"] },
          },
          data: {
            status: "MATCHED",
            subscriptionPaymentId: targetPayment.id,
            matchedAt: new Date(),
            matchedBy: `TELEGRAM:${senderName}`,
            verificationNote: `Approved via Telegram by ${senderName}`,
          },
        });
      }

      // Update original card in Telegram if messageId exists
      const targetMsgId = targetPayment.telegramMessageId || replyToMsg?.message_id;
      const targetChat = targetPayment.telegramGroupId || String(chatId);
      const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });

      if (targetChat && targetMsgId) {
        await updateTelegramMessageResolution(
          botToken,
          targetChat,
          targetMsgId,
          `🔐 KhLan — Subscription Payment (${targetPayment.reference})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🏢 Tenant: ${targetPayment.tenant.name}\n📋 Plan: ${targetPayment.plan} (${targetPayment.billingCycle})\n💰 Amount: $${targetPayment.amountUsd.toFixed(2)}\n${targetPayment.manualRef ? `🏦 Bank Ref: ${targetPayment.manualRef}\n` : ""}\n✅ PROCESSING COMPLETE · APPROVED & ACTIVATED\n👤 Verified by: ${senderName}\n📅 ${timestamp} (Phnom Penh)\n⚡ Status: Processing Complete · ACTIVE`,
          Boolean(targetPayment.evidenceImage),
          `✅ Processing Complete · Approved by ${senderName}`,
        );
      }

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: [
            `🎉 Payment Verified & Processing Complete!`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `🏢 Dealer / Tenant: ${targetPayment.tenant.name}`,
            `📋 Plan: ${targetPayment.plan} (${targetPayment.billingCycle})`,
            `💰 Amount: $${targetPayment.amountUsd.toFixed(2)}`,
            `🔖 Reference: ${targetPayment.reference}`,
            targetPayment.manualRef ? `🏦 Bank Ref: ${targetPayment.manualRef}` : null,
            `👤 Approved by: ${senderName}`,
            `📅 ${timestamp} (Phnom Penh)`,
            `⚡ Status: PROCESSING COMPLETE · SUBSCRIPTION ACTIVE!`,
          ].filter(Boolean).join("\n"),
        }),
      });
    } catch (err: any) {
      console.error("[handleTelegramGroupCommand] Approve error:", err);
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `⚠️ Could not complete approval: ${err.message || "Unknown error"}`,
        }),
      });
    }
    return true;
  }

  if (isRejectIntent) {
    let targetPayment: any = null;

    if (replyToMsg?.message_id) {
      targetPayment = await db.subscriptionPayment.findFirst({
        where: {
          telegramMessageId: replyToMsg.message_id,
          status: "AWAITING_VERIFICATION",
        },
        include: { tenant: true },
      });

      if (!targetPayment) {
        const refMatch = (replyToMsg.caption || replyToMsg.text || "").match(/PAY-\d{8}-[A-Za-z0-9]+/);
        if (refMatch) {
          targetPayment = await db.subscriptionPayment.findFirst({
            where: { reference: refMatch[0], status: "AWAITING_VERIFICATION" },
            include: { tenant: true },
          });
        }
      }
    }

    const query = trimmed.replace(/^\/reject(?:@\w+)?/i, "").trim();
    if (!targetPayment && query) {
      const q = query.toLowerCase();
      const allPending = await db.subscriptionPayment.findMany({
        where: { status: "AWAITING_VERIFICATION" },
        include: { tenant: true },
        orderBy: { createdAt: "desc" },
      });
      targetPayment = allPending.find(
        (p) =>
          p.reference.toLowerCase() === q ||
          p.reference.toLowerCase().includes(q) ||
          (p.manualRef && p.manualRef.toLowerCase() === q) ||
          (p.manualRef && p.manualRef.toLowerCase().includes(q)) ||
          p.id.toLowerCase() === q ||
          p.tenant.name.toLowerCase().includes(q),
      ) ?? null;
    }

    if (!targetPayment && !query) {
      const allPending = await db.subscriptionPayment.findMany({
        where: { status: "AWAITING_VERIFICATION" },
        include: { tenant: true },
        orderBy: { createdAt: "desc" },
      });

      if (allPending.length === 1) {
        targetPayment = allPending[0];
      } else if (allPending.length === 0) {
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: `ℹ️ No pending payments waiting for rejection.`,
            }),
          });
        } catch {}
        return true;
      } else {
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: `📋 Multiple pending payments found (${allPending.length}). Tap which one to reject:`,
              reply_markup: {
                inline_keyboard: allPending.map((p) => [
                  {
                    text: `❌ Reject ${p.reference} (${p.tenant.name})`,
                    callback_data: `reject:${p.id}`,
                  },
                ]),
              },
            }),
          });
        } catch {}
        return true;
      }
    }

    if (!targetPayment) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `⚠️ No pending payment found matching '${query || "your message"}'. Type /pending to list pending requests.`,
          }),
        });
      } catch {}
      return true;
    }

    try {
      const rejectionReason = `Rejected via Telegram by ${senderName}`;
      await rejectPayment(targetPayment, `telegram:${senderName}`, rejectionReason);
      await db.subscriptionPayment.update({
        where: { id: targetPayment.id },
        data: {
          verifiedByName: senderName,
          notifiedSeller: true,
          notifiedAt: new Date(),
        },
      });

      const targetMsgId = targetPayment.telegramMessageId || replyToMsg?.message_id;
      const targetChat = targetPayment.telegramGroupId || String(chatId);
      const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh" });

      if (targetChat && targetMsgId) {
        await updateTelegramMessageResolution(
          botToken,
          targetChat,
          targetMsgId,
          `🔐 KhLan — Subscription Payment (${targetPayment.reference})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🏢 Tenant: ${targetPayment.tenant.name}\n📋 Plan: ${targetPayment.plan} (${targetPayment.billingCycle})\n💰 Amount: $${targetPayment.amountUsd.toFixed(2)}\n\n❌ REJECTED by ${senderName}\n📅 ${timestamp} (Phnom Penh)\nStatus: REJECTED (Subscription NOT activated)`,
          Boolean(targetPayment.evidenceImage),
          `❌ Rejected by ${senderName}`,
        );
      }

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: [
            `❌ Payment Rejected`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `🏢 Dealer / Tenant: ${targetPayment.tenant.name}`,
            `🔖 Reference: ${targetPayment.reference}`,
            `👤 Rejected by: ${senderName}`,
            `📅 ${timestamp} (Phnom Penh)`,
            `⚠️ Status: REJECTED (Subscription NOT activated)`,
          ].join("\n"),
        }),
      });
    } catch (err: any) {
      console.error("[handleTelegramGroupCommand] Reject error:", err);
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `⚠️ Could not reject payment: ${err.message || "Unknown error"}`,
        }),
      });
    }
    return true;
  }

  // /help
  if (lower === "/help" || lower.startsWith("/help@")) {
    const help = [
      `🤖 KhLan Telegram Group Bot Commands:`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `• /pending — List pending subscription payments with 1-tap [Approve]/[Reject] buttons`,
      `• /approve [Ref/TrxID] — Directly approve and activate subscription (or reply 'approve' / 'ok' to any payment slip)`,
      `• /reject [Ref/TrxID] — Reject a pending payment (or reply 'reject' / 'no' to any payment slip)`,
      `• /status — Check syncer and database statistics`,
      `• /sync — Trigger reconciliation check`,
      ``,
      `💡 Tip: You can also tap the [✅ Approve & Activate] or [❌ Reject] buttons directly on each payment receipt above!`,
    ].join("\n");

    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: help }),
      });
    } catch {}
    return true;
  }

  return false;
}

/**
 * Continuous / recurring group sync function:
 * Polls unread Telegram updates, processes inline button clicks ([Approve]/[Reject]),
 * executes commands (/pending, /status, /approve), syncs ABA PayWay transactions day-by-day,
 * prevents duplicates, flags same-time collisions, and auto-verifies payments.
 */
export async function syncTelegramGroupUpdates(
  botToken: string,
  targetChatId: string = "-1004489863210",
): Promise<SyncOutcome> {
  const outcome: SyncOutcome = {
    processed: 0,
    newTransactions: 0,
    matchedPayments: 0,
    duplicatesPrevented: 0,
    sameTimeCollisions: 0,
    approvalsProcessed: 0,
    rejectionsProcessed: 0,
    commandsProcessed: 0,
    errors: [],
  };

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=100&timeout=0`);
    const json = (await res.json()) as { ok: boolean; result?: any[]; description?: string };

    if (!json.ok || !Array.isArray(json.result)) {
      if (json.description?.includes("terminated by other getUpdates request")) {
        // The 24/7 background daemon has active ownership of the update stream.
        return outcome;
      }
      outcome.errors.push(json.description || "Failed to fetch updates from Telegram");
      return outcome;
    }

    let highestUpdateId = 0;

    for (const update of json.result) {
      if (update.update_id > highestUpdateId) {
        highestUpdateId = update.update_id;
      }

      // 1. Process Callback Queries (Buttons clicked in Telegram group)
      if (update.callback_query) {
        outcome.processed++;
        const cbRes = await processTelegramCallbackQuery(update.callback_query, botToken, targetChatId);
        if (cbRes.action === "approve") {
          outcome.approvalsProcessed++;
          outcome.matchedPayments++;
        } else if (cbRes.action === "reject") {
          outcome.rejectionsProcessed++;
        }
        continue;
      }

      // 2. Process Messages & Channel Posts
      const msg = update.message || update.channel_post;
      if (!msg) continue;

      const messageText = msg.text || msg.caption || "";
      if (!messageText) continue;

      const chatIdStr = String(msg.chat?.id || "");
      const isPrivate = msg.chat?.type === "private";
      const cleanMsgChatId = chatIdStr.replace(/^-100/, "").replace(/^-/, "");
      const cleanTargetChatId = (targetChatId || "").replace(/^-100/, "").replace(/^-/, "");

      // Accept from target group OR private 1-on-1 with bot
      if (!isPrivate && cleanTargetChatId && cleanMsgChatId !== cleanTargetChatId) {
        continue;
      }

      outcome.processed++;
      const senderName = msg.from?.username ? `@${msg.from.username}` : msg.from?.first_name || "Admin";

      // Check if it's a command (/pending, /status, /approve, /reject, /help)
      // OR a reply message (e.g. replying "approve" / "reject" to a payment slip)
      const isCmd = messageText.startsWith("/");
      const isReply = Boolean(msg.reply_to_message);
      if (isCmd || isReply) {
        const handled = await handleTelegramGroupCommand(msg, botToken);
        if (handled) {
          outcome.commandsProcessed++;
          continue;
        }
      }

      // Check if it's an ABA PayWay message
      if (isAbaPayWayMessage(messageText)) {
        const msgDate = msg.date ? new Date(msg.date * 1000) : new Date();
        const parsed = parseAbaPayWayMessage(messageText, msgDate);

        if (parsed) {
          const res = await recordAbaTransaction(parsed, {
            messageId: msg.message_id,
            chatId: chatIdStr,
            botToken,
          });

          if (res.isDuplicate) {
            outcome.duplicatesPrevented++;
          } else if (res.transaction) {
            outcome.newTransactions++;
            if (res.matched) outcome.matchedPayments++;
            if (res.isSameTimeCollision) outcome.sameTimeCollisions++;
          }

          if (res.error) outcome.errors.push(res.error);
        }
      }
    }

    // Acknowledge processed updates so Telegram clears the queue
    if (highestUpdateId > 0) {
      await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${highestUpdateId + 1}&limit=1`);
    }

    return outcome;
  } catch (err) {
    outcome.errors.push(err instanceof Error ? err.message : "Sync network error");
    return outcome;
  }
}

export interface ReconciliationReport {
  day?: string;
  totalTransactions: number;
  duplicateCount: number;
  sameTimeCollisionCount: number;
  ambiguousCount: number;
  autoMatchedCount: number;
  alreadyMatchedCount: number;
  unmatchedCount: number;
  reconciledIds: string[];
}

/**
 * Scans transactions day-by-day or across the database:
 * 1. Checks every transaction against same-time collisions (within 60s).
 * 2. Verifies duplicate tracking.
 * 3. Reconciles with open dealer subscription payments.
 * 4. Resolves unambiguous payments and flags collisions as AMBIGUOUS to protect dealers.
 */
export async function verifyAndReconcileTransactions(options?: {
  day?: string;
}): Promise<ReconciliationReport> {
  const where: any = {};
  if (options?.day && /^\d{4}-\d{2}-\d{2}$/.test(options.day)) {
    const startOfDay = new Date(`${options.day}T00:00:00+07:00`);
    const endOfDay = new Date(`${options.day}T23:59:59.999+07:00`);
    where.transactionDate = { gte: startOfDay, lte: endOfDay };
  }

  const allTxs = await db.abaTransaction.findMany({
    where,
    orderBy: { transactionDate: "asc" },
  });

  const pendingPayments = await db.subscriptionPayment.findMany({
    where: { status: "AWAITING_VERIFICATION" },
    include: { tenant: true },
    orderBy: { createdAt: "desc" },
  });

  const report: ReconciliationReport = {
    day: options?.day,
    totalTransactions: allTxs.length,
    duplicateCount: 0,
    sameTimeCollisionCount: 0,
    ambiguousCount: 0,
    autoMatchedCount: 0,
    alreadyMatchedCount: 0,
    unmatchedCount: 0,
    reconciledIds: [],
  };

  for (let i = 0; i < allTxs.length; i++) {
    const current = allTxs[i];
    const currentTime = current.transactionDate.getTime();

    // Check collisions with any other transaction within 60 seconds
    const colliding = allTxs.filter(
      (other) =>
        other.id !== current.id &&
        Math.abs(other.transactionDate.getTime() - currentTime) <= 60_000,
    );

    const hasCollision = colliding.length > 0;
    const collisionIds = hasCollision ? colliding.map((c) => c.trxId).join(",") : null;

    if (current.isDuplicate) {
      report.duplicateCount++;
    }

    if (hasCollision) {
      report.sameTimeCollisionCount++;
    }

    let nextStatus = current.status;
    let nextNote = current.verificationNote;

    // If currently unmatched, ambiguous or underpaid, test for deterministic matching
    if (current.status === "UNMATCHED" || current.status === "AMBIGUOUS" || current.status === "UNDERPAID") {
      const refMatch = pendingPayments.find((p) => {
        if (!p.manualRef) return false;
        const ref = p.manualRef.trim().toLowerCase();
        const trx = current.trxId.toLowerCase();
        const apv = (current.apv || "").toLowerCase();
        return ref.includes(trx) || trx.includes(ref) || (apv && ref.includes(apv));
      });

      if (refMatch && refMatch.status !== "VERIFIED") {
        const requiredUsd = refMatch.amountUsd;
        const receivedUsd = current.amountUsd;
        const isPaidInFull = receivedUsd >= (requiredUsd - 0.05);

        if (isPaidInFull) {
          await verifyPaymentAndActivate(refMatch, `reconcile:aba-payway:${current.trxId}`);
          nextStatus = "MATCHED";
          nextNote = `Verified in Telegram group (Full payment $${receivedUsd.toFixed(2)}) & auto-approved for ${refMatch.tenant.name} (${refMatch.reference})`;
          report.autoMatchedCount++;

          await db.subscriptionPayment.update({
            where: { id: refMatch.id },
            data: {
              verifiedByName: `ABA Auto-Reconciled (${current.trxId})`,
              notifiedSeller: true,
              notifiedAt: new Date(),
              note: `Verified in Telegram group: Full payment received ($${receivedUsd.toFixed(2)}) via ABA Trx ${current.trxId}`,
            },
          });
        } else {
          nextStatus = "UNDERPAID";
          nextNote = `⚠️ Underpaid: Bank received ${current.currency === "KHR" ? "៛" : "$"}${current.amount.toLocaleString()} ($${receivedUsd.toFixed(2)}) but subscription plan requires $${requiredUsd.toFixed(2)}. Held in PENDING for admin review.`;

          await db.subscriptionPayment.update({
            where: { id: refMatch.id },
            data: {
              note: nextNote,
              verifiedByName: `ABA Partial Payment (${current.trxId})`,
            },
          });
        }

        // Always link the subscription payment id
        await db.abaTransaction.update({
          where: { id: current.id },
          data: {
            sameTimeCollision: hasCollision,
            collisionTrxIds: collisionIds,
            status: nextStatus,
            verificationNote: nextNote,
            subscriptionPaymentId: refMatch.id,
            matchedAt: nextStatus === "MATCHED" ? new Date() : current.matchedAt,
            matchedBy: nextStatus === "MATCHED" ? "AUDIT_RECONCILE" : current.matchedBy,
          },
        });
        report.reconciledIds.push(current.id);
        continue;
      } else if (hasCollision && nextStatus !== "MATCHED") {
        nextStatus = "AMBIGUOUS";
        nextNote = `Same-time collision with Trx: ${collisionIds}. Awaiting manual admin confirmation.`;
        report.ambiguousCount++;
      } else if (nextStatus === "UNMATCHED") {
        report.unmatchedCount++;
      }
    } else if (current.status === "MATCHED") {
      report.alreadyMatchedCount++;
    }

    // Persist collision flags or status updates
    if (
      current.sameTimeCollision !== hasCollision ||
      current.collisionTrxIds !== collisionIds ||
      current.status !== nextStatus ||
      current.verificationNote !== nextNote
    ) {
      await db.abaTransaction.update({
        where: { id: current.id },
        data: {
          sameTimeCollision: hasCollision,
          collisionTrxIds: collisionIds,
          status: nextStatus,
          verificationNote: nextNote,
        },
      });
      report.reconciledIds.push(current.id);
    }
  }

  return report;
}


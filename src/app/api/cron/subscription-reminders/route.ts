import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getManualPaymentConfig,
  resolveTelegramConfig,
  refreshExpiredSubscription,
} from "@/lib/api/payments";
import { sendSubscriptionExpiryReminder } from "@/lib/api/telegram-notify";

export const dynamic = "force-dynamic";

/**
 * Cron endpoint for checking expiring and expired subscriptions.
 * Can be triggered via cron job or external monitoring.
 * Securable with Authorization: Bearer <CRON_SECRET> if set in .env.
 */
export async function GET(req: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const now = new Date();
    const config = await getManualPaymentConfig();
    const { botToken, chatId } = resolveTelegramConfig(config);

    // 1. Auto-expire overdue subscriptions
    const overdue = await db.subscription.findMany({
      where: {
        status: "ACTIVE",
        currentPeriodEnd: { lt: now },
      },
    });

    let expiredCount = 0;
    for (const sub of overdue) {
      await refreshExpiredSubscription(sub);
      expiredCount++;
    }

    // 2. Find subscriptions expiring within 7 days
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiringSoon = await db.subscription.findMany({
      where: {
        status: "ACTIVE",
        plan: { not: "FREE" },
        currentPeriodEnd: {
          gte: now,
          lte: in7Days,
        },
      },
      include: { tenant: true },
    });

    const remindersSent: Array<{ tenantName: string; daysLeft: number }> = [];

    if (botToken && chatId) {
      for (const sub of expiringSoon) {
        const daysLeft = Math.max(
          1,
          Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        );

        // Remind at 7 days, 3 days, or 1 day
        if (daysLeft === 7 || daysLeft === 3 || daysLeft === 1) {
          const formattedDate = sub.currentPeriodEnd.toLocaleDateString("en-US", {
            timeZone: "Asia/Phnom_Penh",
            year: "numeric",
            month: "short",
            day: "numeric",
          });

          await sendSubscriptionExpiryReminder(
            { telegramBotToken: botToken, telegramChatId: chatId },
            {
              tenantName: sub.tenant.name,
              plan: sub.plan,
              daysLeft,
              expiryDate: formattedDate,
            },
          );

          remindersSent.push({ tenantName: sub.tenant.name, daysLeft });
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      expiredCount,
      expiringCount: expiringSoon.length,
      remindersSent,
    });
  } catch (err) {
    console.error("[Cron subscription-reminders] failed:", err);
    return NextResponse.json({ error: "Failed to process subscription reminders" }, { status: 500 });
  }
}

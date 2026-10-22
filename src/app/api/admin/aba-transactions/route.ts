import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, toErrorResponse } from "@/lib/api/guards";
import { getManualPaymentConfig, resolveTelegramConfig, verifyPaymentAndActivate } from "@/lib/api/payments";
import { syncTelegramGroupUpdates, verifyAndReconcileTransactions, recordAbaTransaction } from "@/lib/api/aba-sync";
import { parseAbaPayWayMessage } from "@/lib/api/aba-parser";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "ALL";
    const search = url.searchParams.get("search")?.trim() || "";
    const take = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));

    const day = url.searchParams.get("day"); // "YYYY-MM-DD"
    const duplicatesOnly = url.searchParams.get("duplicate") === "true";
    const collisionsOnly = url.searchParams.get("collision") === "true";

    const where: any = {};
    if (status === "MATCHED" || status === "UNMATCHED" || status === "AMBIGUOUS" || status === "UNDERPAID") {
      where.status = status;
    }

    if (duplicatesOnly) {
      where.isDuplicate = true;
    }

    if (collisionsOnly) {
      where.sameTimeCollision = true;
    }

    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const startOfDay = new Date(`${day}T00:00:00+07:00`);
      const endOfDay = new Date(`${day}T23:59:59.999+07:00`);
      where.transactionDate = { gte: startOfDay, lte: endOfDay };
    }

    if (search) {
      where.OR = [
        { trxId: { contains: search } },
        { apv: { contains: search } },
        { payerName: { contains: search } },
        { merchantName: { contains: search } },
        { rawMessage: { contains: search } },
      ];
    }

    const [transactions, totalCount, unmatchedCount, matchedCount, underpaidCount, duplicateCount, collisionCount, aggregates, recentRows] = await Promise.all([
      db.abaTransaction.findMany({
        where,
        include: {
          subscriptionPayment: {
            include: {
              tenant: { select: { id: true, name: true, slug: true } },
            },
          },
        },
        orderBy: { transactionDate: "desc" },
        take,
      }),
      db.abaTransaction.count(),
      db.abaTransaction.count({ where: { status: "UNMATCHED" } }),
      db.abaTransaction.count({ where: { status: "MATCHED" } }),
      db.abaTransaction.count({ where: { status: "UNDERPAID" } }),
      db.abaTransaction.count({ where: { isDuplicate: true } }),
      db.abaTransaction.count({ where: { sameTimeCollision: true } }),
      db.abaTransaction.groupBy({
        by: ["currency"],
        _sum: { amount: true },
      }),
      db.abaTransaction.findMany({
        where: {
          transactionDate: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          transactionDate: true,
          amount: true,
          currency: true,
          amountUsd: true,
          status: true,
          isDuplicate: true,
          sameTimeCollision: true,
        },
        orderBy: { transactionDate: "desc" },
      }),
    ]);

    let totalKhr = 0;
    let totalUsd = 0;
    for (const agg of aggregates) {
      if (agg.currency === "KHR") totalKhr = agg._sum.amount || 0;
      if (agg.currency === "USD") totalUsd = agg._sum.amount || 0;
    }

    // Day-by-Day aggregation
    const dailyMap = new Map<string, {
      date: string;
      count: number;
      totalKhr: number;
      totalUsd: number;
      matchedCount: number;
      unmatchedCount: number;
      underpaidCount: number;
      duplicateCount: number;
      collisionCount: number;
    }>();

    for (const item of recentRows) {
      // Group by calendar day in Cambodia timezone (Asia/Phnom_Penh)
      const d = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Phnom_Penh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(item.transactionDate);

      let dayStat = dailyMap.get(d);
      if (!dayStat) {
        dayStat = {
          date: d,
          count: 0,
          totalKhr: 0,
          totalUsd: 0,
          matchedCount: 0,
          unmatchedCount: 0,
          underpaidCount: 0,
          duplicateCount: 0,
          collisionCount: 0,
        };
        dailyMap.set(d, dayStat);
      }
      dayStat.count++;
      if (item.currency === "KHR") dayStat.totalKhr += item.amount;
      if (item.currency === "USD") dayStat.totalUsd += item.amount;
      if (item.status === "MATCHED") dayStat.matchedCount++;
      if (item.status === "UNMATCHED") dayStat.unmatchedCount++;
      if (item.status === "UNDERPAID") dayStat.underpaidCount++;
      if (item.isDuplicate) dayStat.duplicateCount++;
      if (item.sameTimeCollision) dayStat.collisionCount++;
    }

    const dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      transactions,
      dailyBreakdown,
      summary: {
        totalCount,
        unmatchedCount,
        matchedCount,
        underpaidCount,
        duplicateCount,
        collisionCount,
        totalKhr,
        totalUsd,
      },
    });
  } catch (err) {
    return toErrorResponse(err, "api/admin/aba-transactions GET", "Failed to load ABA transactions");
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      action?: "sync" | "verify" | "ingest" | "clear";
      day?: string;
      rawMessage?: string;
    };

    if (body.action === "clear") {
      const deleted = await db.abaTransaction.deleteMany({});
      return NextResponse.json({
        success: true,
        mode: "clear",
        deletedCount: deleted.count,
        message: `Removed ${deleted.count} old transaction(s) successfully`,
      });
    }

    if (body.action === "verify") {
      const report = await verifyAndReconcileTransactions({ day: body.day });
      return NextResponse.json({
        success: true,
        mode: "verify",
        report,
      });
    }

    if (body.action === "ingest" && body.rawMessage) {
      const parsed = parseAbaPayWayMessage(body.rawMessage);
      if (!parsed) {
        return NextResponse.json(
          { error: "Could not parse message as ABA PayWay transaction. Please ensure it contains Trx ID, Amount, etc." },
          { status: 400 },
        );
      }
      const recordResult = await recordAbaTransaction(parsed);
      return NextResponse.json({
        success: true,
        mode: "ingest",
        transaction: recordResult.transaction,
        matched: recordResult.matched,
        isDuplicate: recordResult.isDuplicate,
        isSameTimeCollision: recordResult.isSameTimeCollision,
      });
    }

    // Default action: Sync from Telegram group
    const config = await getManualPaymentConfig();
    const { botToken, chatId } = resolveTelegramConfig(config);

    if (!botToken) {
      return NextResponse.json(
        { error: "Telegram bot token is not configured" },
        { status: 400 },
      );
    }

    const outcome = await syncTelegramGroupUpdates(botToken, chatId || "-1004489863210");
    return NextResponse.json({
      success: true,
      mode: "sync",
      outcome,
    });
  } catch (err) {
    return toErrorResponse(err, "api/admin/aba-transactions POST", "Failed to process ABA transactions request");
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      transactionId?: string;
      subscriptionPaymentId?: string;
    };

    if (!body.transactionId || !body.subscriptionPaymentId) {
      return NextResponse.json(
        { error: "transactionId and subscriptionPaymentId are required" },
        { status: 400 },
      );
    }

    const [tx, payment] = await Promise.all([
      db.abaTransaction.findUnique({ where: { id: body.transactionId } }),
      db.subscriptionPayment.findUnique({
        where: { id: body.subscriptionPaymentId },
        include: { tenant: true },
      }),
    ]);

    if (!tx) {
      return NextResponse.json({ error: "ABA Transaction not found" }, { status: 404 });
    }
    if (!payment) {
      return NextResponse.json({ error: "Subscription Payment not found" }, { status: 404 });
    }

    // Link transaction and activate payment if not already verified
    if (payment.status !== "VERIFIED") {
      await verifyPaymentAndActivate(payment, admin.id);
    }

    const updatedTx = await db.abaTransaction.update({
      where: { id: tx.id },
      data: {
        status: "MATCHED",
        subscriptionPaymentId: payment.id,
        matchedAt: new Date(),
        matchedBy: `MANUAL_ADMIN:${admin.id}`,
      },
    });

    await db.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        verifiedByName: `ABA Manual Match (${tx.trxId})`,
        notifiedSeller: true,
        notifiedAt: new Date(),
      },
    });

    await db.auditLog.create({
      data: {
        actorId: admin.id,
        action: "ABA_TRANSACTION_MATCHED_MANUALLY",
        entity: "AbaTransaction",
        entityId: tx.id,
        metaJson: JSON.stringify({
          trxId: tx.trxId,
          paymentReference: payment.reference,
          tenantId: payment.tenantId,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      transaction: updatedTx,
    });
  } catch (err) {
    return toErrorResponse(
      err,
      "api/admin/aba-transactions PATCH",
      "Failed to match ABA transaction",
    );
  }
}

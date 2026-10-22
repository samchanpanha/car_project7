import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { requireTenantMember, toErrorResponse } from "@/lib/api/guards";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requireTenantMember();
    const { id } = await params;

    const payment = await db.subscriptionPayment.findUnique({
      where: { id },
      include: { tenant: true },
    });

    if (!payment || payment.tenantId !== tenant.id) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "VERIFIED") {
      return NextResponse.json(
        { error: "Receipt is only available for verified payments" },
        { status: 400 },
      );
    }

    // Generate QR code for receipt reference
    const qrDataUrl = await QRCode.toDataURL(
      `KhLan Receipt: ${payment.reference} | ${payment.tenant.name} | $${payment.amountUsd.toFixed(2)}`,
      { width: 160, margin: 1 },
    );

    const paidDate = payment.createdAt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const verifiedDate = payment.reviewedAt
      ? payment.reviewedAt.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : paidDate;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KhLan Receipt — ${payment.reference}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      display: flex;
      justify-content: center;
      padding: 40px 20px;
    }
    .receipt {
      background: #ffffff;
      width: 100%;
      max-width: 580px;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
      padding: 36px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px dashed #e2e8f0;
      padding-bottom: 24px;
      margin-bottom: 24px;
    }
    .brand h1 {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #0f172a;
    }
    .brand span { color: #f59e0b; }
    .brand p { font-size: 12px; color: #64748b; margin-top: 2px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ecfdf5;
      color: #059669;
      border: 1px solid #a7f3d0;
      padding: 6px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-bottom: 12px;
      font-weight: 700;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }
    .item label {
      display: block;
      font-size: 11px;
      color: #64748b;
      margin-bottom: 2px;
    }
    .item value {
      display: block;
      font-size: 14px;
      font-weight: 600;
      color: #1e293b;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .table th {
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      color: #64748b;
      padding-bottom: 8px;
      border-bottom: 1px solid #e2e8f0;
    }
    .table td {
      padding: 12px 0;
      font-size: 14px;
      border-bottom: 1px solid #f1f5f9;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
      border-top: 2px solid #0f172a;
      margin-top: 8px;
    }
    .total-label { font-size: 15px; font-weight: 700; }
    .total-val { font-size: 22px; font-weight: 800; color: #0f172a; }
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid #f1f5f9;
      padding-top: 20px;
      margin-top: 20px;
    }
    .qr-box {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .qr-box img {
      width: 64px;
      height: 64px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .qr-box p {
      font-size: 11px;
      color: #64748b;
      line-height: 1.4;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-print {
      background: #0f172a;
      color: #ffffff;
    }
    .btn-print:hover { background: #334155; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .receipt { box-shadow: none; border: none; max-width: 100%; padding: 0; }
      .actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="brand">
        <h1>Kh<span>Lan</span></h1>
        <p>Cambodia Automotive Marketplace</p>
      </div>
      <div>
        <div class="badge">● Paid & Verified</div>
      </div>
    </div>

    <div class="grid">
      <div class="item">
        <label>Receipt Reference</label>
        <value>${payment.reference}</value>
      </div>
      <div class="item">
        <label>Dealer / Tenant</label>
        <value>${payment.tenant.name}</value>
      </div>
      <div class="item">
        <label>Date Issued</label>
        <value>${paidDate}</value>
      </div>
      <div class="item">
        <label>Verified Date</label>
        <value>${verifiedDate}</value>
      </div>
    </div>

    <div class="section-title">Subscription Item</div>
    <table class="table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Cycle</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>${payment.plan} Plan Subscription</strong></td>
          <td>${payment.billingCycle === "YEARLY" ? "1 Year (12 Months)" : "1 Month"}</td>
          <td style="text-align: right; font-weight: 600;">$${payment.amountUsd.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

    <div class="total-row">
      <div class="total-label">Total Paid (USD)</div>
      <div class="total-val">$${payment.amountUsd.toFixed(2)}</div>
    </div>

    ${payment.manualRef ? `<p style="font-size: 12px; color: #64748b; margin-top: 8px;">Bank Reference: <strong>${payment.manualRef}</strong></p>` : ""}
    ${payment.verifiedByName ? `<p style="font-size: 12px; color: #64748b; margin-top: 4px;">Verified By: <strong>${payment.verifiedByName}</strong></p>` : ""}

    <div class="footer">
      <div class="qr-box">
        <img src="${qrDataUrl}" alt="Receipt QR" />
        <p>Scan to verify<br />KhLan official payment record</p>
      </div>
      <div class="actions">
        <button class="btn btn-print" onclick="window.print()">Print / Save PDF</button>
      </div>
    </div>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return toErrorResponse(err, "api/tenant/payments/[id]/receipt GET", "Failed to generate receipt");
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, type DemoUser } from "@/lib/session";
import type { Tenant, TenantMember } from "@prisma/client";

/**
 * HTTP error thrown by the route guards below.
 * Routes convert it via `toErrorResponse` (any other error becomes a 500).
 */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Map a thrown guard error to a JSON response; unexpected errors → 500. */
export function toErrorResponse(
  err: unknown,
  logContext: string,
  fallbackMessage: string,
): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(`[${logContext}] failed:`, err);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

/** Safely parse an AuditLog.metaJson column. */
export function parseMetaJson(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Tenant roles allowed to write inventory / appointments / profile. */
export function canWriteTenant(role: string): boolean {
  return role === "OWNER" || role === "MANAGER" || role === "INVENTORY_MANAGER";
}

/** Tenant roles allowed to manage staff & subscription (OWNER/MANAGER). */
export function canManageTenant(role: string): boolean {
  return role === "OWNER" || role === "MANAGER";
}

/** Guard: current user must be a platform admin (SUPER_ADMIN or ADMIN). */
export async function requireAdmin(): Promise<DemoUser> {
  const user = await getCurrentUser();
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
    throw new HttpError(403, "Forbidden");
  }
  return user;
}

export async function requireTenantMember(): Promise<{
  user: DemoUser;
  member: TenantMember;
  tenant: Tenant;
}> {
  const user = await getCurrentUser();
  try {
    const rows = await db.$queryRawUnsafe<Array<{ isBlacklisted: number | boolean; blacklistReason: string | null }>>(
      `SELECT isBlacklisted, blacklistReason FROM "User" WHERE id = ? LIMIT 1`,
      user.id,
    );
    const dbUser = rows?.[0];
    if (dbUser && (dbUser.isBlacklisted === 1 || dbUser.isBlacklisted === true)) {
      throw new HttpError(
        403,
        `Your account has been blacklisted${dbUser.blacklistReason ? `: ${dbUser.blacklistReason}` : ""}. Access is restricted.`,
      );
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // If column query fails for any unexpected reason, continue safely
  }

  let member = await db.tenantMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { tenant: true },
  });

  if (!member) {
    // If user has an existing membership that is not active, activate it
    const anyMember = await db.tenantMember.findFirst({
      where: { userId: user.id },
      include: { tenant: true },
    });
    if (anyMember && anyMember.tenant.status !== "BLACKLISTED") {
      await db.tenantMember.update({
        where: { id: anyMember.id },
        data: { status: "ACTIVE", role: anyMember.role === "SALES_STAFF" ? "OWNER" : anyMember.role },
      });
      member = await db.tenantMember.findFirst({
        where: { id: anyMember.id },
        include: { tenant: true },
      });
    } else {
      // Auto-provision a store/dealership tenant for this user so they can access marketplace seller/dealer features and subscriptions
      const randomSuffix = Math.random().toString(36).slice(2, 7);
      const cleanSlug = `${user.name ? user.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") : "store"}-${randomSuffix}`;
      const newTenant = await db.tenant.create({
        data: {
          name: user.role === "DEALER" ? `${user.name}'s Dealership` : `${user.name} (Store)`,
          slug: cleanSlug,
          phone: user.phone || "+85512000000",
          status: "ACTIVE",
          members: {
            create: {
              userId: user.id,
              role: "OWNER",
              status: "ACTIVE",
            },
          },
          subscription: {
            create: {
              plan: "FREE",
              status: "PAST_DUE",
              billingCycle: "MONTHLY",
              priceUsd: 0,
              listingsLimit: 0,
              featuredLimit: 0,
              seats: 1,
              startedAt: new Date(),
              currentPeriodEnd: new Date(),
            },
          },
        },
        include: {
          members: true,
        },
      });

      if (user.role === "BUYER") {
        await db.user.update({
          where: { id: user.id },
          data: { role: "DEALER" },
        }).catch(() => {});
      }

      member = await db.tenantMember.findFirst({
        where: { userId: user.id, tenantId: newTenant.id },
        include: { tenant: true },
      });
    }
  }

  if (!member) throw new HttpError(403, "Forbidden");

  if (member.tenant.status === "BLACKLISTED") {
    throw new HttpError(403, "Your dealership account has been blacklisted for security violations. Access denied.");
  }

  return { user, member, tenant: member.tenant };
}

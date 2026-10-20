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

/**
 * Guard: current user must be an ACTIVE member of a tenant.
 * Returns the user, the membership row and the tenant.
 */
export async function requireTenantMember(): Promise<{
  user: DemoUser;
  member: TenantMember;
  tenant: Tenant;
}> {
  const user = await getCurrentUser();
  const member = await db.tenantMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { tenant: true },
  });
  if (!member) throw new HttpError(403, "Forbidden");
  return { user, member, tenant: member.tenant };
}

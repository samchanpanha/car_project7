import { createRequire } from "module";
import path from "path";
import { PrismaClient } from "@prisma/client";

/*
 * Dev-server friendly Prisma client loading.
 *
 * The long-running `next dev` process caches `@prisma/client` in Node's
 * require cache. When the Prisma schema gains new models (e.g. Tenant,
 * TenantMember, Subscription) and the client is regenerated with
 * `prisma generate`, the running server would keep using the stale cached
 * client (missing the new model delegates) because node_modules are
 * externalized and cached per process.
 *
 * To pick up regenerated clients WITHOUT restarting the dev server, we purge
 * the cached `@prisma` / `.prisma` modules from Node's shared require cache
 * and re-require a fresh client. The check is cheap (runs once per module
 * graph reload, i.e. only when this file changes) and the instance is cached
 * in globalThis as usual.
 */

type PrismaClientCtor = new (options?: { log?: string[]; datasources?: { db?: { url?: string } } }) => PrismaClient;

function resolveDatabaseUrl(): string {
  let url = process.env.DATABASE_URL;
  if (!url) {
    return process.env.NODE_ENV === "production"
      ? "postgresql://khlan:khlan_secret_2026@postgres:5432/khlandb"
      : "postgresql://khlan:khlan_secret_2026@localhost:5432/khlandb";
  }
  // If running inside docker container or production where postgres service is reachable
  const isDocker = Boolean(
    process.env.DOCKER_CONTAINER ||
    process.env.BACKEND_URL?.includes("backend") ||
    process.env.HOSTNAME === "0.0.0.0" ||
    process.env.NODE_ENV === "production"
  );
  if (isDocker && (url.includes("localhost:5432") || url.includes("127.0.0.1:5432"))) {
    url = url.replace("localhost:5432", "postgres:5432").replace("127.0.0.1:5432", "postgres:5432");
  }
  return url;
}

function hasRequiredDelegates(client: unknown): boolean {
  return (
    typeof client === "object" &&
    client !== null &&
    typeof (client as Record<string, unknown>).tenantMember !== "undefined" &&
    typeof (client as Record<string, unknown>).abaTransaction !== "undefined" &&
    typeof (client as Record<string, unknown>).tenantBranch !== "undefined"
  );
}

function loadFreshCtor(): PrismaClientCtor | null {
  try {
    const nodeRequire = createRequire(path.join(process.cwd(), "index.js"));
    for (const key of Object.keys(nodeRequire.cache)) {
      if (
        key.includes(`${path.sep}node_modules${path.sep}@prisma${path.sep}`) ||
        key.includes(`${path.sep}node_modules${path.sep}.prisma${path.sep}`)
      ) {
        delete nodeRequire.cache[key];
      }
    }
    const fresh = nodeRequire("@prisma/client") as { PrismaClient?: PrismaClientCtor };
    return fresh?.PrismaClient ?? null;
  } catch (err) {
    console.warn("[db] could not re-require a fresh @prisma/client:", err);
    return null;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function ensureClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing && hasRequiredDelegates(existing)) return existing;

  const dbUrl = resolveDatabaseUrl();
  const clientOptions = {
    datasources: {
      db: {
        url: dbUrl,
      },
    },
  };

  // In production, instantiate directly without require-cache busting.
  if (process.env.NODE_ENV === "production") {
    const client =
      existing ??
      new PrismaClient({
        ...clientOptions,
        log: ["warn", "error"],
      });
    globalForPrisma.prisma = client;
    return client;
  }

  // In development, if delegates are missing after schema edits, try a freshly required client.
  const freshCtor = loadFreshCtor();
  if (freshCtor) {
    const fresh = new freshCtor({
      ...clientOptions,
      log: ["query"],
    });
    if (hasRequiredDelegates(fresh)) {
      globalForPrisma.prisma = fresh;
      return fresh;
    }
  }

  const client =
    existing ??
    new PrismaClient({
      ...clientOptions,
      log: ["query"],
    });
  globalForPrisma.prisma = client;
  return client;
}

export type AppDbClient = PrismaClient & {
  abaTransaction: any;
  tenantBranch: any;
  subscriptionPayment: any;
  pendingStorageSync: any;
};

export const db: AppDbClient = ensureClient() as AppDbClient;

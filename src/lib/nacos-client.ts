import YAML from "yaml";

export interface NacosServerState {
  version: string;
  standalone: boolean;
  healthy: boolean;
  endpoint: string;
}

export interface NacosConfigItem {
  dataId: string;
  group: string;
  type: string;
  content?: string;
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const configCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30 seconds hot-reload TTL

/**
 * Returns the resolved Nacos HTTP endpoint.
 * Works both inside Docker (e.g. "http://nacos:8848") and host (e.g. "http://localhost:8848").
 */
export function getNacosEndpoint(): string {
  const raw = process.env.NACOS_SERVER_ADDR?.trim() || "localhost:8848";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw.replace(/\/+$/, "");
  }
  return `http://${raw}`.replace(/\/+$/, "");
}

/**
 * Check if Nacos server is reachable and healthy.
 */
export async function checkNacosHealth(): Promise<NacosServerState> {
  const endpoint = getNacosEndpoint();
  try {
    const res = await fetch(`${endpoint}/nacos/v1/console/server/state`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      return { version: "unknown", standalone: false, healthy: false, endpoint };
    }
    const json = (await res.json()) as { version?: string; startup_mode?: string };
    return {
      version: json.version || "2.4.3",
      standalone: json.startup_mode === "standalone",
      healthy: true,
      endpoint,
    };
  } catch {
    return { version: "unreachable", standalone: false, healthy: false, endpoint };
  }
}

/**
 * Fetch raw configuration content from Nacos.
 */
export async function fetchNacosConfig(
  dataId: string,
  group = "DEFAULT_GROUP"
): Promise<string | null> {
  const endpoint = getNacosEndpoint();
  const url = `${endpoint}/nacos/v1/cs/configs?dataId=${encodeURIComponent(
    dataId
  )}&group=${encodeURIComponent(group)}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`[Nacos] Failed to fetch config ${dataId}: HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(`[Nacos] Network error fetching ${dataId}:`, err);
    return null;
  }
}

/**
 * Publish / update a configuration in Nacos.
 */
export async function publishNacosConfig(
  dataId: string,
  content: string,
  type = "yaml",
  group = "DEFAULT_GROUP"
): Promise<boolean> {
  const endpoint = getNacosEndpoint();
  const url = `${endpoint}/nacos/v1/cs/configs`;

  const body = new URLSearchParams({
    dataId,
    group,
    type,
    content,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error(`[Nacos] Failed to publish config ${dataId}: HTTP ${res.status}`);
      return false;
    }

    const text = (await res.text()).trim();
    const success = text === "true";
    if (success) {
      // Invalidate cache immediately on write
      configCache.delete(`${group}:${dataId}`);
    }
    return success;
  } catch (err) {
    console.error(`[Nacos] Error publishing config ${dataId}:`, err);
    return false;
  }
}

/**
 * Fetch and parse a YAML configuration from Nacos with TTL cache.
 */
export async function getNacosParsedConfig<T>(
  dataId: string,
  group = "DEFAULT_GROUP"
): Promise<T | null> {
  const cacheKey = `${group}:${dataId}`;
  const now = Date.now();
  const cached = configCache.get(cacheKey);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data as T;
  }

  const raw = await fetchNacosConfig(dataId, group);
  if (!raw) return null;

  try {
    const parsed = YAML.parse(raw) as T;
    configCache.set(cacheKey, { data: parsed, timestamp: now });
    return parsed;
  } catch (err) {
    console.error(`[Nacos] Failed to parse YAML for ${dataId}:`, err);
    return null;
  }
}

/**
 * List all configurations in Nacos.
 */
export async function listNacosConfigs(): Promise<NacosConfigItem[]> {
  const endpoint = getNacosEndpoint();
  const url = `${endpoint}/nacos/v1/cs/configs?dataId=&group=&pageNo=1&pageSize=100&search=accurate`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { pageItems?: Array<{ dataId: string; group: string; type: string }> };
    return (json.pageItems || []).map((item) => ({
      dataId: item.dataId,
      group: item.group,
      type: item.type,
    }));
  } catch {
    return [];
  }
}

export function parseDatabaseUrlToJdbc(dbUrl: string): {
  jdbcUrl: string;
  username: string;
  password: string;
} {
  try {
    const clean = dbUrl.replace(/^jdbc:/, "");
    const parsed = new URL(clean);
    const host =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"
        ? "postgres"
        : parsed.hostname || "postgres";
    const port = parsed.port || "5432";
    const database = parsed.pathname.replace(/^\//, "") || "khlandb";
    const username = decodeURIComponent(parsed.username || "khlan");
    const password = decodeURIComponent(parsed.password || "khlan_secret_2026");

    return {
      jdbcUrl: `jdbc:postgresql://${host}:${port}/${database}`,
      username,
      password,
    };
  } catch {
    return {
      jdbcUrl: "jdbc:postgresql://postgres:5432/khlandb",
      username: "khlan",
      password: "khlan_secret_2026",
    };
  }
}

/**
 * Generate default configuration YAMLs based on current environment variables.
 */
export function generateDefaultModularConfigs(): Record<string, string> {
  const r2Endpoint =
    process.env.CLOUDFLARE_R2_ENDPOINT ||
    "https://cb9940df321e5a167f322120e5c74070.r2.cloudflarestorage.com";
  const r2AccessKey = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "d3de5abfa49f01c944cc6cc9eee5a282";
  const r2SecretKey =
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
    "4f2977c626ea5856833a712e08052fbc78ab4cf7ebd22b6c529bbf85bf77cf5d";
  const r2Bucket = (process.env.CLOUDFLARE_R2_BUCKET || "cars-storage").replace(/['"]/g, "").trim();
  const r2Prefix = process.env.CLOUDFLARE_R2_PREFIX || "car_list/";
  const r2PublicUrl =
    process.env.CLOUDFLARE_R2_PUBLIC_URL || "https://pub-d32806cd92a44955a3772e3e6c2369a5.r2.dev";

  const tgBotToken = process.env.TELEGRAM_BOT_TOKEN || "8961155344:AAEXIEeSWNp4kudB2YQEnpj7hsUkd-ignAc";
  const tgGroupChatId = process.env.TELEGRAM_GROUP_CHAT_ID || "-1004489863210";
  const tgWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "khlan_webhook_secret_2026";

  const dbInfo = parseDatabaseUrlToJdbc(
    process.env.DATABASE_URL || "postgresql://khlan:khlan_secret_2026@postgres:5432/khlandb"
  );

  return {
    "khlan-backend.yaml": YAML.stringify({
      server: {
        port: 8080,
        shutdown: "graceful",
      },
      spring: {
        application: { name: "khlan-backend" },
        threads: { virtual: { enabled: true } },
        datasource: {
          url: dbInfo.jdbcUrl,
          username: dbInfo.username,
          password: dbInfo.password,
          "driver-class-name": "org.postgresql.Driver",
          hikari: {
            "maximum-pool-size": 20,
            "minimum-idle": 5,
            "idle-timeout": 300000,
            "connection-timeout": 20000,
          },
        },
        jpa: {
          "open-in-view": false,
          hibernate: { "ddl-auto": "validate" },
          properties: {
            hibernate: {
              dialect: "org.hibernate.dialect.PostgreSQLDialect",
              format_sql: false,
            },
          },
        },
        flyway: {
          enabled: true,
          "baseline-on-migrate": true,
          locations: "classpath:db/migration",
        },
        data: {
          redis: {
            host: "redis",
            port: 6379,
            timeout: "3000ms",
          },
        },
      },
      jwt: {
        secret: "KhLanSuperSecretJwtKeyCambodiaMarketplace2026SecureToken",
        "access-token-expiration-ms": 86400000,
        "refresh-token-expiration-ms": 604800000,
      },
      management: {
        endpoints: {
          web: {
            exposure: { include: "health,info,prometheus,metrics" },
          },
        },
        endpoint: {
          health: { "show-details": "always" },
          prometheus: { enabled: true },
        },
      },
    }),

    "khlan-storage.yaml": YAML.stringify({
      storage: {
        "default-provider": "CLOUDFLARE_R2",
        r2: {
          endpoint: r2Endpoint,
          "access-key-id": r2AccessKey,
          "secret-access-key": r2SecretKey,
          bucket: r2Bucket,
          prefix: r2Prefix,
          "public-url": r2PublicUrl,
        },
        minio: {
          endpoint: "http://minio:9000",
          "access-key": "minioadmin",
          "secret-key": "minioadmin",
          bucket: "cars-storage",
        },
      },
    }),

    "khlan-telegram.yaml": YAML.stringify({
      telegram: {
        "bot-token": tgBotToken,
        "group-chat-id": tgGroupChatId,
        "webhook-secret": tgWebhookSecret,
        "mini-app": {
          enabled: true,
          "app-url": "https://t.me/khlan_bot/app",
        },
      },
    }),

    "khlan-frontend.yaml": YAML.stringify({
      frontend: {
        "app-name": "KhLan Automotive Marketplace",
        "default-locale": "km",
        "supported-locales": ["km", "en", "zh", "vi"],
        features: {
          "ai-inspection": true,
          "telegram-mini-app": true,
          "multi-category": true,
          "demo-mode": false,
        },
        pricing: {
          "default-currency": "USD",
          "khr-rate": 4100,
        },
      },
    }),
  };
}

/**
 * Synchronize all local modular configs into Nacos.
 */
export async function syncAllConfigsToNacos(): Promise<{
  published: string[];
  errors: string[];
}> {
  const configs = generateDefaultModularConfigs();
  const published: string[] = [];
  const errors: string[] = [];

  for (const [dataId, content] of Object.entries(configs)) {
    try {
      const ok = await publishNacosConfig(dataId, content, "yaml", "DEFAULT_GROUP");
      if (ok) {
        published.push(dataId);
      } else {
        errors.push(`Failed publishing ${dataId}`);
      }
    } catch (err) {
      errors.push(`${dataId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { published, errors };
}

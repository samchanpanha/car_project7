import { db } from "@/lib/db";
import type { AdminTelegramConfigDTO, TelegramBotStatusDTO } from "@/lib/dashboard-types";

export const TELEGRAM_CONFIG_KEY = "telegram.platformConfig";

export const DEFAULT_TELEGRAM_CONFIG: Omit<AdminTelegramConfigDTO, "hasEnvToken"> = {
  botUsername: "KhLanBot",
  botToken: null,
  chatId: "-1004489863210",
  miniAppUrl: "https://t.me/KhLanBot/app",
  channelUrl: "https://t.me/KhLanOfficial",
  groupUrl: "https://t.me/KhLanGroup",
  tmaEnabled: true,
  autoAuthEnabled: true,
  leadAlertsEnabled: true,
};

/** Read the current platform Telegram configuration with environment fallbacks */
export async function readTelegramConfig(): Promise<AdminTelegramConfigDTO> {
  const row = await db.platformSetting.findUnique({
    where: { key: TELEGRAM_CONFIG_KEY },
  });

  let parsed: Partial<AdminTelegramConfigDTO> = {};
  if (row?.valueJson) {
    try {
      parsed = JSON.parse(row.valueJson);
    } catch {
      parsed = {};
    }
  }

  const envToken = process.env.TELEGRAM_BOT_TOKEN || null;
  const envChatId = process.env.TELEGRAM_GROUP_CHAT_ID || null;

  return {
    botUsername: parsed.botUsername ?? DEFAULT_TELEGRAM_CONFIG.botUsername,
    botToken: parsed.botToken ?? envToken,
    chatId: parsed.chatId ?? envChatId ?? DEFAULT_TELEGRAM_CONFIG.chatId,
    miniAppUrl: parsed.miniAppUrl ?? DEFAULT_TELEGRAM_CONFIG.miniAppUrl,
    channelUrl: parsed.channelUrl ?? DEFAULT_TELEGRAM_CONFIG.channelUrl,
    groupUrl: parsed.groupUrl ?? DEFAULT_TELEGRAM_CONFIG.groupUrl,
    tmaEnabled: parsed.tmaEnabled ?? DEFAULT_TELEGRAM_CONFIG.tmaEnabled,
    autoAuthEnabled: parsed.autoAuthEnabled ?? DEFAULT_TELEGRAM_CONFIG.autoAuthEnabled,
    leadAlertsEnabled: parsed.leadAlertsEnabled ?? DEFAULT_TELEGRAM_CONFIG.leadAlertsEnabled,
    hasEnvToken: Boolean(envToken),
  };
}

/** Update the platform Telegram configuration */
export async function saveTelegramConfig(
  config: Partial<Omit<AdminTelegramConfigDTO, "hasEnvToken">>,
): Promise<AdminTelegramConfigDTO> {
  const current = await readTelegramConfig();
  const updated: Omit<AdminTelegramConfigDTO, "hasEnvToken"> = {
    botUsername: config.botUsername !== undefined ? config.botUsername : current.botUsername,
    botToken: config.botToken !== undefined ? config.botToken : current.botToken,
    chatId: config.chatId !== undefined ? config.chatId : current.chatId,
    miniAppUrl: config.miniAppUrl !== undefined ? config.miniAppUrl : current.miniAppUrl,
    channelUrl: config.channelUrl !== undefined ? config.channelUrl : current.channelUrl,
    groupUrl: config.groupUrl !== undefined ? config.groupUrl : current.groupUrl,
    tmaEnabled: config.tmaEnabled !== undefined ? config.tmaEnabled : current.tmaEnabled,
    autoAuthEnabled: config.autoAuthEnabled !== undefined ? config.autoAuthEnabled : current.autoAuthEnabled,
    leadAlertsEnabled: config.leadAlertsEnabled !== undefined ? config.leadAlertsEnabled : current.leadAlertsEnabled,
  };

  await db.platformSetting.upsert({
    where: { key: TELEGRAM_CONFIG_KEY },
    create: { key: TELEGRAM_CONFIG_KEY, valueJson: JSON.stringify(updated) },
    update: { valueJson: JSON.stringify(updated) },
  });

  return {
    ...updated,
    hasEnvToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  };
}

/** Test Telegram Bot token validity via official Telegram API getMe */
export async function testTelegramBotConnection(token?: string | null): Promise<TelegramBotStatusDTO> {
  const effectiveToken = token || (await readTelegramConfig()).botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!effectiveToken) {
    return {
      connected: false,
      error: "No Telegram bot token configured. Set one in Admin Settings or .env.",
    };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${effectiveToken}/getMe`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
      result?: {
        id: number;
        is_bot: boolean;
        first_name: string;
        username?: string;
        can_join_groups?: boolean;
        can_read_all_group_messages?: boolean;
        supports_inline_queries?: boolean;
      };
    } | null;

    if (!res.ok || !data?.ok || !data.result) {
      return {
        connected: false,
        error: data?.description || `Telegram API responded with HTTP ${res.status}`,
      };
    }

    return {
      connected: true,
      botId: data.result.id,
      botName: data.result.first_name,
      botUsername: data.result.username,
      canJoinGroups: data.result.can_join_groups,
      canReadAllGroupMessages: data.result.can_read_all_group_messages,
      supportsInlineQueries: data.result.supports_inline_queries,
    };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "Failed to connect to api.telegram.org",
    };
  }
}

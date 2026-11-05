import { translate } from "./index";
import type { Locale } from "./types";

export interface RealtimeNotificationEvent {
  type: string;
  title?: string;
  message?: string;
  payload?: Record<string, unknown>;
}

export interface LocalizedRealtimeNotification {
  title: string;
  message: string;
}

function payloadText(payload: Record<string, unknown> | undefined, key: string, fallback = ""): string {
  const value = payload?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

export function localizeRealtimeNotification(
  locale: Locale,
  event: RealtimeNotificationEvent,
): LocalizedRealtimeNotification | null {
  const payload = event.payload;
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  switch (event.type) {
    case "CONNECTED":
    case "PING":
      return null;
    case "SUBSCRIPTION_ACTIVATED":
      return {
        title: t("realtimeSubscriptionActivatedTitle"),
        message: t("realtimeSubscriptionActivatedBody", {
          plan: payloadText(payload, "plan", t("realtimeSubscriptionFallback")),
        }),
      };
    case "PAYMENT_REJECTED": {
      const reason = payloadText(payload, "reason");
      return {
        title: t("realtimePaymentRejectedTitle"),
        message: reason
          ? `${t("realtimePaymentRejectedBody")} ${t("realtimePaymentRejectedReason", { reason })}`
          : t("realtimePaymentRejectedBody"),
      };
    }
    case "TELEGRAM_LINKED":
      return {
        title: t("realtimeTelegramLinkedTitle"),
        message: t("realtimeTelegramLinkedBody"),
      };
    case "APPOINTMENT_CREATED":
      return {
        title: t("realtimeAppointmentCreatedTitle"),
        message: t("realtimeAppointmentCreatedBody", {
          buyerName: payloadText(payload, "buyerName", t("realtimeBuyerFallback")),
          year: payloadText(payload, "vehicleYear"),
          make: payloadText(payload, "vehicleMake"),
          model: payloadText(payload, "vehicleModel"),
        }),
      };
    case "SAVED_SEARCH_MATCH":
      return {
        title: t("realtimeSavedSearchMatchTitle"),
        message: t("realtimeSavedSearchMatchBody", {
          searchName: payloadText(payload, "searchName", t("realtimeSavedSearchFallback")),
          year: payloadText(payload, "year"),
          make: payloadText(payload, "make"),
          model: payloadText(payload, "model"),
        }),
      };
    case "LEAD_FOLLOWUP":
      return payloadText(payload, "leadType") === "APPOINTMENT"
        ? {
            title: t("realtimeAppointmentFollowupTitle"),
            message: t("realtimeAppointmentFollowupBody"),
          }
        : {
            title: t("realtimePurchaseFollowupTitle"),
            message: t("realtimePurchaseFollowupBody"),
          };
    case "TEST_NOTIFICATION":
      return {
        title: t("realtimeTestNotificationTitle"),
        message: t("realtimeTestNotificationBody"),
      };
    default:
      return {
        title: t("notificationGenericTitle"),
        message: t("notificationGenericBody"),
      };
  }
}

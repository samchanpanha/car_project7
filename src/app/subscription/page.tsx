import { redirect } from "next/navigation";

export const metadata = { robots: { index: false, follow: false } };

/** Legacy URL kept alive for old links — the subscription hub now lives in the
 *  dashboard. A server redirect beats the previous client-side navigate stub
 *  (crawlable, no JS required, no empty page in the index). */
export default function SubscriptionPage(): never {
  redirect("/dashboard?tab=subscription");
}

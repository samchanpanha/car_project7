/**
 * URL ↔ app view mapping.
 *
 * The marketplace is a single-page UI driven by `useAppStore().view`, but every
 * view now has a real, crawlable URL. `navigate()` pushes the mapped path and
 * each route page passes the server-derived view back into `<AppChrome>`.
 *
 * Keep these two functions exact inverses — `tests/seo-routes.test.ts` asserts
 * the round trip for every view.
 */

import type { View } from "./store";

const SORTS = ["newest", "price_asc", "price_desc", "year_desc", "mileage_asc"] as const;
const CATEGORIES = ["ALL", "CAR", "MOTOR", "SPARE_PART"] as const;
const GUIDE_TABS = ["buyer", "seller", "dealer", "payments", "faq"] as const;

/** Public listing detail path. Client-safe (no env access) so it can be used
 *  from components — `src/lib/seo.ts` re-exports it for server code. */
export function vehiclePath(id: string): string {
  return `/vehicles/${encodeURIComponent(id)}`;
}

function clean(value: string | null | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

/** Serialize a view to the canonical path (including query string). */
export function viewToPath(view: View): string {
  switch (view.name) {
    case "home":
      return "/";

    case "browse": {
      const params = new URLSearchParams();
      if (view.q) params.set("q", view.q);
      if (view.make) params.set("make", view.make);
      if (view.bodyType) params.set("bodyType", view.bodyType);
      if (view.category && view.category !== "ALL") params.set("category", view.category);
      if (view.partTarget) params.set("partTarget", view.partTarget);
      if (view.partCategory) params.set("partCategory", view.partCategory);
      if (view.sort && view.sort !== "newest") params.set("sort", view.sort);
      const qs = params.toString();
      return qs ? `/browse?${qs}` : "/browse";
    }

    case "detail":
      return `/vehicles/${encodeURIComponent(view.vehicleId)}`;

    case "report":
      return `/vehicles/${encodeURIComponent(view.vehicleId)}/report`;

    case "sell":
      return "/sell";

    case "messages":
      return view.conversationId
        ? `/messages?c=${encodeURIComponent(view.conversationId)}`
        : "/messages";

    case "favorites":
      return "/favorites";

    case "seller":
      return `/sellers/${encodeURIComponent(view.userId)}`;

    case "compare":
      return "/compare";

    case "auth":
      return view.tab === "signup" ? "/auth?tab=signup" : "/auth";

    case "dashboard": {
      const tab = clean(view.tab);
      return tab ? `/dashboard?tab=${encodeURIComponent(tab)}` : "/dashboard";
    }

    case "guide": {
      const tab = clean(view.tab);
      return tab ? `/guide?tab=${encodeURIComponent(tab)}` : "/guide";
    }

    default:
      return "/";
  }
}

/** Rebuild a view from a pathname + query string. Unknown paths fall back home.
 *  Accepts a combined "/browse?q=x" string as well as a separate query. */
export function pathToView(pathname: string, search: string | URLSearchParams = ""): View {
  let path = pathname;
  let query = search;

  if (typeof query === "string" && !query) {
    // The caller passed a combined "/browse?q=x" path — split it.
    const questionMark = path.indexOf("?");
    if (questionMark !== -1) {
      query = path.slice(questionMark + 1);
      path = path.slice(0, questionMark);
    }
  }

  const params = typeof query === "string" ? new URLSearchParams(query) : query;
  path = path.replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean);
  const pick = (key: string) => clean(params.get(key));

  if (path === "/") return { name: "home" };

  if (path === "/browse") {
    const sort = pick("sort");
    const category = pick("category");
    return {
      name: "browse",
      q: pick("q"),
      make: pick("make"),
      bodyType: pick("bodyType"),
      category: CATEGORIES.includes(category as (typeof CATEGORIES)[number])
        ? (category as (typeof CATEGORIES)[number])
        : undefined,
      partTarget: pick("partTarget"),
      partCategory: pick("partCategory"),
      sort: SORTS.includes(sort as (typeof SORTS)[number])
        ? (sort as (typeof SORTS)[number])
        : undefined,
    };
  }

  if (segments[0] === "vehicles" && segments[1]) {
    const vehicleId = decodeURIComponent(segments[1]);
    if (segments[2] === "report") return { name: "report", vehicleId };
    return { name: "detail", vehicleId };
  }

  if (segments[0] === "sellers" && segments[1]) {
    return { name: "seller", userId: decodeURIComponent(segments[1]) };
  }

  if (path === "/sell") return { name: "sell" };
  if (path === "/favorites") return { name: "favorites" };
  if (path === "/compare") return { name: "compare" };

  if (path === "/messages") {
    const conversationId = pick("c");
    return { name: "messages", conversationId };
  }

  if (path === "/auth") {
    return { name: "auth", tab: params.get("tab") === "signup" ? "signup" : "login" };
  }

  if (path === "/dashboard") {
    return { name: "dashboard", tab: pick("tab") };
  }

  if (path === "/guide") {
    const tab = pick("tab");
    return {
      name: "guide",
      tab: GUIDE_TABS.includes(tab as (typeof GUIDE_TABS)[number])
        ? (tab as (typeof GUIDE_TABS)[number])
        : undefined,
    };
  }

  return { name: "home" };
}

/** Stable identity for a view — used as a React/effect dependency. */
export function viewKey(view: View): string {
  return viewToPath(view);
}

/** Flatten Next's `searchParams` record into a query string (first value wins).
 *  Route pages use this to rebuild the view from the request. */
export function toQueryString(
  params: Record<string, string | string[] | undefined>
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) sp.set(key, first);
  }
  return sp.toString();
}

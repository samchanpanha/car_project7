/**
 * Lets the zustand store drive Next.js navigation without importing the router
 * (the store is a plain module, and 90+ components call `navigate()` directly).
 *
 * `<AppChrome>` registers the App Router instance on mount. When no router is
 * registered — unit tests, server renders — `routeTo` is a no-op and the store
 * still updates its in-memory view.
 */

export interface NavigationRouter {
  push(href: string): void;
}

let router: NavigationRouter | null = null;

export function registerRouter(next: NavigationRouter | null): void {
  router = next;
}

/** Push a path if a router is available. Returns whether it happened. */
export function routeTo(href: string): boolean {
  if (!router) return false;
  router.push(href);
  return true;
}

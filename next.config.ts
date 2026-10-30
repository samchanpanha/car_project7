import type { NextConfig } from "next";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8080" : "http://backend:8080");

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "prisma", "tesseract.js", "sharp"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  /**
   * Proxy /api/* requests to the Spring Boot backend.
   *
   * Precedence matters here, so keep the two buckets straight:
   *
   *   beforeFiles → filesystem (public/, static, App Router route handlers)
   *               → afterFiles → dynamic routes → fallback
   *
   * The catch-all lives in `fallback`, which runs LAST. That is deliberate:
   * it lets a Next.js route handler win over the proxy. `src/app/api/ocr/route.ts`
   * depends on this — it must execute in-process (Sharp + Tesseract.js) and must
   * NOT be forwarded to the backend, which has no /api/ocr endpoint.
   *
   * Anything under /api/* with no matching route handler (vehicles, auth, tenant,
   * admin, payments, realtime, uploads, …) falls through to Spring Boot.
   *
   * `afterFiles` is used for /api/uploads/:file so the object-storage file
   * serving is proxied explicitly rather than relying on fallthrough.
   *
   * The rewrite applies to both server-side (SSR) and client-side fetch calls.
   */
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        {
          // Uploads file-serving (GET /api/uploads/:file) → backend
          source: "/api/uploads/:file",
          destination: `${BACKEND_URL}/api/uploads/:file`,
        },
      ],
      fallback: [
        {
          // All other /api/* routes not handled by Next.js route handlers → Spring Boot backend
          source: "/api/:path*",
          destination: `${BACKEND_URL}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;

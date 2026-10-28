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
   * Proxy all /api/* requests to the Spring Boot backend.
   *
   * Next.js rewrites happen BEFORE its own route handlers, so any matching
   * /api/* path is forwarded to backend:8080 without ever reaching the
   * Next.js API route files.  Those route files have been removed.
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

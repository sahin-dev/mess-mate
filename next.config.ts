import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Next.js serves its own bootstrap and hydration payloads as inline scripts, so
 * a nonce-free policy has to allow `unsafe-inline` there. Tightening that means
 * generating a per-request nonce in a proxy and threading it through; until
 * then this still blocks framing, foreign form posts, plugins and any script
 * loaded from another origin. `unsafe-eval` is only needed by React Refresh.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  // Nothing in MessMate is public, so no page should ever be cached by a proxy
  // or announced by a server banner.
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Every response is specific to the signed-in member.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
    ];
  },

  // The dev server is sometimes opened through a workspace address rather than
  // localhost. Set MESSMATE_DEV_ORIGINS to a comma-separated list to allow more.
  allowedDevOrigins: (process.env.MESSMATE_DEV_ORIGINS ?? "10.10.28.200")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export default nextConfig;

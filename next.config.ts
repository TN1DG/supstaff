import type { NextConfig } from "next";

/**
 * Security headers for every response. The Content-Security-Policy is set per
 * request in `src/proxy.ts`, because it carries a fresh script nonce.
 */
const securityHeaders = [
  // HTTPS only, for two years, including subdomains (Vercel serves HTTPS).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Don't let the browser guess a CSV or PDF is HTML.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never framed (clickjacking); CSP frame-ancestors covers modern browsers.
  { key: "X-Frame-Options", value: "DENY" },
  // Resident ids in URLs stay on this site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // @react-pdf/renderer ships its own bundled deps and font/hyphenation data
  // that don't play well with bundlers — load it at runtime from node_modules.
  serverExternalPackages: ["@react-pdf/renderer"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer ships its own bundled deps and font/hyphenation data
  // that don't play well with bundlers — load it at runtime from node_modules.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;

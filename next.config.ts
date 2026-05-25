import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  experimental: {
    proxyClientMaxBodySize: "1gb",
    serverActions: {
      bodySizeLimit: "1gb",
    },
  },
};

export default nextConfig;

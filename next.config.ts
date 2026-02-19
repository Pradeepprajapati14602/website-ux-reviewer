import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@sparticuz/chromium/**/*"],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

// Static export: the site is plain files that any static host can serve,
// with no server logic — same privacy posture as the app.
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;

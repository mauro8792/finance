import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que `next dev` genere AGENTS.md / CLAUDE.md en el paquete.
  agentRules: false,
  transpilePackages: ["shared"],
};

export default nextConfig;

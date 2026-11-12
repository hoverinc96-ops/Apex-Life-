import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pdfjs-dist ships its own worker/font assets — keep it unbundled and loaded
  // from node_modules at runtime by the lead-import PDF path.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;

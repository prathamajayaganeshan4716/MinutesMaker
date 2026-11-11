import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  allowedDevOrigins: ["3.110.226.102"],
  turbopack: {
    root: rootDir,
  },
};

export default nextConfig;

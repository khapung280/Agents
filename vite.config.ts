import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", chunkSizeWarningLimit: 1100 },
  server: { allowedHosts: ["localhost", "127.0.0.1"] },
});

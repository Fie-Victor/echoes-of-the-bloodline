import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true } },
  },
});

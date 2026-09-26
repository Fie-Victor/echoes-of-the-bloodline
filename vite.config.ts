import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (name: string) => fileURLToPath(new URL(`client/${name}.html`, import.meta.url));

export default defineConfig({
  root: "client",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: { input: { index: page("index"), troy: page("troy") } },
  },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true } },
  },
});

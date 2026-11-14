import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = process.env.ASTRA_BACKEND ?? "http://127.0.0.1:8000";

// In development the Vite server proxies the API, the WebSocket and the terrain
// assets to the FastAPI backend, so the browser only ever talks to one origin.
// `host: true` exposes the dev server on the LAN so a phone can open QR links.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: backend, changeOrigin: false, ws: true },
      "/terrain": { target: backend, changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks: { three: ["three"], react: ["react", "react-dom", "react-router-dom"] } },
    },
  },
});

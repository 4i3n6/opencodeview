import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: process.env.VITE_HOST ?? "127.0.0.1",
    port: Number(process.env.WEB_PORT ?? 5273),
    strictPort: true,
    proxy: {
      "/api": process.env.VITE_API_PROXY ?? "http://127.0.0.1:4317",
    },
  },
});

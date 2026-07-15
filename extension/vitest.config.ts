import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".."),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.sim.test.tsx", "src/**/*.test.ts"],
    globals: true,
  },
});

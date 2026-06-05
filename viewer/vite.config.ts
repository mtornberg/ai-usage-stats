import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds the dashboard into a single self-contained HTML file (all JS/CSS
// inlined) at viewer/dist/index.html, which the CLI uses as a template.
export default defineConfig({
  root: __dirname,
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
  },
});

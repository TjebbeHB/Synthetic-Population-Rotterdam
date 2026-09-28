import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["apple-touch-icon.png", "favicon-32.png"],
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,json,woff2}"],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        },
        manifest: {
          name: "Synthetische Populatie Lab",
          short_name: "Populatie Lab",
          description:
            "Synthetische personen voor Rotterdam, provincies en Nederland. CBS-bronnen, onderzoeksdatasets en methode.",
          theme_color: "#00811f",
          background_color: "#edf4f2",
          display: "standalone",
          orientation: "any",
          start_url: "/",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
      }),
    ],
    build: {
      outDir: "dist",
      chunkSizeWarningLimit: 1500,
    },
  };
});

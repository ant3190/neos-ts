import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import ydkLoader from "vite-ydk-loader";
import tsconfigPaths from "vite-tsconfig-paths";
import sassDts from "vite-plugin-sass-dts";
import path from "path";
import arraybuffer from "vite-plugin-arraybuffer";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "NEOS_");
  const resourceUrl = env.NEOS_RESOURCE_URL || "http://127.0.0.1:8788";
  return {
    server: {
      proxy: {
        "/local-resources": resourceUrl,
        "/api/resources": resourceUrl,
      },
    },
    plugins: [
      react(),
      svgr(),
      ydkLoader(),
      arraybuffer(),
      tsconfigPaths(),
      sassDts({
        enabledMode: ["development"],
        sourceDir: path.resolve(__dirname, "./src"),
      }),
    ],
    resolve: {
      extensions: [
        ".mjs",
        ".js",
        ".mts",
        ".ts",
        ".jsx",
        ".tsx",
        ".json",
        ".ydk",
      ],
    },
  };
});

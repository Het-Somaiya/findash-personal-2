import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file from the current directory (frontend folder)
  const env = loadEnv(mode, process.cwd());

  // Use the specific key from your .env file
  const backendUrl = env.VITE_BACKEND_URL || "http://localhost:8000";

  return {
    base: mode === "production" ? "/static/" : "/",
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      strictPort: true, 
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
          secure: false, 
          ws: true,
          // Important: rewrite ensures the backend receives the full /api/ path
          rewrite: (path) => path.replace(/^\/api/, "/api"), 
        },
      },
    },
  };
});
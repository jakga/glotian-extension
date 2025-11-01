import { defineConfig, loadEnv } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { resolve } from "path";
import manifest from "./manifest.json";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devServerPort = Number(env.VITE_DEV_SERVER_PORT || "5173");
  if (isNaN(devServerPort) || devServerPort <= 0 || devServerPort > 65535) {
    throw new Error(
      `Invalid VITE_DEV_SERVER_PORT: ${env.VITE_DEV_SERVER_PORT}`,
    );
  }

  const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  const originTrialTokens = {
    writer: env.VITE_ORIGIN_TRIAL_TOKEN_WRITER?.trim() ?? "",
    rewriter: env.VITE_ORIGIN_TRIAL_TOKEN_REWRITER?.trim() ?? "",
    proofreader: env.VITE_ORIGIN_TRIAL_TOKEN_PROOFREADER?.trim() ?? "",
  };

  env.VITE_ORIGIN_TRIAL_TOKEN_WRITER = originTrialTokens.writer;
  env.VITE_ORIGIN_TRIAL_TOKEN_REWRITER = originTrialTokens.rewriter;
  env.VITE_ORIGIN_TRIAL_TOKEN_PROOFREADER = originTrialTokens.proofreader;

  if (!supabaseUrl) {
    throw new Error(
      "Missing VITE_SUPABASE_URL. Set it in your environment before running the extension build.",
    );
  }

  if (!supabaseAnonKey) {
    throw new Error(
      "Missing VITE_SUPABASE_ANON_KEY. Set it in your environment before running the extension build.",
    );
  }

  return {
    plugins: [crx({ manifest: manifest as any })],
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
        "@/types": resolve(__dirname, "./src/types"),
        "@/lib": resolve(__dirname, "./src/lib"),
        "@/utils": resolve(__dirname, "./src/utils"),
      },
    },
    build: {
      outDir: mode === "production" ? "dist-prod" : "dist-dev",
      sourcemap: mode !== "production",
      minify: mode === "production",
      rollupOptions: {
        input: {
          "side-panel": resolve(__dirname, "src/side-panel/index.html"),
          popup: resolve(__dirname, "src/popup/index.html"),
          offscreen: resolve(__dirname, "src/offscreen/index.html"),
        },
      },
    },
    server: {
      port: devServerPort,
      strictPort: true,
      hmr: {
        host: "localhost",
        port: devServerPort,
        protocol: "ws",
      },
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseAnonKey),
      // SECURITY WARNING: API keys are embedded for development/testing only
      // For production, these should be proxied through a backend service
      "import.meta.env.VITE_OPENAI_API_KEY": JSON.stringify(
        env.VITE_OPENAI_API_KEY || "",
      ),
      "import.meta.env.VITE_GEMINI_API_KEY": JSON.stringify(
        env.VITE_GEMINI_API_KEY || "",
      ),
      "import.meta.env.VITE_ORIGIN_TRIAL_TOKEN_WRITER": JSON.stringify(
        originTrialTokens.writer,
      ),
      "import.meta.env.VITE_ORIGIN_TRIAL_TOKEN_REWRITER": JSON.stringify(
        originTrialTokens.rewriter,
      ),
      "import.meta.env.VITE_ORIGIN_TRIAL_TOKEN_PROOFREADER": JSON.stringify(
        originTrialTokens.proofreader,
      ),
    },
  };
});

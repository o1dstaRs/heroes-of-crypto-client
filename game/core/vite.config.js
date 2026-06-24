// game/core/vite.config.ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const isKnownDependencyWarning = (log) => {
    const id = typeof log?.id === "string" ? log.id : "";
    const message = typeof log?.message === "string" ? log.message : "";
    const code = log?.code;

    return (
        (code === "EVAL" && (id.includes("google-protobuf") || message.includes("google-protobuf"))) ||
        (code === "INVALID_ANNOTATION" && (id.includes("/ox/") || id.includes("\\ox\\")))
    );
};

export default defineConfig(({ mode }) => {
    // Load .env / .env.production from this directory
    const env = loadEnv(mode, __dirname, ""); // expose PROD + VITE_*
    const isProd = mode === "production" || env.PROD === "1" || env.PROD === "true";

    return {
        // Make sure Vite reads env files from the core package
        envDir: __dirname,
        envPrefix: ["VITE_"],

        plugins: [react()],

        // Keep app root at UI folder
        root: path.resolve(__dirname, "src/ui"),
        publicDir: path.resolve(__dirname, "public"),

        resolve: {
            alias: {
                buffer: "buffer",
                "@": path.resolve(__dirname, "src"),
                // point to source of the workspace for live HMR
                "@heroesofcrypto/common": path.resolve(__dirname, "../heroes-of-crypto-common/src"),
            },
            // avoid duplicate React from the workspace
            dedupe: ["react", "react-dom"],
        },

        // Prebundle `buffer` shim for the browser
        optimizeDeps: {
            include: ["buffer"],
        },

        // Some third-party code still checks process.env; prevent “process is not defined”
        define: {
            "process.env": {}, // safe no-op object; your app should use import.meta.env in browser code
            __PROD__: JSON.stringify(isProd),
        },

        css: {
            preprocessorOptions: {
                scss: {
                    // Modern Sass API; don’t auto-inject deprecated @import
                    api: "modern",
                    includePaths: [
                        path.resolve(__dirname, "src"), // so "styles/..." works
                        path.resolve(__dirname, "src/ui"), // if you keep UI-scoped styles
                    ],
                },
            },
        },

        server: {
            port: 5173,
            open: true,
            host: true,
            headers: { "Cache-Control": "no-store" }, // dev: force no caching
            watch: {
                usePolling: true,
                ignored: ["**/node_modules/**", "**/.parcel-cache/**"],
            },
            // allow Vite to read sibling workspace files for HMR
            fs: {
                allow: [
                    path.resolve(__dirname), // core
                    path.resolve(__dirname, "../heroes-of-crypto-common"), // workspace root
                    path.resolve(__dirname, "../heroes-of-crypto-common/src"),
                    path.resolve(__dirname, "../.."), // project root (for node_modules)
                ],
            },
        },

        // For production builds (Vite already content-hashes assets)
        build: {
            outDir: path.resolve(__dirname, "dist"),
            emptyOutDir: true,
            chunkSizeWarningLimit: 4096,
            // base: "./" keeps relative asset paths if you deploy static to a subdir
            // uncomment if you serve from a subpath or file://
            // base: "./",
            rollupOptions: {
                onLog(level, log, handler) {
                    if (level === "warn" && isKnownDependencyWarning(log)) {
                        return;
                    }
                    handler(level, log);
                },
                output: {
                    // Optional: keep vendor split predictable.
                    // Vite 8 (rolldown) requires manualChunks to be a function, not an object.
                    manualChunks(id) {
                        if (/[\\/]node_modules[\\/](react|react-dom)[\\/]/.test(id)) {
                            return "react";
                        }
                        return undefined;
                    },
                },
            },
        },
    };
});

// game/core/vite.config.ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import path from "path";

const DEV_SHADOW_TUNING_ENDPOINT = "/__hoc-dev/battlefield-shadow-tuning";
const DEV_SHADOW_TUNING_FILE = path.resolve(__dirname, "tmp/dev/battlefield-shadow-tuning-v8.json");
const DEV_SHADOW_EDITOR_STATE_ENDPOINT = "/__hoc-dev/battlefield-shadow-editor-state";
const DEV_SHADOW_EDITOR_STATE_FILE = path.resolve(__dirname, "tmp/dev/battlefield-shadow-editor-state.json");

const readDevShadowTunings = async () => {
    try {
        const parsed = JSON.parse(await fs.readFile(DEV_SHADOW_TUNING_FILE, "utf8"));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        if (error?.code === "ENOENT" || error instanceof SyntaxError) return {};
        throw error;
    }
};

const writeDevShadowTunings = async (tunings) => {
    await fs.mkdir(path.dirname(DEV_SHADOW_TUNING_FILE), { recursive: true });
    const temporaryFile = `${DEV_SHADOW_TUNING_FILE}.next`;
    await fs.writeFile(temporaryFile, `${JSON.stringify(tunings, null, 2)}\n`, "utf8");
    await fs.rename(temporaryFile, DEV_SHADOW_TUNING_FILE);
};

const readDevShadowEditorState = async () => {
    try {
        const parsed = JSON.parse(await fs.readFile(DEV_SHADOW_EDITOR_STATE_FILE, "utf8"));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        if (error?.code === "ENOENT" || error instanceof SyntaxError) return {};
        throw error;
    }
};

const writeDevShadowEditorState = async (state) => {
    await fs.mkdir(path.dirname(DEV_SHADOW_EDITOR_STATE_FILE), { recursive: true });
    const temporaryFile = `${DEV_SHADOW_EDITOR_STATE_FILE}.next`;
    await fs.writeFile(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await fs.rename(temporaryFile, DEV_SHADOW_EDITOR_STATE_FILE);
};

const readJsonRequest = (request) =>
    new Promise((resolve, reject) => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
            body += chunk;
            if (body.length > 1_000_000) reject(new Error("Shadow tuning request is too large"));
        });
        request.on("end", () => {
            try {
                resolve(JSON.parse(body || "{}"));
            } catch (error) {
                reject(error);
            }
        });
        request.on("error", reject);
    });

const devShadowTuningPlugin = () => ({
    name: "hoc-dev-shadow-tuning",
    apply: "serve",
    configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
            if (!request.url) return next();
            const requestPath = request.url.split("?", 1)[0];
            if (requestPath === DEV_SHADOW_EDITOR_STATE_ENDPOINT) {
                response.setHeader("Content-Type", "application/json; charset=utf-8");
                response.setHeader("Cache-Control", "no-store");
                try {
                    if (request.method === "GET") {
                        response.end(JSON.stringify(await readDevShadowEditorState()));
                        return;
                    }
                    if (request.method === "PUT") {
                        const payload = await readJsonRequest(request);
                        if (!Array.isArray(payload?.slots) || payload.slots.length !== 6) {
                            response.statusCode = 400;
                            response.end(JSON.stringify({ error: "Expected six editor slots" }));
                            return;
                        }
                        await writeDevShadowEditorState({ slots: payload.slots.map(Number) });
                        response.end(JSON.stringify({ ok: true }));
                        return;
                    }
                    response.statusCode = 405;
                    response.end(JSON.stringify({ error: "Method not allowed" }));
                } catch (error) {
                    response.statusCode = 500;
                    response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
                }
                return;
            }
            if (requestPath !== DEV_SHADOW_TUNING_ENDPOINT) return next();
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            try {
                if (request.method === "GET") {
                    response.end(JSON.stringify(await readDevShadowTunings()));
                    return;
                }
                if (request.method === "PUT") {
                    const payload = await readJsonRequest(request);
                    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
                        response.statusCode = 400;
                        response.end(JSON.stringify({ error: "Expected a tuning object" }));
                        return;
                    }
                    await writeDevShadowTunings(payload);
                    response.end(JSON.stringify({ ok: true }));
                    return;
                }
                if (request.method === "PATCH") {
                    const payload = await readJsonRequest(request);
                    if (!payload?.unitName || !payload?.value || typeof payload.value !== "object") {
                        response.statusCode = 400;
                        response.end(JSON.stringify({ error: "Expected unitName and value" }));
                        return;
                    }
                    await writeDevShadowTunings({
                        ...(await readDevShadowTunings()),
                        [payload.unitName]: payload.value,
                    });
                    response.end(JSON.stringify({ ok: true }));
                    return;
                }
                response.statusCode = 405;
                response.end(JSON.stringify({ error: "Method not allowed" }));
            } catch (error) {
                response.statusCode = 500;
                response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
            }
        });
    },
});

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
    const commonSourceDir = process.env.HOC_COMMON_SRC
        ? path.resolve(process.env.HOC_COMMON_SRC)
        : path.resolve(__dirname, "../heroes-of-crypto-common/src");

    return {
        // Make sure Vite reads env files from the core package
        envDir: __dirname,
        envPrefix: ["VITE_"],

        plugins: [react(), devShadowTuningPlugin()],

        // Keep app root at UI folder
        root: path.resolve(__dirname, "src/ui"),
        publicDir: path.resolve(__dirname, "public"),

        resolve: {
            alias: {
                buffer: "buffer",
                "@": path.resolve(__dirname, "src"),
                // point to source of the workspace for live HMR
                "@heroesofcrypto/common": commonSourceDir,
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
            // HMR is OFF by default: file edits no longer auto-refresh the page (a full reload on
            // non-hot-updatable modules like the Pixi scene was wiping game state mid-iteration).
            // Reload manually (Cmd/Ctrl+R) to pick up changes — the server always serves fresh code
            // from disk. Run with VITE_HMR=1 to turn live hot-reload back on.
            hmr: env.VITE_HMR === "1" || env.VITE_HMR === "true" ? undefined : false,
            proxy: {
                "/hoc-local-model": {
                    target: env.VITE_HOC_MODEL_PROXY_TARGET || "http://127.0.0.1:9091",
                    changeOrigin: true,
                    rewrite: (requestPath) => requestPath.replace(/^\/hoc-local-model/, "/v1"),
                },
            },
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
                    commonSourceDir,
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

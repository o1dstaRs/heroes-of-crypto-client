// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const isKnownDependencyWarning = (log) => {
    const id = typeof log?.id === "string" ? log.id : "";
    const message = typeof log?.message === "string" ? log.message : "";
    return log?.code === "EVAL" && (id.includes("google-protobuf") || message.includes("google-protobuf"));
};

export default defineConfig({
    site: "https://heroesofcrypto.io",
    integrations: [sitemap({ customPages: ["https://heroesofcrypto.io/research/a13/"] })],
    vite: {
        // The ranked-arena client reads VITE_HOST_* API origins (shared convention with game/core);
        // Astro's default only exposes PUBLIC_* to client code, which silently dropped those
        // overrides and pinned every build to the production origins.
        envPrefix: ["VITE_", "PUBLIC_"],
        build: {
            chunkSizeWarningLimit: 2048,
            rollupOptions: {
                onLog(level, log, handler) {
                    if (level === "warn" && isKnownDependencyWarning(log)) {
                        return;
                    }
                    handler(level, log);
                },
            },
        },
    },
});

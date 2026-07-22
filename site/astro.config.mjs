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

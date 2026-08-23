// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const isKnownDependencyWarning = (log) => {
    const id = typeof log?.id === "string" ? log.id : "";
    const message = typeof log?.message === "string" ? log.message : "";
    return log?.code === "EVAL" && (id.includes("google-protobuf") || message.includes("google-protobuf"));
};

const legacyKnowledgePaths = new Set(
    ["rules", "units", "abilities", "spells", "artifacts"].flatMap((section) => [`/${section}`, `/ru/${section}`]),
);

export default defineConfig({
    site: "https://heroesofcrypto.io",
    // Blog and Research merged into News (owner 2026-08-08): every old URL keeps working.
    redirects: {
        "/blog": "/news",
        "/blog/2026-07-22-inside-the-a13-ai": "/news/2026-08-06-inside-the-a19-ai",
        "/blog/[...slug]": "/news/[...slug]",
        "/ru/blog": "/ru/news",
        "/ru/blog/2026-07-22-inside-the-a13-ai": "/news/2026-08-06-inside-the-a19-ai",
        "/ru/blog/[...slug]": "/ru/news/[...slug]",
        "/research": "/news/2026-08-06-inside-the-a19-ai",
        "/research/a13": "/news/2026-08-06-inside-the-a19-ai",
        "/ru/research": "/news/2026-08-06-inside-the-a19-ai",
        "/ru/research/a13": "/news/2026-08-06-inside-the-a19-ai",
        "/news/research": "/news/2026-08-06-inside-the-a19-ai",
        "/news/research/a13": "/news/2026-08-06-inside-the-a19-ai",
        "/ru/news/research": "/news/2026-08-06-inside-the-a19-ai",
        "/ru/news/research/a13": "/news/2026-08-06-inside-the-a19-ai",
        "/news/2026-07-22-inside-the-a13-ai": "/news/2026-08-06-inside-the-a19-ai",
        "/ru/news/2026-07-22-inside-the-a13-ai": "/news/2026-08-06-inside-the-a19-ai",
        "/rules": "/knowledge-base/#rules",
        "/abilities": "/knowledge-base/#abilities",
        "/spells": "/knowledge-base/#spells",
        "/artifacts": "/knowledge-base/#artifacts",
        "/ru/rules": "/ru/knowledge-base/#rules",
        "/ru/abilities": "/ru/knowledge-base/#abilities",
        "/ru/spells": "/ru/knowledge-base/#spells",
        "/ru/artifacts": "/ru/knowledge-base/#artifacts",
    },
    integrations: [
        sitemap({
            filter: (page) => {
                const pathname = new URL(page).pathname.replace(/\/$/, "") || "/";
                return !legacyKnowledgePaths.has(pathname);
            },
        }),
    ],
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

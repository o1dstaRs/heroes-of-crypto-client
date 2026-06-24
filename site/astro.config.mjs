// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import rehypeMermaid from "rehype-mermaid";

export default defineConfig({
    site: "https://heroesofcrypto.io",
    integrations: [sitemap()],
    markdown: {
        syntaxHighlight: "shiki",
        rehypePlugins: [[rehypeMermaid, { strategy: "pre-mermaid" }]],
    },
});

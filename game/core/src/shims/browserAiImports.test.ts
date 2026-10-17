import { expect, test } from "bun:test";
import path from "node:path";
import { statSync } from "node:fs";
import { loadConfigFromFile } from "vite";

const core = path.resolve(import.meta.dir, "../..");

for (const [command, mode] of [
    ["serve", "development"],
    ["build", "production"],
] as const) {
    test(`the ${mode} browser can import the shipped A19 search with Vite's Node shims`, async () => {
        const loaded = await loadConfigFromFile({ command, mode }, path.join(core, "vite.config.js"));
        const aliases = loaded?.config.resolve?.alias as Record<string, string>;
        for (const module of ["node:fs", "node:path", "node:crypto"]) {
            expect(typeof aliases?.[module]).toBe("string");
        }
        const result = await Bun.build({
            entrypoints: [path.join(core, "src/scenes/sandboxAiSearch.ts")],
            target: "browser",
            plugins: [
                {
                    name: "actual-vite-browser-aliases",
                    setup(build) {
                        build.onResolve({ filter: /^(?:node:|@heroesofcrypto\/common$)/ }, ({ path: id }) => {
                            const replacement = aliases[id];
                            if (!replacement) return undefined;
                            return {
                                path: statSync(replacement).isDirectory()
                                    ? path.join(replacement, "index.ts")
                                    : replacement,
                            };
                        });
                    },
                },
            ],
        });
        expect(result.success).toBe(true);
        const source = await result.outputs[0].text();
        const search = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
        expect(typeof search.searchSandboxAiDecision).toBe("function");
        expect(typeof search.searchSandboxPremiumDecision).toBe("function");
    });
}

import assert from "node:assert/strict";
import path from "node:path";
import { loadConfigFromFile } from "vite";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const mode = process.argv[2];
if (mode !== "development" && mode !== "production") throw new Error("Expected development or production");
const core = path.resolve(import.meta.dir, "..");
const command = mode === "production" ? "build" : "serve";
const loaded = await loadConfigFromFile({ command, mode }, path.join(core, "vite.config.js"));
const aliases = loaded?.config.resolve?.alias as Record<string, string>;
for (const module of ["node:fs", "node:path", "node:crypto"]) assert.equal(typeof aliases?.[module], "string");
// Use a file URL: huge data URLs force the runtime to duplicate the browser bundle.
mkdirSync(path.join(core, "tmp"), { recursive: true });
const temporary = mkdtempSync(path.join(core, "tmp/browser-ai-import-"));
try {
    const bundled = await Bun.build({
        entrypoints: [path.join(core, "src/scenes/sandboxAiSearch.ts")],
        target: "browser",
        outdir: temporary,
        naming: "search.mjs",
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
    assert(bundled.success, "Expected a completed browser bundle");
    const search = await import(pathToFileURL(bundled.outputs[0].path).href);
    const exportNames = ["searchSandboxAiDecision", "searchSandboxPremiumDecision"];
    for (const name of exportNames) assert.equal(typeof search[name], "function");
    console.log(JSON.stringify({ mode, exports: exportNames }));
} finally {
    rmSync(temporary, { recursive: true, force: true });
}
process.exit(0);

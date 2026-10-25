import { resolve } from "node:path";

// Recycle the process as well as each test VM. A single process retaining hundreds of isolated
// Pixi/React module graphs can exhaust workstation memory before the final test files run.
const workspace = process.argv[2] ?? "core";
if (workspace !== "core" && workspace !== "common") throw new Error("Expected core or common workspace");
const root = resolve(import.meta.dir, workspace === "core" ? "../game/core" : "../game/heroes-of-crypto-common");
const pattern =
    workspace === "core" ? "src/**/*.{test,spec}.{ts,tsx,js,jsx}" : "{src,test}/**/*.{test,spec}.{ts,tsx,js,jsx}";
const files = [...new Bun.Glob(pattern).scanSync({ cwd: root })].sort();
if (!files.length) throw new Error("No workspace tests discovered");
let failed = false;
const batchSize = 10;
const standalone = new Set(["src/shims/browserAiImports.test.ts"]);
for (let offset = 0; offset < files.length;) {
    const next = files.slice(offset, offset + batchSize);
    const boundary = next.findIndex((file) => standalone.has(file));
    const count = boundary === 0 ? 1 : boundary > 0 ? boundary : batchSize;
    const batch = files.slice(offset, offset + count);
    console.log(`${workspace} tests ${offset + 1}–${offset + batch.length}/${files.length}`);
    const result = Bun.spawnSync({
        cmd: [
            process.execPath,
            "--smol",
            "test",
            "--isolate",
            ...(workspace === "common" ? ["--timeout", "90000"] : []),
            ...batch.map((file) => `./${file}`),
        ],
        cwd: root,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    });
    failed ||= result.exitCode !== 0;
    offset += batch.length;
}
process.exit(failed ? 1 : 0);

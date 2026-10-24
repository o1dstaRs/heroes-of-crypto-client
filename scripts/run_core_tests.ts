import { resolve } from "node:path";

// Recycle the process as well as each test VM. A single process retaining hundreds of isolated
// Pixi/React module graphs can exhaust workstation memory before the final test files run.
const root = resolve(import.meta.dir, "../game/core");
const files = [...new Bun.Glob("src/**/*.test.{ts,tsx,js}").scanSync({ cwd: root })].sort();
if (!files.length) throw new Error("No core tests discovered");
let failed = false;
const batchSize = 10;
for (let offset = 0; offset < files.length; offset += batchSize) {
    const batch = files.slice(offset, offset + batchSize);
    console.log(`Core tests ${offset + 1}–${offset + batch.length}/${files.length}`);
    const result = Bun.spawnSync({
        cmd: [process.execPath, "--smol", "test", "--isolate", ...batch.map((file) => `./${file}`)],
        cwd: root,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    });
    failed ||= result.exitCode !== 0;
}
process.exit(failed ? 1 : 0);

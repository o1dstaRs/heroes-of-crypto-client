import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const common = resolve(root, "game/heroes-of-crypto-common");

// Keep the common package's clean build steps while recycling test processes between bounded batches.
for (const args of [
    ["bun", "run", "--cwd", common, "prebuild"],
    ["bun", "run", "test:common"],
    ["bun", "run", "--cwd", common, "tsc", "-p", "tsconfig.build.json"],
    ["bun", "run", "--cwd", common, "copy-json"],
    ["bun", "run", "--cwd", common, "copy-generated"],
]) {
    const process = Bun.spawn(args, { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    const code = await process.exited;
    if (code !== 0) throw new Error(`Common build failed (${code}): ${args.join(" ")}`);
}

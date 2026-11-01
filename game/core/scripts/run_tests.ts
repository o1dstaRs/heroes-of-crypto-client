import { availableParallelism } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const hasOption = (option: string): boolean => args.some((arg) => arg === option || arg.startsWith(`${option}=`));
// Leave headroom for bundlers and child-process integration tests on small CI runners.
const workers = Math.min(availableParallelism(), process.env.CI === "true" ? 2 : 12);

const result = Bun.spawnSync({
    cmd: [
        process.execPath,
        "test",
        "--isolate",
        ...(hasOption("--parallel") ? [] : [`--parallel=${workers}`]),
        "src",
        "--path-ignore-patterns=tmp/**",
        ...(hasOption("--reporter") || args.includes("--dots") ? [] : ["--reporter=dots"]),
        ...(hasOption("--timings") ? [] : ["--timings", resolve(import.meta.dir, "test_timings.json")]),
        ...args,
    ],
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
});
process.exit(result.exitCode);

import { readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const timingsPath = resolve(import.meta.dir, "test_timings.json");
const args = process.argv.slice(2);
const hasOption = (option: string): boolean => args.some((arg) => arg === option || arg.startsWith(`${option}=`));
// Leave headroom for bundlers and child-process integration tests on small CI runners.
const workers = Math.max(
    1,
    Number(process.env.HOC_TEST_WORKERS) || Math.min(availableParallelism(), process.env.CI === "true" ? 2 : 12),
);

/**
 * Any argument (a file filter, --parallel, --timings/--update-timings, a reporter) selects bun's own
 * per-file isolated scheduler, exactly as before. It is the profiling and debugging path.
 */
function runIsolatedScheduler(): number {
    return Bun.spawnSync({
        cmd: [
            process.execPath,
            "test",
            "--isolate",
            ...(hasOption("--parallel") ? [] : [`--parallel=${workers}`]),
            "src",
            "--path-ignore-patterns=tmp/**",
            ...(hasOption("--reporter") || args.includes("--dots") ? [] : ["--reporter=dots"]),
            ...(hasOption("--timings") ? [] : ["--timings", timingsPath]),
            ...args,
        ],
        cwd: root,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    }).exitCode;
}

function discover(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...discover(path));
        else if (/\.test\.tsx?$/.test(entry.name)) found.push(relative(root, path));
    }
    return found;
}

function loadWeights(): Record<string, number> {
    try {
        return (JSON.parse(readFileSync(timingsPath, "utf8")) as { files?: Record<string, number> }).files ?? {};
    } catch {
        return {};
    }
}

/** Longest-processing-time-first packing: the heaviest file goes to the currently lightest shard. */
function shard(files: string[], count: number, weights: Record<string, number>): string[][] {
    const shards = Array.from({ length: Math.max(1, Math.min(count, files.length)) }, () => ({
        load: 0,
        files: [] as string[],
    }));
    const weight = (file: string) => weights[file] ?? 300;
    for (const file of [...files].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))) {
        const lightest = shards.reduce((best, s) => (s.load < best.load ? s : best));
        lightest.files.push(file);
        lightest.load += weight(file);
    }
    return shards.filter((s) => s.files.length).map((s) => s.files.sort());
}

interface IJob {
    label: string;
    cmd: string[];
}

interface IJobResult {
    job: IJob;
    exitCode: number;
    output: string;
    pass: number;
    fail: number;
}

async function runJob(job: IJob): Promise<IJobResult> {
    const proc = Bun.spawn({ cmd: job.cmd, cwd: root, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    const output = stdout + stderr;
    const count = (kind: string) => Number(new RegExp(`^\\s*(\\d+) ${kind}$`, "m").exec(output)?.[1] ?? 0);
    return { job, exitCode, output, pass: count("pass"), fail: count("fail") };
}

/**
 * Bun's --isolate (and --parallel) loads every module afresh for each test file. The scene tests share one
 * very large module graph (Sandbox, RenderableUnit, common), so per-file isolation spent most of the suite
 * re-parsing it. Files instead run in a few long-lived processes that load that graph once:
 *  - scene/logic files, packed into one shard per worker;
 *  - React UI files, in their own processes, because scene tests install stub DOM globals that UI
 *    libraries (emotion) capture at module load;
 *  - files that call mock.module(), which replaces a module for the rest of the process, stay isolated.
 */
async function runShardedSuite(): Promise<number> {
    const started = performance.now();
    const files = discover(join(root, "src")).sort();
    const isolated = files.filter((file) => readFileSync(join(root, file), "utf8").includes("mock.module("));
    const isolatedSet = new Set(isolated);
    const ui = files.filter((file) => !isolatedSet.has(file) && file.startsWith("src/ui/"));
    const scenes = files.filter((file) => !isolatedSet.has(file) && !file.startsWith("src/ui/"));
    const weights = loadWeights();
    const bunTest = [process.execPath, "test", "--reporter=dots"];
    const jobs: IJob[] = [
        ...shard(scenes, workers, weights).map((group, index) => ({
            label: `scenes ${index + 1}`,
            cmd: [...bunTest, ...group.map((file) => `./${file}`)],
        })),
        ...shard(ui, Math.max(1, Math.ceil(workers / 4)), weights).map((group, index) => ({
            label: `ui ${index + 1}`,
            cmd: [...bunTest, ...group.map((file) => `./${file}`)],
        })),
        ...(isolated.length
            ? [
                  {
                      label: "isolated",
                      cmd: [
                          ...bunTest,
                          "--isolate",
                          `--parallel=${Math.max(1, Math.min(workers, 4))}`,
                          ...isolated.map((file) => `./${file}`),
                      ],
                  },
              ]
            : []),
    ];

    // Heaviest jobs first; at most `workers` processes at a time.
    const queue = [...jobs];
    const results: IJobResult[] = [];
    await Promise.all(
        Array.from({ length: Math.min(workers, queue.length) }, async () => {
            for (let job = queue.shift(); job; job = queue.shift()) {
                const result = await runJob(job);
                results.push(result);
                if (result.exitCode !== 0)
                    process.stderr.write(`\n── ${job.label} (exit ${result.exitCode}) ──\n${result.output}\n`);
            }
        }),
    );

    const pass = results.reduce((sum, r) => sum + r.pass, 0);
    const fail = results.reduce((sum, r) => sum + r.fail, 0);
    const failed = results.filter((r) => r.exitCode !== 0);
    const seconds = ((performance.now() - started) / 1000).toFixed(2);
    process.stderr.write(
        `\n ${pass} pass\n ${fail} fail\nRan ${files.length} files in ${jobs.length} processes ` +
            `(${scenes.length} scene, ${ui.length} ui, ${isolated.length} isolated). [${seconds}s]\n`,
    );
    return failed.length ? 1 : 0;
}

process.exit(args.length ? runIsolatedScheduler() : await runShardedSuite());

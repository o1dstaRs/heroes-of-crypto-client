import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function fixture() {
    const directory = mkdtempSync(join(tmpdir(), "hoc-core-test-runner-"));
    const scripts = join(directory, "scripts");
    mkdirSync(scripts);
    mkdirSync(join(directory, "src"));
    mkdirSync(join(directory, "tmp/archive/src"), { recursive: true });
    const runner = join(scripts, "run_tests.ts");
    copyFileSync(new URL("../scripts/run_tests.ts", import.meta.url), runner);
    const profile = JSON.stringify({ version: 1, files: { "src/timed.test.ts": 100 } });
    writeFileSync(join(scripts, "test_timings.json"), profile);
    const passing = 'import { expect, test } from "bun:test"; test("scheduled", () => expect(1).toBe(1));';
    writeFileSync(join(directory, "src/timed.test.ts"), passing);
    writeFileSync(join(directory, "src/unlisted.test.ts"), passing.replace('"scheduled"', '"unlisted"'));
    writeFileSync(join(directory, "tmp/archive/src/retired.test.ts"), 'throw new Error("archive must not run");');
    const run = (args: string[] = []) =>
        Bun.spawnSync({
            cmd: [process.execPath, runner, ...args],
            // The package, rather than the caller's working directory, owns test discovery.
            cwd: tmpdir(),
            env: { ...process.env, CI: "true" },
            stdout: "pipe",
            stderr: "pipe",
        });
    return { directory, profile, run };
}

test("core runner discovers unlisted tests, ignores archives and propagates failures", () => {
    const f = fixture();
    try {
        const passing = f.run();
        expect(passing.exitCode, passing.stderr.toString()).toBe(0);
        expect(passing.stderr.toString()).toContain("2 pass");
        const failing = join(f.directory, "src/unlisted.test.ts");
        writeFileSync(
            failing,
            'import { expect, test } from "bun:test"; test("failure is not swallowed", () => expect(1).toBe(2));',
        );
        const failed = f.run();
        expect(failed.exitCode).not.toBe(0);
        expect(failed.stderr.toString()).toContain("failure is not swallowed");
        expect(failed.stderr.toString()).toContain("1 fail");
        expect(failed.stderr.toString()).not.toContain("archive must not run");
    } finally {
        rmSync(f.directory, { recursive: true, force: true });
    }
});

test("core runner forwards worker and timing overrides without changing its checked-in profile", () => {
    const f = fixture();
    try {
        const custom = join(f.directory, "custom-timings.json");
        writeFileSync(custom, JSON.stringify({ version: 1, files: {} }));
        const result = f.run(["--parallel=1", `--timings=${custom}`, "--update-timings"]);
        expect(result.exitCode, result.stderr.toString()).toBe(0);
        const updated = JSON.parse(readFileSync(custom, "utf8"));
        expect(Object.keys(updated.files).sort()).toEqual(["src/timed.test.ts", "src/unlisted.test.ts"]);
        expect(readFileSync(join(f.directory, "scripts/test_timings.json"), "utf8")).toBe(f.profile);
    } finally {
        rmSync(f.directory, { recursive: true, force: true });
    }
});

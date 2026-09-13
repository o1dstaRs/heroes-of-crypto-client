import { resolve } from "node:path";

/**
 * Refuse two tracked paths that differ only by letter case.
 *
 * On a case-insensitive filesystem (macOS, Windows) `ui/liveMatchBanner.ts` and `ui/LiveMatchBanner.tsx`
 * are ONE path to the OS: bun resolved `./liveMatchBanner` to the .tsx, Vite cached the wrong id until it
 * was restarted, and the page went blank with "does not provide an export named …" — while CI on Linux
 * would have been perfectly happy. Git tracks both spellings, so the clash is visible from the index
 * alone, which is what this scans (every workspace package, node_modules never tracked).
 */
const workspaceRoot = resolve(import.meta.dir, "..");
const listing = Bun.spawnSync(["git", "ls-files", "-z", "--recurse-submodules"], { cwd: workspaceRoot });
if (listing.exitCode !== 0) {
    console.error(`git ls-files failed: ${listing.stderr.toString()}`);
    process.exit(1);
}
const tracked = listing.stdout.toString().split("\0").filter(Boolean);

const byFoldedPath = new Map<string, string[]>();
for (const path of tracked) {
    // Every prefix matters: a directory that differs only by case from a sibling file or directory is the
    // same hazard as two files. Fold each path and each of its parent directories.
    const parts = path.split("/");
    for (let depth = 1; depth <= parts.length; depth += 1) {
        const prefix = parts.slice(0, depth).join("/");
        const folded = prefix.toLowerCase();
        const seen = byFoldedPath.get(folded) ?? [];
        if (!seen.includes(prefix)) {
            seen.push(prefix);
        }
        byFoldedPath.set(folded, seen);
    }
}

const collisions = [...byFoldedPath.values()].filter((spellings) => spellings.length > 1);
if (collisions.length) {
    console.error(
        "Tracked paths that differ only by case (one path on macOS/Windows, two on Linux — rename one):\n" +
            collisions.map((spellings) => `  ${spellings.join("  <->  ")}`).join("\n"),
    );
    process.exit(1);
}

console.log(`Case-collision check passed: ${tracked.length} tracked paths, no case-only duplicates.`);

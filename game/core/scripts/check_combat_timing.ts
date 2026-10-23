import { fileURLToPath } from "node:url";

/** Keep the authored animation and ranked replay checks mandatory for every client bundle. */
export async function checkCombatTiming(): Promise<void> {
    const tests = [
        "./src/scenes/RankedCombatTiming.test.ts",
        "./src/scenes/CombatExchangeAuthoredTiming.test.ts",
        "./src/scenes/CombatExchangePlayback.test.ts",
        "./src/scenes/SandboxAttackTiming.test.ts",
        "./src/scenes/OrcCounterHitTiming.test.ts",
        "./src/scenes/rangeRetaliationTargeting.test.ts",
        "./src/scenes/Sandbox.damageReactions.test.ts",
        "./src/scenes/AreaThrowImpactTiming.test.ts",
        "./src/scenes/ThroughShotImpactTiming.test.ts",
        "./src/scenes/sandbox/combat_exchange.test.ts",
    ];
    console.log("Checking combat attack/response timing before bundling…");
    const checks = Bun.spawn([process.execPath, "test", "--isolate", ...tests], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: { ...process.env, NODE_ENV: "test" },
        stdout: "inherit",
        stderr: "inherit",
    });
    if ((await checks.exited) !== 0) throw new Error("Combat timing tests failed; refusing to build the client.");
}

if (import.meta.main) await checkCombatTiming();

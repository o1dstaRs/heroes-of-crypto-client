import { existsSync } from "node:fs";
import path from "node:path";

const coreDirectory = path.resolve(import.meta.dir, "..");
const suites = [
    "./src/scenes/placementPreviewScale.test.ts",
    "./src/scenes/placementTextureReadiness.test.ts",
    "./src/scenes/DryadPlacement.test.ts",
];

export function checkPlacementRendering(): void {
    for (const suite of suites) {
        if (!existsSync(path.resolve(coreDirectory, suite))) {
            throw new Error(`Missing required placement rendering suite: ${suite}`);
        }
    }
    // Use this build's generated manifest and metadata, including its production asset omissions.
    // Keep archived releases in tmp out of Bun's test discovery.
    const result = Bun.spawnSync([process.execPath, "test", "--isolate", ...suites, "--path-ignore-patterns=tmp/**"], {
        cwd: coreDirectory,
        stdout: "inherit",
        stderr: "inherit",
    });
    if (result.exitCode !== 0) {
        throw new Error("Placement rendering check failed. Fix creature sizing before building.");
    }
}

if (import.meta.main) checkPlacementRendering();

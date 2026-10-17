import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { ANIMATION_PROFILE_DIRECTORY } from "./animation_lab_profile";

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(
    ANIMATION_PROFILE_DIRECTORY,
    "snapshots",
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
);
const manifest: Record<string, string> = {};
async function copy(relative: string): Promise<void> {
    const source = path.join(core, relative);
    const stat = await fs.stat(source);
    if (stat.isDirectory()) {
        for (const child of await fs.readdir(source)) await copy(path.join(relative, child));
        return;
    }
    if (!/\.(?:ts|tsx|scss|js|json)$/.test(relative) || relative.includes(".test.")) return;
    const bytes = await fs.readFile(source);
    const target = path.join(destination, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: "wx" });
    manifest[relative] = createHash("sha256").update(bytes).digest("hex");
}
for (const relative of [
    "src/scenes",
    "src/pixi",
    "src/settings",
    "src/generated/animation_atlases.ts",
    "src/ui/CreatureAnimationLab.tsx",
    "src/ui/CreatureAnimationLab.scss",
    "vite.config.js",
    "scripts/animation_lab_profile.ts",
    "scripts/snapshot_animation_lab.ts",
])
    await copy(relative);
await fs.copyFile(path.join(ANIMATION_PROFILE_DIRECTORY, "settings.json"), path.join(destination, "settings.json"));
await fs.writeFile(
    path.join(destination, "manifest.json"),
    `${JSON.stringify({ createdAt: new Date().toISOString(), source: core, files: manifest }, null, 2)}\n`,
    { flag: "wx" },
);
console.log(`Animation lab snapshot: ${destination} (${Object.keys(manifest).length} source files)`);

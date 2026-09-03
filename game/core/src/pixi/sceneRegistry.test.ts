import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("the app-shell scene registry does not pull PixiScene into non-battle routes", () => {
    const manager = readFileSync(join(import.meta.dir, "PixiGameManager.ts"), "utf8");
    const registry = readFileSync(join(import.meta.dir, "sceneRegistry.ts"), "utf8");

    expect(manager).toContain('import { getScenesGrouped } from "./sceneRegistry"');
    expect(manager).not.toContain('import { getScenesGrouped } from "./PixiScene"');
    expect(registry).toContain('import type { SceneConstructor, SceneEntry, SceneGroup } from "./PixiScene"');
});

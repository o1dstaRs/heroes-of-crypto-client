import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("the app-shell scene registry does not pull PixiScene into non-battle routes", () => {
    const manager = readFileSync(join(import.meta.dir, "PixiGameManager.ts"), "utf8");
    const registry = readFileSync(join(import.meta.dir, "sceneRegistry.ts"), "utf8");
    // Type-only imports are erased; any value import would bundle the Pixi runtime into the app shell.
    const valueImportFromPixiScene = /^import (?!type )[^;]*from "\.\/PixiScene";/m;

    expect(manager).toContain('import { getScenesGrouped } from "./sceneRegistry"');
    expect(manager).not.toMatch(valueImportFromPixiScene);
    expect(registry).not.toMatch(valueImportFromPixiScene);
});

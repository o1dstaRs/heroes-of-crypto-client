import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

describe("PixiScene teardown", () => {
    test("releases scene-owned children from both persistent app overlay roots", () => {
        const source = readFileSync(join(import.meta.dir, "PixiScene.ts"), "utf8");
        const destroy = source.slice(source.indexOf("public Destroy()"), source.indexOf("// ------- Delegates"));

        expect(destroy).toContain("destroyContainerChildren(this.pixiApp.getCursorOverlayRoot())");
        expect(destroy).toContain("destroyContainerChildren(this.pixiApp.getUIContainer())");
        expect(destroy.indexOf("getUIContainer()")).toBeLessThan(destroy.indexOf("this.drawer.destroy()"));
    });

    test("releases scene-leased battlefield creature textures before persistent roots are cleared", () => {
        const source = readFileSync(join(import.meta.dir, "PixiScene.ts"), "utf8");
        const destroy = source.slice(source.indexOf("public Destroy()"), source.indexOf("// ------- Delegates"));

        expect(destroy).toContain("this.releaseLazyBattlefieldTextures()");
        expect(destroy.indexOf("releaseLazyBattlefieldTextures()")).toBeLessThan(
            destroy.indexOf("destroyContainerChildren"),
        );
        expect(source).toContain("isLazyBattlefieldCreatureAssetKey(key)");
        expect(source).toContain("this.releaseLateUnclaimedTexture(key, url)");
    });
});

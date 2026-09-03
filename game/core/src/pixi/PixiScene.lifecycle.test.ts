import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

describe("PixiScene teardown", () => {
    test("reuses one viewport result on the 240 Hz visual path", () => {
        const source = readFileSync(join(import.meta.dir, "PixiScene.ts"), "utf8");
        const viewportGetter = source.slice(
            source.indexOf("public getViewportSize()"),
            source.indexOf("// ------- Drawer"),
        );

        expect(source).toContain("private readonly sc_viewportSize");
        expect(viewportGetter).toContain("return this.sc_viewportSize");
        expect(viewportGetter).not.toContain("return { width:");
    });

    test("releases scene-owned children from both persistent app overlay roots", () => {
        const source = readFileSync(join(import.meta.dir, "PixiScene.ts"), "utf8");
        const destroy = source.slice(source.indexOf("public Destroy()"), source.indexOf("// ------- Delegates"));

        expect(destroy).toContain("destroyContainerChildren(this.pixiApp.getCursorOverlayRoot())");
        expect(destroy).toContain("destroyContainerChildren(this.pixiApp.getUIContainer())");
        expect(destroy.indexOf("getUIContainer()")).toBeLessThan(destroy.indexOf("this.drawer.destroy()"));
    });

    test("releases scene-leased creature and map textures before persistent roots are cleared", () => {
        const source = readFileSync(join(import.meta.dir, "PixiScene.ts"), "utf8");
        const destroy = source.slice(source.indexOf("public Destroy()"), source.indexOf("// ------- Delegates"));

        expect(destroy).toContain("this.releaseLazyTextures()");
        expect(destroy.indexOf("releaseLazyTextures()")).toBeLessThan(destroy.indexOf("destroyContainerChildren"));
        expect(source).toContain("isLazyBattlefieldCreatureAssetKey(key)");
        expect(source).toContain("isLazyMapTextureAssetKey(key)");
        expect(source).toContain("this.releaseLateUnclaimedTexture(key, url)");
    });
});

import { expect, spyOn, test } from "bun:test";
import { CanvasTextMetrics, Container, Sprite, Text, Texture } from "pixi.js";

import { releaseBoardMirror, setBoardMirror } from "../pixi/boardMirror";
import { HoverManager, type ISandboxHoverContext } from "./HoverManager";

test("area damage and casualty rows remain readable across mirrored, resized and pooled layouts", () => {
    const root = new Container();
    const hover = new HoverManager({
        getCameraScale: () => ({ x: Math.abs(root.scale.x), y: Math.abs(root.scale.y) }),
        attachToCursorOverlay: (object: Container) => root.addChild(object),
        texAny: () => Texture.WHITE,
    } as unknown as ISandboxHoverContext);
    const visuals = hover as unknown as {
        aoeDamagePredictions: { damageText: Text; killText?: Text; killIcon?: Sprite }[];
    };
    const metrics = spyOn(CanvasTextMetrics, "measureText").mockImplementation(
        (text) =>
            ({
                width: text.length * 12,
                height: 24,
            }) as ReturnType<typeof CanvasTextMetrics.measureText>,
    );
    let reused: Text | undefined;
    try {
        for (const mirrored of [false, true, false, true]) {
            root.scale.set(mirrored ? -0.8 : 1.2, -0.6);
            setBoardMirror(root, mirrored);
            for (const casualties of [undefined, "1–3"]) {
                hover.addAOEDamagePrediction("12–34", casualties, { x: 100, y: 150 }, true, "kills");
                const visual = visuals.aoeDamagePredictions[0];
                if (reused) expect(visual.damageText).toBe(reused);
                reused = visual.damageText;
                for (const glyph of [visual.damageText, ...(casualties ? [visual.killText!, visual.killIcon!] : [])]) {
                    const origin = glyph.toGlobal({ x: 0, y: 0 });
                    expect(glyph.toGlobal({ x: 1, y: 0 }).x).toBeGreaterThan(origin.x);
                    expect(glyph.toGlobal({ x: 0, y: 1 }).y).toBeGreaterThan(origin.y);
                }
                if (casualties) {
                    const iconRight = visual.killIcon!.toGlobal({ x: visual.killIcon!.texture.width, y: 0 }).x;
                    const textLeft = visual.killText!.toGlobal({ x: 0, y: 0 }).x;
                    expect(iconRight).toBeLessThan(textLeft);
                }
                hover.clearAttackVisuals();
            }
        }
    } finally {
        metrics.mockRestore();
        releaseBoardMirror(root);
        root.destroy({ children: true });
    }
});

import { expect, spyOn, test } from "bun:test";
import { CanvasTextMetrics, Container, Sprite, Text, Texture } from "pixi.js";

import { releaseBoardMirror, setBoardMirror } from "../pixi/boardMirror";
import { HoverManager, type ISandboxHoverContext } from "./HoverManager";

test("gaze stays alongside ordinary damage and kills, upright and clear of the flag, then clears", () => {
    const root = new Container();
    const hover = new HoverManager({
        getCameraScale: () => ({ x: Math.abs(root.scale.x), y: Math.abs(root.scale.y) }),
        attachToCursorOverlay: (object: Container) => root.addChild(object),
        texAny: () => Texture.WHITE,
    } as unknown as ISandboxHoverContext);
    const visuals = hover as unknown as {
        hoverDamageText: Text;
        hoverKillText?: Text;
        hoverAbilityText?: Text;
        hoverAbilityIcon?: Sprite;
    };
    const metrics = spyOn(CanvasTextMetrics, "measureText").mockImplementation(
        (text) => ({ width: text.length * 12, height: 24 }) as ReturnType<typeof CanvasTextMetrics.measureText>,
    );
    try {
        for (const mirrored of [false, true]) {
            root.scale.set(mirrored ? -0.8 : 1.2, -0.6);
            setBoardMirror(root, mirrored);
            for (const casualties of [undefined, "1–3"]) {
                hover.drawDamagePrediction(
                    "12–34",
                    casualties,
                    { x: 100, y: 150 },
                    false,
                    "kills",
                    undefined,
                    "target",
                    {
                        text: "Gaze: 17%",
                        iconPath: "gaze",
                    },
                );
                expect(visuals.hoverDamageText.text).toBe("12–34");
                if (casualties) expect(visuals.hoverKillText!.text).toBe(casualties);
                expect(visuals.hoverAbilityText!.text).toBe("Gaze: 17%");
                for (const glyph of [visuals.hoverDamageText, visuals.hoverAbilityText!, visuals.hoverAbilityIcon!]) {
                    const origin = glyph.toGlobal({ x: 0, y: 0 });
                    expect(glyph.toGlobal({ x: 1, y: 0 }).x).toBeGreaterThan(origin.x);
                    expect(glyph.toGlobal({ x: 0, y: 1 }).y).toBeGreaterThan(origin.y);
                    expect(glyph.visible).toBe(true);
                }
                expect(visuals.hoverAbilityText!.y - visuals.hoverAbilityText!.height / 2).toBeGreaterThan(150);
                expect(visuals.hoverDamageText.y).toBeGreaterThan(visuals.hoverAbilityText!.y);
                if (casualties) {
                    expect(visuals.hoverDamageText.y).toBeGreaterThan(visuals.hoverKillText!.y);
                    expect(visuals.hoverKillText!.y).toBeGreaterThan(visuals.hoverAbilityText!.y);
                }
                hover.drawDamagePrediction("3–8", undefined, { x: 100, y: 150 }, false);
                expect(visuals.hoverAbilityText!.visible).toBe(false);
                expect(visuals.hoverAbilityIcon!.visible).toBe(false);
                hover.clearAttackVisuals();
                expect(visuals.hoverDamageText.visible).toBe(false);
                expect(visuals.hoverAbilityText!.visible).toBe(false);
            }
        }
    } finally {
        metrics.mockRestore();
        releaseBoardMirror(root);
        root.destroy({ children: true });
    }
});

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

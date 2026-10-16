import { expect, test } from "bun:test";
import { Sprite, Text, Texture } from "pixi.js";

import { HoverManager, type ISandboxHoverContext } from "./HoverManager";

test("uses the persistent cursor layer as a scene-lifetime cleanup signal", () => {
    const cursorChildren: Array<Sprite | Text> = [];
    const context = {
        attachToCursorOverlay: (child: Sprite | Text) => cursorChildren.push(child),
        attachToWorldRoot: () => undefined,
        texAny: () => Texture.WHITE,
        getCurrentActiveUnit: () => undefined,
    } as unknown as ISandboxHoverContext;
    const hover = new HoverManager(context);
    const internals = hover as unknown as {
        destroyed: boolean;
        phantomGrayscaleFilter?: { destroy(): void };
    };
    let filterDestroyCalls = 0;
    internals.phantomGrayscaleFilter = { destroy: () => filterDestroyCalls++ };

    expect(cursorChildren).toHaveLength(1);
    cursorChildren[0].destroy();

    expect(internals.destroyed).toBe(true);
    expect(internals.phantomGrayscaleFilter).toBeUndefined();
    expect(filterDestroyCalls).toBe(1);
});

test("loads hover artwork through the scene lease and drops references on teardown", async () => {
    const cursorChildren: Array<Sprite | Text> = [];
    const requestedKeys: string[] = [];
    const hover = new HoverManager({
        attachToCursorOverlay: (child: Sprite | Text) => cursorChildren.push(child),
        attachToWorldRoot: () => undefined,
        texAny: () => undefined,
        waitForTexture: async (key: string) => {
            requestedKeys.push(key);
            return Texture.WHITE;
        },
        getCurrentActiveUnit: () => undefined,
    } as unknown as ISandboxHoverContext);
    const internals = hover as unknown as {
        hoverAttackSwordTexture?: Texture;
        hoverRangeTargetEdgeTexture?: Texture;
        hoverShotHammeredBronzeCasingTexture?: Texture;
    };

    await Promise.resolve();
    expect(requestedKeys).toEqual([
        "cursor_melee",
        "shot_trajectory_gold_arrowhead_wide_socket_v6",
        "shot_trajectory_orc_bronze_arrowhead_distant_match_v8",
        "shot_trajectory_gold_fletching_wide_socket_v6",
        "shot_trajectory_orc_bronze_fletching_distant_match_v8",
        "shot_trajectory_hammered_bronze_casing_sprite_v4",
        "shot_trajectory_gold_casing_sprite_v6",
        "magic_aim_dual_helix_default_atlas",
    ]);
    expect(internals.hoverAttackSwordTexture).toBe(Texture.WHITE);
    expect(internals.hoverRangeTargetEdgeTexture).toBe(Texture.WHITE);
    expect(internals.hoverShotHammeredBronzeCasingTexture).toBe(Texture.WHITE);

    cursorChildren[0].destroy();
    expect(internals.hoverAttackSwordTexture).toBeUndefined();
    expect(internals.hoverRangeTargetEdgeTexture).toBeUndefined();
    expect(internals.hoverShotHammeredBronzeCasingTexture).toBeUndefined();
});

test("ignores duplicate lifecycle teardown", () => {
    const cursorChildren: Array<Sprite | Text> = [];
    const hover = new HoverManager({
        attachToCursorOverlay: (child: Sprite | Text) => cursorChildren.push(child),
    } as unknown as ISandboxHoverContext);
    const internals = hover as unknown as {
        phantomGrayscaleFilter?: { destroy(): void };
    };
    let filterDestroyCalls = 0;
    internals.phantomGrayscaleFilter = { destroy: () => filterDestroyCalls++ };

    cursorChildren[0].emit("destroyed", cursorChildren[0]);
    cursorChildren[0].destroy();

    expect(filterDestroyCalls).toBe(1);
});

test("keeps idle hover animation dormant between interactions", () => {
    const hover = new HoverManager({} as unknown as ISandboxHoverContext);
    const internals = hover as unknown as {
        hoverGlowPhase: number;
        hoverSelectedCells?: Array<{ x: number; y: number }>;
    };

    hover.update(1);
    expect(internals.hoverGlowPhase).toBe(0);

    internals.hoverSelectedCells = [{ x: 1, y: 1 }];
    hover.update(1);
    expect(internals.hoverGlowPhase).toBeCloseTo(5 / 3);
});

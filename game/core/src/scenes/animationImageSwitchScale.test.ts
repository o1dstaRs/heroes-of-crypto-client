import { expect, test } from "bun:test";

import type { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";

type StepUnitAnimation = (unit: RenderableUnit, timeStep: number, moving: boolean) => void;

// A frame syncs each unit's scale from its current image, then steps its animation, then draws. A Wyvern landing or
// an Abomination ending its hit switches from a half-size release atlas (drawn at twice the scale) to the full-size
// rest pose inside that step, so the frame drew the rest pose at double size: a one-frame flicker on the board.
test("a unit whose animation switches images during the step is re-synced before the frame is drawn", () => {
    const container = { label: "units" };
    const grid = { label: "grid" };
    const scene = Object.create(Sandbox.prototype) as Sandbox;
    Object.assign(scene, {
        drawer: { getUnitsContainer: () => container },
        sc_sceneSettings: { getGridSettings: () => grid },
    });
    const halfSizeWalkAtlas = { label: "wyvern_lab_walk_atlas" };
    const restPose = { label: "wyvern_battlefield_side_right_final_v1" };
    let image: object = halfSizeWalkAtlas;
    let landsThisStep = false;
    const syncs: unknown[][] = [];
    const unit = {
        getBodyTextureSource: () => image,
        stepSpawnAnimation: () => {
            if (landsThisStep) image = restPose;
        },
        syncVisual: (...args: unknown[]) => syncs.push(args),
    } as unknown as RenderableUnit;
    const step = (Sandbox.prototype as unknown as { stepUnitAnimation: StepUnitAnimation }).stepUnitAnimation;

    // Walk frames within one atlas keep the scale they were synced with: no extra work per frame.
    step.call(scene, unit, 1 / 60, true);
    expect(syncs).toEqual([]);

    landsThisStep = true;
    step.call(scene, unit, 1 / 60, true);
    expect(syncs).toEqual([[container, grid, true]]);
});

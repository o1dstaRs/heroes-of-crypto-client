import { expect, test } from "bun:test";

import { approvedAnimationAssetKeysForUnit } from "../pixi/creatureAnimationSettings";
import { TextureType, unitToTextureName } from "../pixi/PixiUnitsFactory";
import { replayTextureKeys } from "./replayTextureKeys";
import type { SandboxReplay } from "./sandbox_replay";
import { GridVals } from "@heroesofcrypto/common";
import { LAVA_PIT_ASSETS, lavaPitTextureKeys } from "../scenes/sandbox/lavaPitAssets";

test("includes initial armies and future summons before playback, respecting the requested sequence", () => {
    const state = (name: string) => ({ units: [{ properties: { name } }] });
    const replay = {
        initialState: state("Peasant"),
        actions: [{ stateAfter: state("Wolf") }, { stateAfter: state("Orc") }],
    } as unknown as SandboxReplay;
    const opening = replayTextureKeys(replay, 0);
    const withSummon = replayTextureKeys(replay, 1);
    expect(opening).toContain(unitToTextureName("Peasant", TextureType.SMALL));
    expect(opening).not.toContain(unitToTextureName("Wolf", TextureType.SMALL));
    expect(withSummon).toContain(unitToTextureName("Wolf", TextureType.SMALL));
    expect(withSummon).not.toContain(unitToTextureName("Orc", TextureType.SMALL));
    for (const key of approvedAnimationAssetKeysForUnit("Wolf")) expect(withSummon).toContain(key);
    expect(new Set(withSummon).size).toBe(withSummon.length);
});

test("prepares burning and later extinguished firepit layers before replay starts", () => {
    const state = (centerDried: boolean) => ({ gridType: GridVals.LAVA_CENTER, centerDried, units: [] });
    const replay = { initialState: state(false), actions: [{ stateAfter: state(true) }] } as unknown as SandboxReplay;
    const opening = replayTextureKeys(replay, 0);
    for (const key of lavaPitTextureKeys(false)) expect(opening).toContain(key);
    expect(opening).not.toContain(LAVA_PIT_ASSETS.extinguished);
    const complete = replayTextureKeys(replay, 1);
    for (const key of Object.values(LAVA_PIT_ASSETS)) expect(complete).toContain(key);
    expect(new Set(complete).size).toBe(complete.length);
    const normal = replayTextureKeys(
        { initialState: { gridType: GridVals.NORMAL, units: [] }, actions: [] } as unknown as SandboxReplay,
        0,
    );
    for (const key of Object.values(LAVA_PIT_ASSETS)) expect(normal).not.toContain(key);
});

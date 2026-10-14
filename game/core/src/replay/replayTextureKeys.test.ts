import { expect, test } from "bun:test";

import { approvedAnimationAssetKeysForUnit } from "../pixi/creatureAnimationSettings";
import { TextureType, unitToTextureName } from "../pixi/PixiUnitsFactory";
import { replayTextureKeys } from "./replayTextureKeys";
import type { SandboxReplay } from "./sandbox_replay";

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

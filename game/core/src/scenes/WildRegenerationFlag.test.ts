import { expect, spyOn, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";
import { Assets, Container, Texture, TextureSource } from "pixi.js";
import { RenderableUnit } from "./RenderableUnit";
import { runAiSearchSimulation } from "./aiSearchGuard";
import { CommonFlagPops, commonFlagFrameAt } from "./sandbox/CommonFlagPops";
import { animationAtlases } from "../generated/animation_atlases";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";
import { canPreviewCreatureLabState } from "../ui/creatureAnimationLabCapabilities";
const log = { getLog: () => "", updateLog: () => {}, hasBeenUpdated: () => false };
function troll() {
    const gs = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const effects = new EffectFactory();
    const unit = Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Troll", "troll_512", 1),
        gs,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    return RenderableUnit.fromBase(unit, () => undefined);
}
test("real start-of-turn healing queues exactly the restored HP once; full health stays silent", () => {
    const unit = troll();
    expect(unit.consumeRegenerationHp()).toBe(0);
    unit.setRemainingStats(unit.getAmountAlive(), unit.getMaxHp() - 17, unit.getAmountDied());
    unit.refreshPreTurnState(log);
    expect(unit.getHp()).toBe(unit.getMaxHp());
    expect(unit.consumeRegenerationHp()).toBe(17);
    expect(unit.consumeRegenerationHp()).toBe(0);
    unit.refreshPreTurnState(log);
    expect(unit.consumeRegenerationHp()).toBe(0);
    expect(canPreviewCreatureLabState(unit.getUnitProperties(), "wild_regeneration")).toBe(true);
});
test("speculative AI activation never emits healing VFX", () => {
    const unit = troll();
    unit.setRemainingStats(unit.getAmountAlive(), unit.getMaxHp() - 9, unit.getAmountDied());
    runAiSearchSimulation(() => unit.refreshPreTurnState(log));
    expect(unit.consumeRegenerationHp()).toBe(0);
});
test("regeneration follows the flag, deduplicates, expires at 650 ms and cleans up its sprites", async () => {
    const meta = animationAtlases["Vfx Wild Regeneration"].pop;
    expect(meta.frameCount).toBe(16);
    expect(meta.frameDurationsMs!.reduce((a, b) => a + b, 0)).toBe(960);
    expect(commonFlagFrameAt("wild_regeneration", 959)).toBe(15);
    expect(commonFlagFrameAt("wild_regeneration", 960)).toBeUndefined();
    expect(isLazyCombatEffectAssetKey("vfx_wild_regeneration_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_wild_regeneration_pop_atlas")).toBe(false);
    const source = new TextureSource({ width: 1536, height: 1536 });
    const load = spyOn(Assets, "load").mockResolvedValue(new Texture({ source }) as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    let now = 0;
    const root = new Container();
    root.scale.set(-0.8, -0.5);
    const anchor = { x: 100, y: 200 };
    const layer = new CommonFlagPops(
        "wild_regeneration",
        (c) => {
            root.addChild(c);
        },
        () => now,
    );
    try {
        await layer.spawn("troll", anchor, 64, () => anchor);
        await layer.spawn("troll", anchor, 64, () => anchor);
        expect(root.children).toHaveLength(1);
        anchor.x = 130;
        now = 500;
        layer.update(0);
        expect(root.children[0].x).toBe(130);
        expect(root.children[0].scale.y).toBeCloseTo(-1.6);
        now = 650;
        layer.update(0);
        expect(root.children).toHaveLength(0);
        expect(source.destroyed).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
        root.destroy({ children: true });
    }
});

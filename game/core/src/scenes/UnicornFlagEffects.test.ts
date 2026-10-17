import { expect, mock, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { animationAtlases } from "../generated/animation_atlases";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";
import { canPreviewCreatureLabState } from "../ui/creatureAnimationLabCapabilities";
import { animatableEffectNames } from "./effect_pops";
import { Sandbox } from "./Sandbox";
import { commonFlagFrameAt } from "./sandbox/CommonFlagPops";
import { OneInTheFieldTriggers } from "./sandbox/OneInTheFieldTriggers";

test("both unicorn symbols play all sixteen cels in one real second and load on demand", () => {
    for (const [name, kind, asset] of [
        ["Vfx Unicorn One In The Field", "unicorn_retaliation", "vfx_unicorn_one_in_the_field_pop_atlas"],
        ["Vfx Unicorn Blindness", "unicorn_blindness", "vfx_unicorn_blindness_pop_atlas"],
    ] as const) {
        const meta = animationAtlases[name].pop;
        expect(meta.frameCount).toBe(16);
        expect(meta.frameWidth).toBe(384);
        let elapsed = 0;
        for (const [i, duration] of meta.frameDurationsMs!.entries()) {
            expect(commonFlagFrameAt(kind, elapsed)).toBe(i);
            expect(commonFlagFrameAt(kind, elapsed + duration - 0.01)).toBe(i);
            elapsed += duration;
        }
        expect(elapsed).toBe(1000);
        expect(meta.loopDurationMs).toBe(1000);
        expect(commonFlagFrameAt(kind, 1000)).toBeUndefined();
        for (const key of [asset, asset + "_quarter"]) {
            expect(isLazyCombatEffectAssetKey(key)).toBe(true);
            expect(isProductionOmittedAssetKey(key)).toBe(false);
        }
    }
});

const application = (resisted = false): GameEvent[] => [
    {
        type: "effects_applied",
        applications: [{ unitId: "victim", name: "Blindness", kind: "debuff", resisted }],
    },
];

test("blindness shows only confirmed recipients and preserves the source horn flash without a duplicate static icon", () => {
    let dead = false,
        enabled = true;
    const victim = { getId: () => "victim", isDead: () => dead };
    const source = {
        getName: () => "Unicorn",
        hasAbilityActive: () => enabled,
        flashUnicornBlindness: mock(() => true),
    };
    const spawnCommonFlagPop = mock<(unit: unknown, kind: string) => void>(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), { combatVisuals: { spawnCommonFlagPop } });
    scene.spawnUnicornBlindnessVfx(undefined, source, victim);
    scene.spawnUnicornBlindnessVfx(application(true), source, victim);
    expect(spawnCommonFlagPop).not.toHaveBeenCalled();
    scene.spawnUnicornBlindnessVfx(application(), source, victim);
    expect(spawnCommonFlagPop).toHaveBeenLastCalledWith(victim, "unicorn_blindness");
    expect(source.flashUnicornBlindness).toHaveBeenCalledTimes(1);
    enabled = false;
    scene.spawnUnicornBlindnessVfx(application(), source, victim);
    enabled = true;
    dead = true;
    scene.spawnUnicornBlindnessVfx(application(), source, victim);
    expect(spawnCommonFlagPop).toHaveBeenCalledTimes(1);
    expect(animatableEffectNames(["Blindness", "Slow"])).toEqual(new Set(["Slow"]));
});

test("lab controls expose each symbol only to ability owners and preview it on the selected flag", () => {
    const selected = { name: "Unicorn", abilities: ["One in the Field", "Blindness"], spells: [] };
    const spawnCommonFlagPop = mock<(unit: unknown, kind: string) => void>(() => undefined);
    const unit = { getName: () => "Unicorn", hasAbilityActive: (name: string) => selected.abilities.includes(name) };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        combatVisuals: { spawnCommonFlagPop },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
        moveAnimManager: { isMoving: () => false },
    });
    for (const state of ["unicorn_retaliation", "unicorn_blindness"] as const) {
        expect(canPreviewCreatureLabState(selected, state)).toBe(true);
        expect(canPreviewCreatureLabState({ name: "Pikeman", abilities: [], spells: [] }, state)).toBe(false);
        expect(scene.playCreatureAnimationLabState(state).ok).toBe(true);
        expect(spawnCommonFlagPop).toHaveBeenLastCalledWith(unit, state);
    }
});

test("shared live/replay exchange shows the horn from the second incoming action per round and the eye over the blinded enemy", async () => {
    const unit = (id: string, unicorn = false) => ({
        getId: () => id,
        getName: () => (unicorn ? "Unicorn" : "Pikeman"),
        isDead: () => false,
        hasAbilityActive: () => unicorn,
        flashUnicornBlindness: mock(() => true),
        getAnimationTextureKey: () => undefined,
        getVisualCenter: () => ({ x: 0, y: 0 }),
        getDamagePredictionAnchor: () => ({ x: 0, y: 100 }),
    });
    const victim = unit("victim"),
        source = unit("source", true);
    const spawnCommonFlagPop = mock<(unit: unknown, kind: string) => void>(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        oneInTheFieldTriggers: new OneInTheFieldTriggers(),
        sc_sceneSettings: { getGridSettings: () => ({}) },
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["victim", victim],
                    ["source", source],
                ]),
        },
        isSceneDestroyed: () => false,
        prepareDirectionalAttackState: () => "attack",
        offsetReplayDamagePosition: (p: unknown) => p,
        playReplayOneShot: async () => {},
        playReplayProjectile: async (_a: unknown, _b: unknown, _pos: unknown, impact: () => void) => impact(),
        playFireShieldPassives: async () => {},
        combatVisuals: { spawnCommonFlagPop, showFloatingDamage: () => {} },
    });
    const strike = {
        attackerId: "source",
        targetId: "victim",
        response: true,
        hitIndex: 0,
        lethal: false,
        amount: 10,
        unitsDied: 0,
    };
    const incoming = { ...strike, attackerId: "victim", targetId: "source", response: false };
    const exchange = (lap: number, events: GameEvent[] = [], ranged = false) =>
        scene.playCombatExchange(
            victim,
            source,
            { attackType: ranged ? "range" : "melee" },
            ranged ? [incoming] : [incoming, strike, { ...incoming, hitIndex: 1 }],
            () => {},
            undefined,
            events,
            false,
            undefined,
            lap,
        );
    // A double blow plus retaliation is still the first incoming attack action.
    await exchange(1, application());
    expect(spawnCommonFlagPop.mock.calls).toEqual([[victim, "unicorn_blindness"]]);
    spawnCommonFlagPop.mockClear();
    await exchange(1, application(true));
    expect(spawnCommonFlagPop.mock.calls).toEqual([[source, "unicorn_retaliation"]]);
    spawnCommonFlagPop.mockClear();
    // Further incoming attacks show the horn even if there is no response strike.
    await exchange(1, [], true);
    expect(spawnCommonFlagPop.mock.calls).toEqual([[source, "unicorn_retaliation"]]);
    spawnCommonFlagPop.mockClear();
    await exchange(2);
    expect(spawnCommonFlagPop).not.toHaveBeenCalled();
    // An outgoing Unicorn attack does not display its defensive symbol.
    await scene.playCombatExchange(
        source,
        victim,
        { attackType: "melee" },
        [{ ...strike, response: false }],
        () => {},
        undefined,
        application(true),
        false,
        undefined,
        2,
    );
    expect(spawnCommonFlagPop).not.toHaveBeenCalled();
    await exchange(2);
    expect(spawnCommonFlagPop.mock.calls).toEqual([[source, "unicorn_retaliation"]]);
});

test("incoming attack counters belong to each defender and clear for a rematch", () => {
    const triggers = new OneInTheFieldTriggers();
    expect(triggers.recordAttack("unicorn-a", 1)).toBe(false);
    expect(triggers.recordAttack("unicorn-a", 1)).toBe(true);
    expect(triggers.recordAttack("unicorn-b", 1)).toBe(false);
    expect(triggers.recordAttack("unicorn-b", 1)).toBe(true);
    expect(triggers.recordAttack("unicorn-a", 2)).toBe(false);
    expect(triggers.recordAttack("unicorn-a", 2)).toBe(true);
    triggers.clear();
    expect(triggers.recordAttack("unicorn-a", 2)).toBe(false);
});

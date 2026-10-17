import { expect, mock, test } from "bun:test";
import { OneInTheFieldTriggers } from "./sandbox/OneInTheFieldTriggers";
import type { IVisibleDamage } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { fireShieldCasterIds } from "./sandbox/fireShieldCasters";

const damage = (burned = "striker", overrides: Partial<IVisibleDamage> = {}): IVisibleDamage => ({
    amount: 10,
    render: true,
    unitId: "efreet",
    unitPosition: { x: 0, y: 0 },
    unitIsSmall: true,
    secondary: [{ source: "fire_shield", unitId: burned, amount: 4, unitsDied: 0, position: { x: 0, y: 0 } }],
    ...overrides,
});

function fixture() {
    const efreet = {
        getId: () => "efreet",
        getName: () => "Efreet",
        isDead: () => false,
        hasAbilityActive: (ability: string) => ability === "Fire Shield",
        isPlayingOneShotAnimation: () => false,
        getAnimationTextureKey: () => "efreet_lab_cast_atlas",
    };
    const play = mock(async (): Promise<void> => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([["efreet", efreet]]) },
        waitForTexture: mock(async () => true),
        isSceneDestroyed: () => false,
        playReplayOneShot: play,
    });
    return { scene, efreet, play };
}

test("Fire Shield animates its owner, including reflection during a counterattack", () => {
    expect(fireShieldCasterIds("striker", "efreet", damage())).toEqual(["efreet"]);
    expect(fireShieldCasterIds("efreet", "striker", damage("striker", { unitId: "striker" }))).toEqual(["efreet"]);
    expect(fireShieldCasterIds("striker", "clicked", damage())).toEqual(["efreet"]);
});

test("misses, zero reflection and unrelated secondary damage cannot trigger the passive", () => {
    expect(fireShieldCasterIds("striker", "efreet", damage("striker", { missed: true }))).toEqual([]);
    expect(fireShieldCasterIds("striker", "efreet", damage("striker", { secondary: [] }))).toEqual([]);
    const zero = damage();
    zero.secondary![0].amount = 0;
    expect(fireShieldCasterIds("striker", "efreet", zero)).toEqual([]);
    zero.secondary![0].amount = 5;
    zero.secondary![0].source = "fire_breath";
    expect(fireShieldCasterIds("striker", "efreet", zero)).toEqual([]);
});

test("AOE owners are included and repeated reflections animate each owner only once", () => {
    const hit = damage();
    hit.secondary!.push({ ...hit.secondary![0] });
    hit.splash = [{ unitId: "other-efreet", amount: 8, unitsDied: 0, position: { x: 1, y: 1 } }];
    expect(fireShieldCasterIds("striker", "efreet", hit)).toEqual(["efreet", "other-efreet"]);
});

test("combat uses the lab cast atlas and waits for the authored animation to finish", async () => {
    const { scene, efreet, play } = fixture();
    let finish!: () => void;
    const completed = new Promise<void>((resolve) => {
        finish = resolve;
    });
    play.mockImplementation(() => completed);
    let settled = false;
    const playback = scene.playFireShieldPassives("striker", "efreet", damage()).then(() => {
        settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(scene.waitForTexture).toHaveBeenCalledWith("efreet_lab_cast_atlas");
    expect(play).toHaveBeenCalledWith(efreet, "cast", 3000);
    expect(settled).toBe(false);
    finish();
    await playback;
    expect(settled).toBe(true);
});

test("dead, already casting and non-Efreet units are not restarted", async () => {
    for (const overrides of [
        { isDead: () => true },
        { getName: () => "Peasant" },
        { hasAbilityActive: () => false },
        { isPlayingOneShotAnimation: (state: string) => state === "cast" },
        { isPlayingOneShotAnimation: (state: string) => state === "death" },
    ]) {
        const { scene, efreet, play } = fixture();
        Object.assign(efreet, overrides);
        await scene.playFireShieldPassives("striker", "efreet", damage());
        expect(play).not.toHaveBeenCalled();
    }
});

test("the shared live/replay exchange waits for the shield after physical blows", async () => {
    const { scene, efreet } = fixture();
    const order: string[] = [];
    const striker = { ...efreet, getId: () => "striker" };
    Object.assign(scene, {
        oneInTheFieldTriggers: new OneInTheFieldTriggers(),
        sc_sceneSettings: { getGridSettings: () => ({}) },
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["striker", striker],
                    ["efreet", efreet],
                ]),
        },
        prepareDirectionalAttackState: () => "melee_attack",
        playReplayOneShot: async () => {
            order.push("attack");
        },
        playFireShieldPassives: async () => {
            order.push("shield");
        },
    });
    Object.assign(striker, { getVisualCenter: () => ({ x: 0, y: 0 }) });
    Object.assign(efreet, { getVisualCenter: () => ({ x: 1, y: 1 }) });
    await scene.playCombatExchange(
        striker,
        efreet,
        { attackType: "melee", damage: damage() },
        [
            {
                attackerId: "striker",
                targetId: "efreet",
                amount: 0,
                unitsDied: 0,
                lethal: false,
                response: false,
                hitIndex: 0,
            },
        ],
        () => undefined,
    );
    expect(order).toEqual(["attack", "shield"]);
});

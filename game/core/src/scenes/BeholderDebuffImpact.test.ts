import { expect, test } from "bun:test";
import { Sandbox } from "./Sandbox";
import { OneInTheFieldTriggers } from "./sandbox/OneInTheFieldTriggers";

test("Spit Ball pops on the projectile victim at contact, before hit recovery, exactly once", async () => {
    const unit = (id: string) => ({
        getId: () => id,
        getName: () => "Orc",
        hasAbilityActive: () => false,
        isDead: () => false,
        isPlayingOneShotAnimation: () => false,
        getAnimationTextureKey: () => undefined,
        getVisualCenter: () => ({ x: id === "A" ? 0 : 100, y: 0 }),
        getDamagePredictionAnchor: () => ({ x: 0, y: 100 }),
        flashDebuffDarken: () => undefined,
        flashBuffApplied: () => undefined,
    });
    const a = unit("A"),
        b = unit("B");
    const popped: string[] = [];
    const finish: (() => void)[] = [];
    let contact!: () => void;
    let land!: () => void;
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        oneInTheFieldTriggers: new OneInTheFieldTriggers(),
        sc_sceneSettings: { getGridSettings: () => ({}) },
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["A", a],
                    ["B", b],
                ]),
        },
        pendingEffectPops: [
            { unit: b, debuffs: ["Curse", "Weakness", "Stun"], buffs: ["Blessing"], flash: "debuff" },
            { unit: a, debuffs: ["Sadness"], buffs: [], flash: "debuff" },
        ],
        isSceneDestroyed: () => false,
        prepareDirectionalAttackState: () => "attack",
        offsetReplayDamagePosition: (to: unknown) => to,
        combatVisuals: { showFloatingDamage: () => undefined },
        popEffectOnUnit: (u: typeof a, name: string) => popped.push(`${u.getId()}:${name}`),
        playReplayOneShot: () => new Promise<void>((resolve) => finish.push(resolve)),
        playReplayProjectile: (_a: unknown, _b: unknown, _pos: unknown, hit: () => void) => {
            contact = hit;
            return new Promise<void>((resolve) => {
                land = resolve;
            });
        },
    });
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "range" },
        [{ attackerId: "A", targetId: "B", response: false, hitIndex: 0, lethal: false, amount: 10, unitsDied: 0 }],
        () => {},
    );
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(popped).toEqual([]);
    contact();
    expect(popped).toEqual(["B:Curse", "B:Weakness"]);
    contact();
    expect(popped).toHaveLength(2);
    expect(scene.pendingEffectPops.map((entry: { debuffs: string[] }) => entry.debuffs)).toEqual([
        ["Stun"],
        ["Sadness"],
    ]);
    land();
    finish.splice(0).forEach((resolve) => resolve());
    await pending;
    scene.flushEffectPops();
    expect(popped.filter((name) => name === "B:Curse")).toHaveLength(1);
    expect(popped).toContain("B:Stun");
    expect(popped).toContain("B:Blessing");
});

test("the battle visual layer hides the motif group until its captured damage overlay is destroyed", async () => {
    const { Container, Texture, TextureSource } = await import("pixi.js");
    const { CombatVisuals } = await import("./sandbox/CombatVisuals");
    const root = new Container();
    const damage = new Container();
    const atlas = new Texture({ source: new TextureSource({ width: 1024, height: 1024 }) });
    const unit = {
        getId: () => "victim",
        isDead: () => false,
        getFlagEffectAnchor: () => ({ x: 100, y: 200 }),
        getDamagePredictionAnchor: () => ({ x: 100, y: 200 }),
    };
    const visuals = Object.assign(Object.create(CombatVisuals.prototype), {
        context: {
            getGridSettings: () => ({ getCellSize: () => 64 }),
            getUnitsHolder: () => ({ getAllUnits: () => new Map([["victim", unit]]) }),
            attachToWorldRoot: (node: InstanceType<typeof Container>) => root.addChild(node),
        },
        floatingTexts: [{ container: damage, startX: 100, startY: 242 }],
    });
    visuals.spawnDebuffPop({ x: 100, y: 200 }, atlas, "Curse", 0, "debuff", unit);
    expect(root.children[0].visible).toBe(false);
    damage.destroy();
    visuals.beholderDebuffPops.update();
    expect(root.children[0].visible).toBe(true);
    expect(root.children[0].x).toBe(100);
    expect(root.children[0].y).toBe(200);
    visuals.beholderDebuffPops.clear();
    expect(atlas.source.destroyed).toBe(false);
    atlas.destroy(true);
});

import { expect, spyOn, test } from "bun:test";
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
    let readyTextures!: () => void;
    const textures = new Promise<void>((resolve) => {
        readyTextures = resolve;
    });
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
        waitForTexture: () => textures,
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
    expect(contact).toBeUndefined();
    readyTextures();
    for (let i = 0; i < 20; i++) await Promise.resolve();
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

test("the battle visual layer holds damage and every debuff at fixed positions", async () => {
    const { Container, Rectangle, Texture, TextureSource } = await import("pixi.js");
    const { CombatVisuals } = await import("./sandbox/CombatVisuals");
    const root = new Container();
    root.scale.y = -1;
    const atlas = new Texture({ source: new TextureSource({ width: 1024, height: 1024 }) });
    let now = 1000;
    const clock = spyOn(performance, "now").mockImplementation(() => now);
    const flag = { x: 100, y: 200 };
    const unit = {
        getId: () => "victim",
        isDead: () => false,
        getFlagEffectAnchor: () => flag,
        getDamagePredictionAnchor: () => flag,
    } as unknown as import("./RenderableUnit").RenderableUnit;
    const visuals = new CombatVisuals({
        getGridSettings: () => ({ getCellSize: () => 64 }),
        getUnitsHolder: () => ({ getAllUnits: () => new Map([["victim", unit]]) }),
        attachToWorldRoot: (node: InstanceType<typeof Container>) => {
            root.addChild(node);
        },
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    } as unknown as import("./sandbox/CombatVisuals").ICombatVisualsContext);
    try {
        visuals.showFloatingDamage(flag, 25, undefined, 0, undefined, undefined, flag);
        const damage = root.children[0];
        damage.boundsArea = new Rectangle(-40, -36, 80, 72);
        for (const name of ["Curse", "Sadness", "Quagmire", "Weakening Beam", "Weakness", "Rangebane", "Cowardice"])
            visuals.spawnDebuffPop(flag, atlas, name, 0, "debuff", unit);
        const motif = root.children[1];
        expect(motif.visible).toBe(true);
        visuals.update(0);
        const initialDamage = { x: damage.x, y: damage.y };
        const initialMotif = { x: motif.x, y: motif.y };
        for (const age of [20, 65, 125, 350, 600]) {
            now = 1000 + age;
            visuals.update(0);
            expect(damage.destroyed).toBe(false);
            expect(motif.visible).toBe(true);
            expect({ x: damage.x, y: damage.y }).toEqual(initialDamage);
            expect({ x: motif.x, y: motif.y }).toEqual(initialMotif);
            const bounds = motif.getBounds();
            expect((bounds.minX + bounds.maxX) / 2).toBeCloseTo(100);
            expect(motif.getBounds().maxY).toBeLessThan(damage.getBounds().minY);
        }
    } finally {
        visuals.clear();
        clock.mockRestore();
        expect(atlas.source.destroyed).toBe(false);
        atlas.destroy(true);
    }
});

test("first local application is queued before contact and cleanup does not replay it", async () => {
    let debuffs: string[] = [];
    const popped: string[] = [];
    const unit = {
        getId: () => "victim",
        getDebuffs: () => debuffs.map((name) => ({ getName: () => name })),
        getEffects: () => [],
        getBuffs: () => [],
        isDead: () => false,
        flashDebuffDarken: () => {},
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        shownDebuffsByUnit: new Map(),
        shownBuffsByUnit: new Map(),
        pendingEffectPops: [],
        unitsHolder: { getAllUnits: () => new Map([["victim", unit]]) },
        waitForTexture: async () => ({}),
        isStrikeInFlight: () => false,
        popEffectOnUnit: (_unit: unknown, name: string) => popped.push(name),
    });
    scene.reconcileEffectVisuals();
    debuffs = ["Weakening Beam", "Rangebane", "Cowardice", "Quagmire"];
    scene.reconcileEffectVisuals(true);
    expect(popped).toEqual([]);
    expect(scene.pendingEffectPops).toHaveLength(1);
    scene.flushBeholderEffectPops("other-victim");
    expect(popped).toEqual([]);
    scene.flushBeholderEffectPops("victim");
    expect(popped).toEqual(debuffs);
    scene.reconcileEffectVisuals();
    scene.flushEffectPops();
    expect(popped).toEqual(debuffs);
});

test("cold debuff textures start their full presentation when ready and never target a retired scene", async () => {
    let now = 1000;
    const clock = spyOn(performance, "now").mockImplementation(() => now);
    let ready!: (texture: object) => void;
    const calls: unknown[][] = [];
    const unit = { getId: () => "victim", isDead: () => false, getFlagEffectAnchor: () => ({ x: 10, y: 20 }) };
    const visuals = { spawnDebuffPop: (...args: unknown[]) => calls.push(args) };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([["victim", unit]]) },
        sc_sceneSettings: { getGridSettings: () => ({}) },
        combatVisuals: visuals,
        isSceneDestroyed: () => false,
        waitForTexture: () =>
            new Promise((resolve) => {
                ready = resolve;
            }),
    });
    try {
        scene.popEffectOnUnit(unit, "Quagmire", 0, "debuff");
        now = 2500;
        ready({});
        await Promise.resolve();
        expect(calls).toHaveLength(1);
        expect(calls[0][6]).toBe(2500);
        expect(calls[0][5]).toBe(unit);
        scene.popEffectOnUnit(unit, "Rangebane", 1, "debuff");
        scene.combatVisuals = {};
        ready({});
        await Promise.resolve();
        expect(calls).toHaveLength(1);
    } finally {
        clock.mockRestore();
    }
});

test("committed attack keeps effect pops held while textures are loading", () => {
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_moveBlocked: true,
        replayPlaybackActive: false,
        isPlayingActionAnimation: () => false,
    });
    expect(scene.isStrikeInFlight()).toBe(true);
    scene.sc_moveBlocked = false;
    expect(scene.isStrikeInFlight()).toBe(false);
});

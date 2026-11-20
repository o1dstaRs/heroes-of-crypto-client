import { expect, spyOn, test } from "bun:test";
import { Sandbox } from "./Sandbox";
import { OneInTheFieldTriggers } from "./sandbox/OneInTheFieldTriggers";

test("Spit Ball and the other effects pop on the projectile victim at contact, before hit recovery, exactly once", async () => {
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
    // Optional debuff art cannot hold the attack behind a cold status-atlas download.
    expect(contact).toBeDefined();
    readyTextures();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    contact();
    // Spit Ball motifs lead; every other effect this blow put on B lands with the same contact.
    expect(popped.slice(0, 2)).toEqual(["B:Curse", "B:Weakness"]);
    expect(popped).toContain("B:Stun");
    expect(popped).toContain("B:Blessing");
    const atContact = popped.length;
    contact();
    expect(popped).toHaveLength(atContact);
    // The attacker's own pop waits for a blow that lands on it.
    expect(scene.pendingEffectPops.map((entry: { debuffs: string[] }) => entry.debuffs)).toEqual([["Sadness"]]);
    land();
    finish.splice(0).forEach((resolve) => resolve());
    await pending;
    scene.flushEffectPops();
    expect(popped.filter((name) => name === "B:Curse")).toHaveLength(1);
    expect(popped.filter((name) => name === "B:Stun")).toHaveLength(1);
    expect(popped).toContain("A:Sadness");
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
        // The debuff row fades in; once it shows, the number and the row are placed for good.
        now = 1020;
        visuals.update(0);
        const initialDamage = { x: damage.x, y: damage.y };
        const initialMotif = { x: motif.x, y: motif.y };
        // However wide the debuff row, the number stays close to its own flag.
        expect(Math.abs(damage.x - flag.x)).toBeLessThanOrEqual(60);
        for (const age of [65, 125, 350, 600]) {
            now = 1000 + age;
            visuals.update(0);
            expect(damage.destroyed).toBe(false);
            expect(motif.visible).toBe(true);
            expect({ x: damage.x, y: damage.y }).toEqual(initialDamage);
            expect({ x: motif.x, y: motif.y }).toEqual(initialMotif);
            // The debuff row keeps its height and sits beside the damage instead of above it.
            const bounds = motif.getBounds();
            const number = damage.getBounds();
            expect(bounds.maxX <= number.minX || bounds.minX >= number.maxX).toBe(true);
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

test("a status cue that re-seats itself every frame ends each frame to the right of the damage", async () => {
    const { Container, Rectangle } = await import("pixi.js");
    const { CombatVisuals } = await import("./sandbox/CombatVisuals");
    const root = new Container();
    root.scale.y = -1;
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
        // Dulling Defense and the other common pops snap their container onto the flag in update().
        const cue = new Container();
        cue.boundsArea = new Rectangle(-40, -80, 80, 80);
        cue.scale.y = -1;
        const internals = visuals as unknown as {
            attachFlagOverlay: (container: unknown, zIndex: number, follow: () => unknown) => void;
            commonFlagPops: Map<string, { update(dt: number): void; clear(): void }>;
            floatingTexts: { container: InstanceType<typeof Container> }[];
        };
        internals.attachFlagOverlay(cue, 5520, () => ({ ...flag, unitId: "victim" }));
        internals.commonFlagPops.set("dulling", {
            update: () => cue.position.set(flag.x, flag.y),
            clear: () => undefined,
        });
        visuals.update(0);
        // The number and the cue are centred on the flag together; the cue still starts past the number.
        const damageX = internals.floatingTexts[0].container.x;
        expect(cue.x - 40).toBeGreaterThanOrEqual(damageX + 80);
        expect(damageX).toBeLessThan(flag.x);
    } finally {
        visuals.clear();
    }
});

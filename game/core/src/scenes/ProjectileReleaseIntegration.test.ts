import { expect, mock, test } from "bun:test";
import { BufferImageSource, Container, Texture } from "pixi.js";
import type { GridSettings } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import type { RenderableUnit } from "./RenderableUnit";
import type { IFireProjectileOptions } from "./sandbox/RangedProjectiles";
import { RangedProjectiles } from "./sandbox/RangedProjectiles";

type ProjectileScene = {
    fireUnitProjectile(unit: RenderableUnit, options: IFireProjectileOptions): Promise<void>;
};

const flush = async () => {
    for (let index = 0; index < 24; index++) await Promise.resolve();
};

const fixture = (name: string, lab = false) => {
    const from = { x: 0, y: 100 };
    const events: string[] = [];
    const shots: IFireProjectileOptions[] = [];
    const controller = new AbortController();
    let release: (() => void) | undefined;
    let cancel: (() => void) | undefined;
    const deferRelease = (_state: string, onRelease: () => void, onCancel: () => void) => {
        release = onRelease;
        cancel = onCancel;
        return true;
    };
    const deferArrow = (_state: string, _shot: unknown, onRelease: () => void) => {
        release = onRelease;
        cancel = () => controller.abort();
        return true;
    };
    const shot = { signal: controller.signal, abort: () => controller.abort() };
    const unit = {
        getName: () => name,
        getPosition: () => from,
        getVisualCenter: () => from,
        getProjectileImpactPoint: () => from,
        getRangedProjectileOrigin: () => from,
        getCannonballDiameter: () => 100,
        getGargantuanRockDiameter: () => 70,
        getGargantuanRockHeight: () => 60,
        getMonkOrbRadius: () => 20,
        getDryadArrowLength: () => 30,
        getOrcProjectileAppearance: () => ({ length: 30, rotation: 0, facing: 1 }),
        getAnimationTextureKey: () => "attack-atlas",
        hasAnimationState: () => true,
        hasMonkLabRanged: () => name === "Monk",
        setBoardFacing: () => {},
        playOrcRangedThrow: deferRelease,
        playCentaurLabRangedThrow: deferRelease,
        playMonkLabRangedThrow: deferRelease,
        playBeholderRangedShot: deferRelease,
        playCyclopsLabRangedThrow: deferRelease,
        playGargantuanRangedThrow: deferRelease,
        playCannonLabRangedShot: deferRelease,
        prepareDryadRangedShot: () => shot,
        prepareArbalesterRangedShot: () => shot,
        playDryadRangedShot: deferArrow,
        playArbalesterRangedShot: deferArrow,
        finishOrcRangedThrow: () => {},
        finishCyclopsLabRangedThrow: () => {},
        finishDryadRangedShot: () => {},
        finishArbalesterRangedShot: () => {},
        catchZenaChakram: () => {},
    } as unknown as RenderableUnit;
    const evaluateRangeAttack = mock(() => ({
        affectedUnits: [],
        attackObstacle: { position: { x: 300, y: 100 } },
    }));
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        creatureAnimationLabEnabled: lab,
        sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 100 }) },
        unitsHolder: { getAllUnits: () => new Map() },
        attackHandler: { evaluateRangeAttack },
        isSceneDestroyed: () => false,
        scheduleSceneTimeout: () => 1,
        clearSceneTimeout: () => {},
        waitForTexture: () => Promise.resolve(Texture.EMPTY),
        waitForProjectileHitReaction: () => Promise.resolve(true),
        playUnitCombatSound: (_unit: RenderableUnit, role: string) => events.push(role),
        rangedProjectiles: {
            prepare: () => Promise.resolve(),
            fire: (options: IFireProjectileOptions) => {
                events.push("projectile");
                shots.push(options);
                return Promise.resolve();
            },
        },
    }) as ProjectileScene;
    return {
        scene,
        unit,
        events,
        shots,
        evaluateRangeAttack,
        release: () => release!(),
        cancel: () => cancel!(),
    };
};

const options = (extra: Partial<IFireProjectileOptions> = {}): IFireProjectileOptions => ({
    from: { x: 0, y: 100 },
    to: { x: 500, y: 100 },
    big: false,
    ...extra,
});

const authoredShots = [
    { name: "Orc", flags: { orcAxe: true } },
    { name: "Centaur", flags: { centaurSpear: true } },
    { name: "Dryad", flags: { dryadArrow: true } },
    { name: "Elf", flags: { elfArrow: true } },
    { name: "Medusa", flags: { medusaSerpent: true } },
    { name: "Arbalester", flags: { arbalesterBolt: true } },
    { name: "Monk", flags: { monkOrb: true } },
    { name: "Beholder", flags: { beholderEye: true } },
    { name: "Cyclops", flags: { cyclopsRock: true } },
    { name: "Gargantuan", flags: { gargantuanRock: true } },
    { name: "Zena", flags: { chakram: true, chakramDeferReturn: true } },
    {
        name: "Tsar Cannon",
        lab: true,
        flags: { tsarCannonball: true, cannonImpactPosition: { x: 500, y: 100 } },
    },
] satisfies { name: string; lab?: boolean; flags: Partial<IFireProjectileOptions> }[];

test.each([false, true])(
    "an exchange's Zena disc has one flight owner after primary contact, ricochet=%s",
    async (bounce) => {
        const f = fixture("Zena");
        const world = new Container();
        const projectiles = new RangedProjectiles({
            getGridSettings: () => ({ getCellSize: () => 100 }) as GridSettings,
            attachToWorldRoot: (object) => {
                world.addChild(object);
            },
        });
        const texture = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 512, height: 512 }),
        });
        const state = projectiles as unknown as {
            zenaChakramTexture: Texture;
            projectiles: { dist: number; speed: number }[];
        };
        state.zenaChakramTexture = texture;
        Object.assign(f.scene, { rangedProjectiles: projectiles });
        const from = { x: 0, y: 100 };
        const to = { x: 500, y: 100 };
        const target = { getProjectileImpactPoint: () => to } as unknown as RenderableUnit;
        const scene = f.scene as unknown as {
            getReplayProjectileOptions(
                attacker: RenderableUnit,
                target: RenderableUnit,
                position: undefined,
                impact: () => void,
                chakram: boolean,
            ): IFireProjectileOptions;
        };
        let contacts = 0;
        let continuation = Promise.resolve();
        const impact = () => {
            contacts++;
            continuation = projectiles.fireAlongPath(bounce ? [to, { x: 500, y: 300 }, from] : [to, from], {
                big: false,
                chakram: true,
            });
        };
        try {
            const opts = scene.getReplayProjectileOptions(f.unit, target, undefined, impact, true);
            const outgoing = f.scene.fireUnitProjectile(f.unit, opts);
            await flush();
            f.release();
            await flush();
            expect(state.projectiles).toHaveLength(1);
            const first = state.projectiles[0];
            projectiles.update(first.dist / first.speed);
            await flush();
            expect(contacts).toBe(1);
            // The exchange continues the ricochet/return. The first leg must not ALSO fly home.
            expect(state.projectiles).toHaveLength(1);
            projectiles.update(10);
            await Promise.all([outgoing, continuation]);
            expect(projectiles.hasActive()).toBe(false);
        } finally {
            projectiles.destroy();
            texture.destroy(true);
            world.destroy({ children: true });
        }
    },
);

test("a standalone Zena shot still owns its automatic return and catches once", async () => {
    const f = fixture("Zena");
    const catchDisc = mock();
    const impact = mock();
    Object.assign(f.unit, { catchZenaChakram: catchDisc });
    const pending = f.scene.fireUnitProjectile(f.unit, options({ chakram: true, onImpact: impact }));
    await flush();
    f.release();
    await pending;
    expect(f.shots).toHaveLength(1);
    expect(f.shots[0].returnToOrigin).toBe(true);
    expect(f.shots[0].onImpact).toBeUndefined();
    f.shots[0].onWaypoint?.(0);
    expect(impact).toHaveBeenCalledTimes(1);
    expect(catchDisc).toHaveBeenCalledTimes(1);
});

test("a non-authored projectile sounds once when it launches", async () => {
    const f = fixture("Trent");
    await f.scene.fireUnitProjectile(f.unit, options({ vine: true }));
    expect(f.events).toEqual(["attack", "projectile"]);
});

test.each(authoredShots)("$name attack audio starts once at its authored release", async ({ name, flags, lab }) => {
    const f = fixture(name, lab);
    const pending = f.scene.fireUnitProjectile(f.unit, options(flags));
    await flush();
    expect(f.events).toEqual([]);
    f.release();
    await pending;
    expect(f.events).toEqual(["attack", "projectile"]);
    expect(f.shots).toHaveLength(1);
});

test.each(authoredShots)(
    "a cancelled $name release makes neither sound nor projectile",
    async ({ name, flags, lab }) => {
        const f = fixture(name, lab);
        const pending = f.scene.fireUnitProjectile(f.unit, options(flags));
        await flush();
        f.cancel();
        await pending;
        expect(f.events).toEqual([]);
        expect(f.shots).toEqual([]);
    },
);

test("a piercing cannon retains its supplied endpoint through the real launch helper", async () => {
    const f = fixture("Tsar Cannon");
    const endpoint = { x: 1600, y: 100 };
    const onProgress = mock();
    const onImpact = mock();
    await f.scene.fireUnitProjectile(
        f.unit,
        options({ tsarCannonball: true, cannonPiercing: true, to: endpoint, onProgress, onImpact }),
    );
    expect(f.evaluateRangeAttack).not.toHaveBeenCalled();
    expect(f.shots).toHaveLength(1);
    expect(f.shots[0].to).toEqual(endpoint);
    expect(f.shots[0].onProgress).toBe(onProgress);
    expect(f.shots[0].onImpact).toBe(onImpact);
});

import { expect, mock, test } from "bun:test";
import { Texture } from "pixi.js";
import { Sandbox } from "./Sandbox";
import type { RenderableUnit } from "./RenderableUnit";
import type { IFireProjectileOptions } from "./sandbox/RangedProjectiles";

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

import { afterEach, expect, test } from "bun:test";
import { Container, Texture } from "pixi.js";
import { FightStateManager, GridMath, GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { DungeonVisuals } from "./sandbox/DungeonVisuals";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";
import type { IFireProjectileOptions } from "./sandbox/RangedProjectiles";

if (!("document" in globalThis)) {
    (globalThis as { document?: unknown }).document = {
        createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
        querySelector: () => null,
    };
}
const gs = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
const cleanups: (() => void)[] = [];
afterEach(() =>
    cleanups
        .splice(0)
        .reverse()
        .forEach((cleanup) => cleanup()),
);

function fixture(row = 1, mirrored = false) {
    const fightState = FightStateManager.getInstance();
    const previous = fightState.getFightProperties();
    fightState.reset();
    const root = new Container();
    root.scale.set(mirrored ? -1 : 1, -1);
    const visuals = new DungeonVisuals({
        getStage: () => root,
        getWorldRoot: () => root,
        getViewportSize: () => ({ width: 1024, height: 1024 }),
        getGridSettings: () => gs,
        texAny: () => undefined,
        attachToWorldRoot: (node, depth = 0) => {
            node.zIndex = depth;
            root.addChild(node);
        },
    });
    const internals = visuals as unknown as {
        mountainTileTextures: Texture[];
        mountainHitPointTileTextures: Texture[];
        scatteredMountainSprites: Container[];
    };
    internals.mountainTileTextures = [new Texture({ source: Texture.WHITE.source })];
    internals.mountainHitPointTileTextures = [new Texture({ source: Texture.WHITE.source })];
    const cell = { x: 3, y: row };
    visuals.setScatteredMountains([{ ...cell, variant: 0 }], true);
    const sprite = internals.scatteredMountainSprites[0];
    const logical = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
    cleanups.push(() => {
        visuals.destroy();
        root.destroy({ children: true });
        fightState.setFightProperties(previous);
    });
    return { visuals, sprite, logical };
}

test.each([1, 14])("barrel contact hits the painted body at row %s in either board orientation", (row) => {
    for (const mirrored of [false, true]) {
        const { visuals, sprite, logical } = fixture(row, mirrored);
        const contact = visuals.getObstacleProjectileImpactPoint(logical);
        // Artwork occupies the lower half of each atlas tile, with its middle at 75% of tile height.
        const frameHeight = (sprite as unknown as { height: number }).height;
        expect(contact.x).toBeCloseTo(sprite.x, 8);
        expect(contact.y).toBeCloseTo(sprite.y - frameHeight / 4, 8);
        expect(contact).not.toEqual(logical);
        expect(contact.y).toBeGreaterThan(projectBattlefieldPoint(logical, gs).y);
    }
});

test.each(["Elf", "Arbalester", "Dryad", "Orc", "Tsar Cannon"])(
    "%s aims every obstacle shot and muzzle at the captured visual contact",
    async (name) => {
        const { visuals, logical } = fixture(14);
        const contact = visuals.getObstacleProjectileImpactPoint(logical);
        const launches: IFireProjectileOptions[] = [];
        const aims: HoCMath.XY[] = [];
        const positions = [{ ...logical }, { ...logical }];
        const original = structuredClone(positions);
        const unit = {
            getName: () => name,
            getVisualCenter: () => ({ x: 0, y: 0 }),
            getRangedProjectileOrigin: (target: HoCMath.XY) => {
                aims.push(target);
                return { x: -500, y: 100 };
            },
        };
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            sc_sceneSettings: { getGridSettings: () => gs },
            dungeonVisuals: visuals,
            isSceneDestroyed: () => false,
            showRepeatedAttackFlag: () => {},
            combatVisuals: {},
            fireUnitProjectile: async (_unit: unknown, options: IFireProjectileOptions) => {
                launches.push(options);
            },
        });
        const order: number[] = [];
        await scene.animateObstacleStrikeSequence(unit, positions, undefined, (index: number) => {
            order.push(index);
            if (index === 0) visuals.setScatteredMountains([], true);
        });
        expect(launches.map((launch) => launch.to)).toEqual([contact, contact]);
        expect(aims).toEqual([contact, contact]);
        expect(order).toEqual([0, 1]);
        expect(positions).toEqual(original);
        if (name === "Tsar Cannon")
            expect(launches.map((launch) => launch.cannonImpactPosition)).toEqual([contact, contact]);
    },
);

test("a non-barrel obstacle still projects its recorded ground point once", () => {
    const { visuals } = fixture();
    const point = { x: 30, y: 1200 };
    expect(visuals.getObstacleProjectileImpactPoint(point)).toEqual(projectBattlefieldPoint(point, gs));
});

test("a real barrel arrow cannot become an animation-lab free shot and reports contact once", async () => {
    const { visuals, logical } = fixture(14);
    const contact = visuals.getObstacleProjectileImpactPoint(logical);
    const abort = new AbortController();
    const shot = { signal: abort.signal, abort: () => abort.abort() };
    const launches: IFireProjectileOptions[] = [];
    let freeShots = 0;
    const unit = {
        getName: () => "Elf",
        getVisualCenter: () => ({ x: -500, y: 0 }),
        getRangedProjectileOrigin: () => ({ x: -500, y: 100 }),
        getElfLabFreeShotTarget: () => {
            freeShots++;
            return { x: 10, y: 10 };
        },
        prepareDryadRangedShot: () => shot,
        finishDryadRangedShot: () => {},
        getAnimationTextureKey: () => "elf-attack",
        setBoardFacing: () => {},
        getDryadArrowLength: () => 30,
        playDryadRangedShot: (_state: unknown, _shot: unknown, release: () => void) => {
            release();
            return true;
        },
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        creatureAnimationLabEnabled: true,
        sc_sceneSettings: { getGridSettings: () => gs },
        dungeonVisuals: visuals,
        isSceneDestroyed: () => false,
        scheduleSceneTimeout: () => 1,
        clearSceneTimeout: () => {},
        playUnitCombatSound: () => {},
        showRepeatedAttackFlag: () => {},
        waitForTexture: async () => Texture.WHITE,
        rangedProjectiles: {
            prepare: async () => {},
            fire: async (options: IFireProjectileOptions) => {
                launches.push(options);
                options.onImpact?.();
            },
        },
        fireUnitProjectile: (source: unknown, options: IFireProjectileOptions) =>
            scene.fireDryadLabProjectile(source, options, "attack"),
    });
    const contacts: number[] = [];
    await scene.animateObstacleStrikeSequence(unit, [logical], undefined, (index: number) => contacts.push(index));
    expect(freeShots).toBe(0);
    expect(launches.map((launch) => launch.to)).toEqual([contact]);
    expect(contacts).toEqual([0]);
});

import { expect, mock, test } from "bun:test";
import { Texture } from "pixi.js";
import { Sandbox } from "../Sandbox";
import { CombatVisuals } from "./CombatVisuals";

const cases = [
    ["Riot", "ogre_riot"],
    ["Mass Riot", "ogre_riot"],
    ["Magic Mirror", "ogre_magic_mirror"],
    ["Mass Magic Mirror", "ogre_magic_mirror"],
    ["Empower", "empower"],
    ["Made of Fire", "made_of_fire"],
    ["Battle Roar", "battle_roar"],
    ["Blessing", undefined],
] as const;

test.each(cases)("%s reveals its own effect on the current monk after the hand", (name, kind) => {
    const makeUnit = (id: string) => ({
        getId: () => id,
        isDead: () => false,
        getFlagEffectAnchor: () => ({ x: 100, y: 200 }),
        flashBuffApplied: mock(() => undefined),
    });
    const victim = makeUnit("enemy"),
        thief = makeUnit("monk"),
        rebuilt = makeUnit("monk");
    const units = new Map([
        ["enemy", victim],
        ["monk", thief],
    ]);
    let reveal!: () => void;
    let texture: Texture | undefined;
    const common = mock(() => undefined),
        roar = mock(() => undefined);
    const visuals = Object.assign(Object.create(CombatVisuals.prototype), {
        context: {
            getGridSettings: () => ({ getCellSize: () => 64 }),
            getUnitsHolder: () => ({ getAllUnits: () => units }),
        },
        borrowedGracePops: {
            spawn: (
                _from: unknown,
                _cell: number,
                icon: Texture | undefined,
                _source: unknown,
                _recipient: unknown,
                onReveal: () => void,
            ) => {
                texture = icon;
                reveal = onReveal;
                return Promise.resolve();
            },
        },
        spawnCommonFlagPop: common,
        spawnBattleRoarPop: roar,
    });
    visuals.spawnBorrowedGrace(victim, thief, name, Texture.WHITE);
    expect(texture).toBe(kind ? undefined : Texture.WHITE);
    expect(common).not.toHaveBeenCalled();
    expect(roar).not.toHaveBeenCalled();
    expect(thief.flashBuffApplied).not.toHaveBeenCalled();
    units.set("monk", rebuilt);
    reveal();
    expect(rebuilt.flashBuffApplied).toHaveBeenCalledTimes(1);
    if (kind === "battle_roar") expect(roar).toHaveBeenCalledWith(rebuilt);
    else if (kind) expect(common).toHaveBeenCalledWith(rebuilt, kind);
    else {
        expect(common).not.toHaveBeenCalled();
        expect(roar).not.toHaveBeenCalled();
    }
});

test.each(cases)("%s loads an icon only when no authored buff animation exists", async (name, kind) => {
    const victim = { getId: () => "enemy" },
        thief = { getId: () => "monk", isDead: () => false };
    const spawn = mock(() => undefined);
    const texture = mock(async () => Texture.WHITE);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        combatVisuals: { spawnBorrowedGrace: spawn },
        isSceneDestroyed: () => false,
        unitsHolder: { getAllUnits: () => new Map([["monk", thief]]) },
        waitForTexture: texture,
    });
    scene.showBorrowedGraceTransfer(victim, thief, name);
    await Promise.resolve();
    if (kind) {
        expect(texture).not.toHaveBeenCalled();
        expect(spawn).toHaveBeenCalledWith(victim, thief, name);
    } else {
        expect(texture).toHaveBeenCalledTimes(1);
        expect(spawn).toHaveBeenCalledWith(victim, thief, name, Texture.WHITE);
    }
});

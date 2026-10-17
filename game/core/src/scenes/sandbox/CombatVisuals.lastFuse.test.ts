import { expect, mock, test } from "bun:test";
import { GridSettings, type UnitsHolder, type GameEvent } from "@heroesofcrypto/common";
import { Container, Graphics, Sprite } from "pixi.js";
import { Sandbox } from "../Sandbox";
import { projectBattlefieldPoint } from "./BattlefieldVisualGrid";
import { CombatVisuals } from "./CombatVisuals";

function fixture() {
    const attached: Container[] = [];
    const units = new Map();
    const visuals = new CombatVisuals({
        getGridSettings: () => undefined as unknown as GridSettings,
        attachToWorldRoot: (object: Container, zIndex = 0) => {
            object.zIndex = zIndex;
            attached.push(object);
        },
        getUnitsHolder: () => ({ getAllUnits: () => units }) as unknown as UnitsHolder,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    });
    return { visuals, attached, units };
}

const target = () => ({ isDead: () => false, flashScorch: mock(), applyHitReaction: mock() });

test("a Last Fuse body disappears on the first visible explosion frame", () => {
    const { visuals, attached } = fixture();
    const removeBody = mock();
    visuals.spawnPyreExplosion({ x: 100, y: 100 }, 64, 0.18, removeBody);
    visuals.update(0.1);
    expect(removeBody).not.toHaveBeenCalled();
    expect(attached[0].visible).toBe(false);
    visuals.update(0.1);
    expect(removeBody).toHaveBeenCalledTimes(1);
    expect(attached[0].visible).toBe(true);
    visuals.update(0.1);
    expect(removeBody).toHaveBeenCalledTimes(1);
    visuals.clear();
});

test("a skipped explosion frame or reset still cleans up the replaced body", () => {
    const { visuals } = fixture();
    const skipped = mock();
    visuals.spawnPyreExplosion({ x: 0, y: 0 }, 64, 0.18, skipped);
    visuals.update(5);
    expect(skipped).toHaveBeenCalledTimes(1);
    const reset = mock();
    visuals.spawnPyreExplosion({ x: 0, y: 0 }, 64, 0.18, reset);
    visuals.clear();
    expect(reset).toHaveBeenCalledTimes(1);
});

test("Last Fuse waits for the chain delay, throws solid chunks through the fire, then disposes every child", () => {
    const { visuals, attached } = fixture();
    visuals.spawnPyreExplosion({ x: 100, y: 100 }, 64, 0.4);
    const effect = attached[0];
    const chunks = effect.children.filter((child) => child.constructor === Container);
    expect(chunks.length).toBeGreaterThan(5);
    expect(effect.children.some((child) => child instanceof Sprite)).toBe(true);
    visuals.update(0.2);
    expect(effect.visible).toBe(false);
    visuals.update(0.3);
    expect(effect.visible).toBe(true);
    expect(chunks.some((chunk) => Math.abs(chunk.x) > 5)).toBe(true);
    const firstPosition = { x: chunks[0].x, y: chunks[0].y };
    visuals.update(0.3);
    expect({ x: chunks[0].x, y: chunks[0].y }).not.toEqual(firstPosition);
    const children = [...effect.children];
    visuals.update(2);
    expect(effect.destroyed).toBe(true);
    expect(children.every((child) => child.destroyed)).toBe(true);
});

test("a delayed hit resolves the current unit after a ranked rebuild and recoils away from the blast once", () => {
    const { visuals, units, attached } = fixture();
    const oldUnit = target();
    const replacement = target();
    units.set("victim", oldUnit);
    visuals.spawnPyreHit("victim", { x: 100, y: 0 }, { x: 0, y: 0 }, 64, 0.36);
    visuals.update(0.18);
    expect(oldUnit.flashScorch).not.toHaveBeenCalled();
    visuals.clear({ keepDetachedOverlays: true });
    units.set("victim", replacement);
    visuals.update(0.2);
    expect(attached[0].visible).toBe(true);
    expect(oldUnit.flashScorch).not.toHaveBeenCalled();
    expect(replacement.flashScorch).toHaveBeenCalledTimes(1);
    expect(replacement.applyHitReaction).toHaveBeenCalledWith(19.2, 0);
    visuals.update(0.1);
    expect(replacement.flashScorch).toHaveBeenCalledTimes(1);
    visuals.update(2);
    expect(attached[0].destroyed).toBe(true);
});

test("a blast-killed target still gets its impact at the event position without a live sprite", () => {
    const { visuals, attached } = fixture();
    visuals.spawnPyreHit("removed", { x: 140, y: 90 }, { x: 70, y: 90 }, 64);
    expect(() => visuals.update(0.1)).not.toThrow();
    expect(attached[0].position.x).toBe(140);
    expect(attached[0].position.y).toBe(90);
    expect(attached[0].visible).toBe(true);
    expect(
        attached[0].children.some((child) => child instanceof Graphics && child.context.instructions.length > 0),
    ).toBe(true);
});

test("a scene reset cancels pending hit reactions and disposes visible and queued explosions", () => {
    const { visuals, units, attached } = fixture();
    const unit = target();
    units.set("victim", unit);
    visuals.spawnPyreExplosion({ x: 0, y: 0 }, 64);
    visuals.spawnPyreExplosion({ x: 64, y: 0 }, 64, 0.5);
    visuals.spawnPyreHit("victim", { x: 64, y: 0 }, { x: 0, y: 0 }, 64, 0.5);
    visuals.update(0.1);
    visuals.clear();
    visuals.update(1);
    expect(attached.every((object) => object.destroyed)).toBe(true);
    expect(unit.flashScorch).not.toHaveBeenCalled();
});

test("Last Fuse renders only actual blast hits and keeps their damage above the explosion", () => {
    const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
    const visuals = {
        spawnPyreExplosion: mock(),
        spawnPyreHit: mock(),
        showFloatingDamageDelayed: mock(),
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        combatVisuals: visuals,
        sc_sceneSettings: { getGridSettings: () => settings },
        unitsHolder: { getAllUnits: () => new Map() },
        triggerScreenShake: mock(),
    }) as { renderPyreExplosion(event: GameEvent, delay: number): void };
    const position = { x: 0, y: 1024 };
    const hitPosition = { x: 128, y: 1024 };
    scene.renderPyreExplosion(
        {
            type: "pyre_exploded",
            unitId: "dead",
            position,
            hits: [
                { unitId: "hit", position: hitPosition, amount: 80, unitsDied: 1 },
                { unitId: "absorbed", position: hitPosition, amount: 0, unitsDied: 0 },
            ],
        },
        0.18,
    );
    expect(visuals.spawnPyreExplosion).toHaveBeenCalledTimes(1);
    expect(visuals.spawnPyreHit).toHaveBeenCalledTimes(1);
    expect(visuals.spawnPyreHit).toHaveBeenCalledWith(
        "hit",
        projectBattlefieldPoint(hitPosition, settings),
        projectBattlefieldPoint(position, settings),
        128,
        0.18,
    );
    expect(visuals.showFloatingDamageDelayed).toHaveBeenCalledWith(
        projectBattlefieldPoint(hitPosition, settings),
        80,
        1,
        0.18,
        "#ff9a48",
        "#4a1208",
        undefined,
        4560,
    );
});

test("Last Fuse delayed damage draws above airborne fragments", () => {
    const { visuals, attached } = fixture();
    visuals.spawnPyreExplosion({ x: 0, y: 0 }, 64);
    visuals.showFloatingDamageDelayed({ x: 64, y: 0 }, 80, 0, 0, "#ff9a48", "#4a1208", undefined, 4560);
    visuals.update(0.05);
    expect(attached.at(-1)!.zIndex).toBeGreaterThan(attached[0].zIndex);
    visuals.clear();
});

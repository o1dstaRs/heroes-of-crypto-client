import { expect, spyOn, test } from "bun:test";
import { Container, Graphics, Texture } from "pixi.js";
import type { GridSettings, UnitsHolder } from "@heroesofcrypto/common";
import type { RenderableUnit } from "../RenderableUnit";
import { CombatVisuals } from "./CombatVisuals";
import { MagicReflectionPops } from "./MagicReflectionPops";

function fixture() {
    const root = new Container();
    const makeUnit = (x: number, y: number) =>
        ({
            getId: () => "mirror-holder",
            getFlagEffectAnchor: () => ({ x, y }),
        }) as unknown as RenderableUnit;
    const unit = makeUnit(100, 200);
    const units = new Map([[unit.getId(), unit]]);
    // Normal scenes omit legacyEffectsEnabled. Reflection feedback must still be visible.
    const visuals = new CombatVisuals({
        getGridSettings: () => ({ getCellSize: () => 64 }) as GridSettings,
        attachToWorldRoot: (container) => {
            root.addChild(container);
        },
        getUnitsHolder: () => ({ getAllUnits: () => units }) as unknown as UnitsHolder,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    });
    return { root, visuals, unit, units, makeUnit };
}

test("live reflections flash a pane, return a shard, survive hydration and expire at main's timing", () => {
    const f = fixture();
    try {
        f.visuals.spawnMagicMirrorRebound({ x: 100, y: 200 }, { x: 500, y: 200 }, 64);
        expect(f.root.children).toHaveLength(1);
        const effect = f.root.children[0];
        const [pane, shard] = effect.children as Graphics[];
        expect(shard.visible).toBe(false);
        // The event captured the holder's position even if this hit removes it from the board.
        f.units.clear();

        f.visuals.update(0.05);
        expect(pane.context.instructions.length).toBeGreaterThan(0);
        expect(shard.visible).toBe(false);

        f.visuals.clear({ keepDetachedOverlays: true });
        expect(effect.destroyed).toBe(false);
        f.visuals.update(0.1);
        expect(shard.visible).toBe(true);
        expect(shard.context.instructions.length).toBeGreaterThan(0);

        f.visuals.update(0.28);
        expect(effect.destroyed).toBe(false);
        f.visuals.update(0.02);
        expect(effect.destroyed).toBe(true);
        expect(f.root.children).toHaveLength(0);
    } finally {
        f.visuals.clear();
    }
});

test("live reflection enables its flag cue without opting other effects into archived mode", () => {
    const f = fixture();
    const spawn = spyOn(MagicReflectionPops.prototype, "spawn").mockResolvedValue();
    try {
        f.visuals.spawnMagicReflectionPop(f.unit);
        expect(spawn).toHaveBeenCalledTimes(1);
        const [id, anchor, cellSize, follow] = spawn.mock.calls[0];
        expect(id).toBe("mirror-holder");
        expect(anchor).toEqual({ x: 100, y: 200 });
        expect(cellSize).toBe(64);
        f.units.set(id, f.makeUnit(150, 250));
        expect(follow?.()).toMatchObject({ x: 150, y: 250 });

        const pos = { x: 100, y: 200 };
        f.visuals.spawnFireBurn(pos, 64);
        f.visuals.spawnFireSweep(pos, { x: 500, y: 200 }, 64);
        f.visuals.spawnPoisonCloud(pos, 64);
        f.visuals.spawnResurrectionBurst(pos, 64);
        let arrivals = 0;
        f.visuals.spawnAbilityGift(pos, { x: 500, y: 200 }, 64, "Wild Regeneration", "gifted", Texture.WHITE, () => {
            arrivals++;
        });
        expect(arrivals).toBe(1);
        expect(f.root.children).toHaveLength(0);
    } finally {
        spawn.mockRestore();
        f.visuals.clear();
    }
});

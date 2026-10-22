import { expect, spyOn, test } from "bun:test";
import { GridConstants, GridSettings, type UnitsHolder } from "@heroesofcrypto/common";
import { Assets, Container, Texture } from "pixi.js";

import { images } from "../../generated/image_imports";
import { CombatVisuals } from "./CombatVisuals";

test("ranked hydration preserves the halo for its dissolve and loads its shared artwork once", async () => {
    const root = new Container();
    const settings = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const properties = { applied_buffs: ["Ember Covenant Blessing"], applied_buffs_laps: [15] };
    const unit = {
        getUnitProperties: () => properties,
        getBlessingHaloFrame: () => ({ x: 320, y: 450, width: 32, height: 14, zIndex: 4001 }),
        isDead: () => false,
    };
    const units = new Map([["ally", unit]]);
    const load = spyOn(Assets, "load").mockImplementation(() => Promise.resolve(Texture.WHITE));
    const visuals = new CombatVisuals({
        getGridSettings: () => settings,
        getUnitsHolder: () => ({ getAllUnits: () => units }) as unknown as UnitsHolder,
        attachToWorldRoot: (node) => {
            root.addChild(node);
        },
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    });
    try {
        visuals.update(0.3);
        await Promise.resolve();
        const halo = root.children.find((node) => node.label === "ember-covenant-ring")!;
        expect(halo).toBeDefined();
        for (let frame = 0; frame < 60; frame++) visuals.update(1 / 60);
        expect(load).toHaveBeenCalledTimes(1);
        expect(load).toHaveBeenCalledWith(images.ember_covenant_ring);
        visuals.clear({ keepDetachedOverlays: true });
        expect(halo.destroyed).toBe(false);
        units.set("ally", { ...unit, getUnitProperties: () => ({ applied_buffs: [], applied_buffs_laps: [] }) });
        visuals.update(0.2);
        expect(halo.destroyed).toBe(false);
        expect(halo.children[0].alpha).toBeLessThan(1);
        visuals.update(0.66);
        expect(halo.destroyed).toBe(true);
        visuals.clear();
        expect(Texture.WHITE.destroyed).toBe(false);
    } finally {
        visuals.clear();
        root.destroy({ children: true });
        load.mockRestore();
    }
});

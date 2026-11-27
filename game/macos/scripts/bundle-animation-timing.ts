import { writeFileSync } from "node:fs";
import { BufferImageSource, Container, DOMAdapter, Texture } from "../../core/node_modules/pixi.js/lib/index.mjs";

import { RenderableUnit } from "../../core/src/scenes/RenderableUnit";
import { UNIT_ID_TO_NAME } from "../../core/src/ui/unit_ui_constants";
import { ToFactionName } from "../../heroes-of-crypto-common/src/factions/faction_type";
import { PBTypes } from "../../heroes-of-crypto-common/src/generated/protobuf/v1/types";
import { createCombatFactories, createUnitFromSpec } from "../../heroes-of-crypto-common/src/simulation/army";
import { simulationGridSettings } from "../../heroes-of-crypto-common/src/simulation/battle_engine";
import { allCreatureIds, getFactionOf, getLevelOf } from "../../heroes-of-crypto-common/src/units/unit_properties";

const output = process.argv[2];
if (!output) throw new Error("Pass the destination for animation-timing.json.");

// A headless texture supplies atlas dimensions to the real renderer. No Pixi application or
// artwork is loaded to measure the frame clock that the browser uses.
const adapter = DOMAdapter.get();
DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement });
const fakeTexture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 16384, height: 16384 }),
});
const { abilityFactory, effectFactory } = createCombatFactories();
const grid = simulationGridSettings();
const world = new Container();
type OneShot = { frames: unknown[]; frameDurationsMs?: number[]; durationPerFrame: number };
const states = [
    "attack",
    "attack_up",
    "attack_down",
    "melee_attack",
    "melee_attack_up",
    "melee_attack_down",
    "cast",
    "hit",
    "death",
];
const result: Record<string, Record<string, number[]>> = {};
try {
    for (const id of allCreatureIds) {
        const name = UNIT_ID_TO_NAME[id];
        const level = getLevelOf(id);
        if (level <= 0) continue;
        const team = PBTypes.TeamVals.LEFT;
        const base = createUnitFromSpec(
            { creatureName: name, faction: ToFactionName[getFactionOf(id)], level, amount: 10, size: 1 },
            team,
            grid,
            abilityFactory,
            effectFactory,
            false,
            "mac-animation-timing",
        );
        const unit = RenderableUnit.fromBase(base, () => fakeTexture);
        unit.setPosition(0, 4 * grid.getCellSize());
        unit.ensureVisual(world, grid);
        const clips: Record<string, number[]> = {};
        for (const state of states) {
            unit.returnToIdleAnimation();
            if (!unit.playOneShotAnimation(state, undefined, true)) continue;
            const shot = (unit as unknown as { oneShotAnim?: OneShot }).oneShotAnim;
            if (!shot) continue;
            const durations = shot.frames.map((_, i) => shot.frameDurationsMs?.[i] ?? shot.durationPerFrame);
            if (durations.length && durations.every((duration) => Number.isFinite(duration) && duration > 0)) {
                clips[state] = durations;
            }
        }
        result[name] = clips;
        unit.destroyVisuals();
    }
} finally {
    world.destroy({ children: true });
    fakeTexture.destroy(true);
    DOMAdapter.set(adapter);
}
if (Object.values(result).filter((clips) => Object.keys(clips).length > 0).length < 40) {
    throw new Error("Could not export the web creature timing catalogue.");
}
writeFileSync(output, JSON.stringify(result));

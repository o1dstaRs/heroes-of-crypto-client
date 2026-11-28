import { writeFileSync } from "node:fs";
import { BufferImageSource, Container, DOMAdapter, Texture } from "../../core/node_modules/pixi.js/lib/index.mjs";

import { RenderableUnit } from "../../core/src/scenes/RenderableUnit";
import { MELEE_EXCHANGE_MIN_HOLD_MS } from "../../core/src/scenes/sandbox/combat_exchange";
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
const holds: Record<string, Record<string, readonly number[]>> = {};
const lethalMeleeHolds: Record<string, Record<string, number>> = {};
const meleeMinimumHolds: Record<string, number> = {};
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
        const clips: Record<string, readonly number[]> = {};
        const lethal: Record<string, number> = {};
        for (const state of states) {
            unit.returnToIdleAnimation();
            if (!unit.playOneShotAnimation(state, undefined, true)) continue;
            const playback = unit.getAnimationAtlasPlayback("action");
            if (!playback?.holdsMs.length || !playback.holdsMs.every((hold) => Number.isFinite(hold) && hold > 0))
                continue;
            clips[state] = playback.holdsMs;
            if (state.startsWith("melee_attack")) {
                unit.hastenLethalMeleeRecovery();
                const recovery = unit.getAnimationAtlasPlayback("action");
                if (recovery) lethal[state] = recovery.holdsMs.reduce((sum, hold) => sum + hold, 0);
            }
        }
        holds[name] = clips;
        lethalMeleeHolds[name] = lethal;
        if (level > 2) meleeMinimumHolds[name] = MELEE_EXCHANGE_MIN_HOLD_MS;
        unit.destroyVisuals();
    }
} finally {
    world.destroy({ children: true });
    fakeTexture.destroy(true);
    DOMAdapter.set(adapter);
}
if (Object.values(holds).filter((clips) => Object.keys(clips).length > 0).length < 40) {
    throw new Error("Could not export the web creature timing catalogue.");
}
writeFileSync(output, JSON.stringify({ holds, lethalMeleeHolds, meleeMinimumHolds }));

import { approvedAnimationAssetKeysForUnit } from "../pixi/creatureAnimationSettings";
import { TextureType, unitToTextureName } from "../pixi/PixiUnitsFactory";
import type { SandboxReplayActionRecord } from "./sandbox_replay";
import { GridVals } from "@heroesofcrypto/common";
import type { SandboxSceneState } from "../scenes/Sandbox";
import { lavaPitTextureKeys } from "../scenes/sandbox/lavaPitAssets";

/** Static figures make the opening board complete while idle and combat sheets warm in the background. */
export function replayStateTextureKeys(state: SandboxSceneState): string[] {
    const keys = new Set<string>();
    if (state.gridType === GridVals.LAVA_CENTER) {
        for (const key of lavaPitTextureKeys(!!state.centerDried)) keys.add(key);
    }
    for (const name of new Set(state.units.filter((unit) => !unit.dead).map((unit) => unit.properties.name))) {
        keys.add(unitToTextureName(name, TextureType.SMALL));
    }
    return [...keys];
}

/** Prepare both sides of an exchange, including secondary victims, deaths and newly summoned creatures. */
export function replayActionTextureKeys(previous: SandboxSceneState, record: SandboxReplayActionRecord): string[] {
    const keys = new Set([...replayStateTextureKeys(previous), ...replayStateTextureKeys(record.stateAfter)]);
    const namesById = new Map(
        [...previous.units, ...record.stateAfter.units].map((unit) => [unit.properties.id, unit.properties.name]),
    );
    const names = new Set<string>();
    // IDs occur in nested damage, retaliation and animation records too. Match against this checkpoint's
    // units instead of maintaining another list of event fields that could miss a new secondary effect.
    const visit = (value: unknown): void => {
        if (typeof value === "string") {
            const name = namesById.get(value);
            if (name) names.add(name);
        } else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(record.action);
    visit(record.events);
    const previousIds = new Set(previous.units.map((unit) => unit.properties.id));
    for (const unit of record.stateAfter.units) {
        if (!previousIds.has(unit.properties.id)) names.add(unit.properties.name);
    }
    for (const name of names) {
        keys.add(unitToTextureName(name, TextureType.SMALL));
        for (const key of approvedAnimationAssetKeysForUnit(name)) keys.add(key);
    }
    // Projectiles and effect pops already await their own exact assets, as in live battles. Loading every
    // spell, ability card and effect here would put unrelated artwork back in front of the first turn.
    return [...keys];
}

import { describe, expect, it } from "bun:test";
import { FactionVals, type FactionType, type UnitProperties } from "@heroesofcrypto/common";

import { PixiGameManager } from "./PixiGameManager";
import type { SceneConstructor } from "./PixiScene";

class SceneDouble {
    public sc_sceneSettings = undefined;
    public Destroy(): void {}
    public setupControls(): void {}
    public getBaseHotkeys(): never[] {
        return [];
    }
    public getHotkeys(): never[] {
        return [];
    }
}

describe("PixiGameManager scene reload", () => {
    it("clears the React selection when starting a new battle", () => {
        const manager = new PixiGameManager();
        Object.assign(manager, {
            sceneConstructor: SceneDouble as unknown as SceneConstructor,
            pixiApp: {
                getTicker: () => ({ addOnce: () => undefined }),
            },
            textures: {},
        });

        const selections: Array<{ unit: UnitProperties | null; faction: FactionType }> = [];
        const connection = manager.onSelectionCombined.connect(({ unit, faction }) => {
            selections.push({ unit, faction });
        });

        manager.onSelectionCombined.emit({
            unit: { id: "previous-battle-unit" } as UnitProperties,
            impact: null,
            faction: FactionVals.NATURE as FactionType,
        });
        manager.LoadGame(true);

        expect(selections.at(-1)).toEqual({
            unit: null,
            faction: FactionVals.NO_FACTION as FactionType,
        });
        connection.disconnect();
    });
});

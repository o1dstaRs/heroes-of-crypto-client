import { describe, expect, it, mock } from "bun:test";
import {
    Augment,
    FactionVals,
    FightStateManager,
    TeamVals,
    type FactionType,
    type UnitProperties,
} from "@heroesofcrypto/common";

import { PixiGameManager } from "./PixiGameManager";
import type { SceneConstructor } from "./PixiScene";

class SceneDouble {
    public premiumEnabled = false;
    public setPremiumSandboxGuidance(enabled: boolean): void {
        this.premiumEnabled = enabled;
    }
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
    it("blocks board clicks and fight start while the selected map is still loading", () => {
        const manager = new PixiGameManager();
        let loading = true;
        const scene = {
            isMapLoading: () => loading,
            MouseDown: mock(() => {}),
            startScene: mock(() => false),
        };
        Object.assign(manager, { m_scene: scene });
        manager.HandleMouseDown({} as MouseEvent);
        manager.StartGame();
        expect(scene.MouseDown).not.toHaveBeenCalled();
        expect(scene.startScene).not.toHaveBeenCalled();
        loading = false;
        manager.StartGame();
        expect(scene.startScene).toHaveBeenCalledTimes(1);
    });
    it("keeps Premium guidance through New Battle and drops it when account access is removed", () => {
        const manager = new PixiGameManager();
        Object.assign(manager, {
            sceneConstructor: SceneDouble as unknown as SceneConstructor,
            pixiApp: { getTicker: () => ({ addOnce: () => undefined }) },
            textures: {},
        });
        manager.SetPremiumSandboxGuidance(true);
        manager.LoadGame(true);
        const first = (manager as unknown as { m_scene: SceneDouble }).m_scene;
        expect(first.premiumEnabled).toBe(true);
        manager.LoadGame(true);
        const next = (manager as unknown as { m_scene: SceneDouble }).m_scene;
        expect(next).not.toBe(first);
        expect(next.premiumEnabled).toBe(true);
        manager.SetPremiumSandboxGuidance(false);
        expect(next.premiumEnabled).toBe(false);
        manager.LoadGame(true);
        expect((manager as unknown as { m_scene: SceneDouble }).m_scene.premiumEnabled).toBe(false);
    });
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

    // Live report: leaving a co-op board for the offline sandbox drew the previous game's deployment
    // zones. The manager outlives every route, and a scene swap alone left the shared fight state —
    // placement upgrades, map, doctrine — exactly as the last game set it.
    it("starts every scene from a fresh fight state, so a previous game's placement upgrades never leak", () => {
        const manager = new PixiGameManager();
        Object.assign(manager, {
            sceneConstructor: SceneDouble as unknown as SceneConstructor,
            pixiApp: {
                getTicker: () => ({ addOnce: () => undefined }),
            },
            textures: {},
        });
        const previous = FightStateManager.getInstance().getFightProperties();
        previous.setDefaultPlacementPerTeam(TeamVals.LEFT, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        previous.setAugmentPerTeam(TeamVals.LEFT, { type: "Placement", value: Augment.PlacementAugment.LEVEL_3 });
        expect(previous.getAugmentPlacementLevel(TeamVals.LEFT)).toBe(Augment.PlacementAugment.LEVEL_3);

        manager.LoadGame(true);

        const fresh = FightStateManager.getInstance().getFightProperties();
        expect(fresh).not.toBe(previous);
        expect(fresh.getAugmentPlacementLevel(TeamVals.LEFT)).toBe(Augment.PlacementAugment.LEVEL_1);
        // The process default (side-oriented boards) survives the reset — it is applied on every fresh state.
        expect(fresh.isSideOrientedPlacement()).toBe(true);
    });

    // The mirror case: an authoritative board (ranked / co-op sandbox) carries a transport, and its own
    // hydrate resets around a capture/restore of the server's setup. Wiping it here would drop the
    // server's augments until the next snapshot re-synced them.
    it("leaves the fight state alone for an authoritative board, which hydrates its own setup", () => {
        const manager = new PixiGameManager();
        Object.assign(manager, {
            sceneConstructor: SceneDouble as unknown as SceneConstructor,
            pixiApp: {
                getTicker: () => ({ addOnce: () => undefined }),
            },
            textures: {},
            gameActionTransport: { submitAction: () => undefined },
        });
        const authoritative = FightStateManager.getInstance().getFightProperties();
        authoritative.setDefaultPlacementPerTeam(TeamVals.LEFT, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        authoritative.setAugmentPerTeam(TeamVals.LEFT, { type: "Placement", value: Augment.PlacementAugment.LEVEL_3 });

        manager.LoadGame(true);

        expect(FightStateManager.getInstance().getFightProperties()).toBe(authoritative);
        expect(authoritative.getAugmentPlacementLevel(TeamVals.LEFT)).toBe(Augment.PlacementAugment.LEVEL_3);
    });
});

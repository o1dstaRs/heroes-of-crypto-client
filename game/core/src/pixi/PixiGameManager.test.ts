import { describe, expect, it, mock } from "bun:test";
import {
    Augment,
    FactionVals,
    FightStateManager,
    TeamVals,
    type FactionType,
    type UnitProperties,
} from "@heroesofcrypto/common";

import { PlayAimKind, type PlayAim } from "../api/play_protocol";
import { PixiGameManager } from "./PixiGameManager";
import type { SceneConstructor } from "./PixiScene";

class SceneDouble {
    public moveIntentSink: Parameters<PixiGameManager["SetMoveIntentSink"]>[0];
    public spellIntentSink: Parameters<PixiGameManager["SetSpellIntentSink"]>[0];
    public aimIntentSink: Parameters<PixiGameManager["SetAimIntentSink"]>[0];
    public setMoveIntentSink(sink: typeof this.moveIntentSink): void {
        this.moveIntentSink = sink;
    }
    public setSpellIntentSink(sink: typeof this.spellIntentSink): void {
        this.spellIntentSink = sink;
    }
    public setAimIntentSink(sink: typeof this.aimIntentSink): void {
        this.aimIntentSink = sink;
    }
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

const press = (key: string, code?: string): KeyboardEvent =>
    ({ key, code, preventDefault: mock() }) as unknown as KeyboardEvent;

describe("PixiGameManager Russian keyboard shortcuts", () => {
    it("resets the camera from the physical R key when the layout produces к", () => {
        const manager = new PixiGameManager();
        const home = mock(() => undefined);
        Object.assign(manager, {
            sceneConstructor: SceneDouble as unknown as SceneConstructor,
            pixiApp: { getTicker: () => ({ addOnce: () => undefined }) },
            textures: {},
            m_hoveringCanvas: true,
            HomeCamera: home,
        });
        manager.LoadGame();
        const input = manager as unknown as {
            HandleKey(event: KeyboardEvent, down: boolean): void;
        };

        input.HandleKey(press("к", "KeyR"), true);
        input.HandleKey(press("К"), false);
        input.HandleKey(press("к", "KeyR"), true);
        input.HandleKey(press("Ы", "KeyS"), true);

        expect(home).toHaveBeenCalledTimes(2);
    });
});

describe("PixiGameManager scene reload", () => {
    it.each(["s", "S"])("never starts or readies the scene when pressing %s without an available split", (key) => {
        const manager = new PixiGameManager();
        const start = mock(() => undefined);
        Object.assign(manager, {
            sceneConstructor: SceneDouble as unknown as SceneConstructor,
            pixiApp: { getTicker: () => ({ addOnce: () => undefined }) },
            textures: {},
            m_hoveringCanvas: true,
            StartGame: start,
        });
        manager.LoadGame();
        const input = manager as unknown as {
            HandleKey(event: KeyboardEvent, down: boolean): void;
        };
        const event = { key, preventDefault: mock() } as unknown as KeyboardEvent;
        input.HandleKey(event, true);
        input.HandleKey(event, false);
        input.HandleKey(event, true);
        expect(start).not.toHaveBeenCalled();
    });

    it("retains ranked intent relays registered before the first scene exists and after a reload", () => {
        const manager = new PixiGameManager();
        Object.assign(manager, {
            sceneConstructor: SceneDouble as unknown as SceneConstructor,
            pixiApp: { getTicker: () => ({ addOnce: () => undefined }) },
            textures: {},
        });
        const spell = mock();
        const move = mock();
        const aim = mock();
        const shot: PlayAim = { kind: PlayAimKind.MOVE, unitId: "caster", cell: { x: 4, y: 5 } };
        manager.SetSpellIntentSink(spell);
        manager.SetMoveIntentSink(move);
        manager.SetAimIntentSink(aim);
        manager.LoadGame();
        const first = (manager as unknown as { m_scene: SceneDouble }).m_scene;
        first.spellIntentSink?.("caster", "Heal");
        first.moveIntentSink?.("caster", { x: 4, y: 5 });
        first.aimIntentSink?.(shot);
        expect(spell).toHaveBeenCalledWith("caster", "Heal");
        expect(move).toHaveBeenCalledWith("caster", { x: 4, y: 5 });
        expect(aim).toHaveBeenCalledWith(shot);

        manager.LoadGame(true);
        const next = (manager as unknown as { m_scene: SceneDouble }).m_scene;
        expect(next).not.toBe(first);
        const cleared: PlayAim = { kind: PlayAimKind.CLEAR, unitId: "next" };
        next.spellIntentSink?.("next", "Spiritual Armor");
        next.moveIntentSink?.("next", undefined);
        next.aimIntentSink?.(cleared);
        expect(spell).toHaveBeenLastCalledWith("next", "Spiritual Armor");
        expect(move).toHaveBeenLastCalledWith("next", undefined);
        expect(aim).toHaveBeenLastCalledWith(cleared);

        manager.SetSpellIntentSink(undefined);
        manager.SetMoveIntentSink(undefined);
        manager.SetAimIntentSink(undefined);
        expect(next.spellIntentSink).toBeUndefined();
        expect(next.moveIntentSink).toBeUndefined();
        expect(next.aimIntentSink).toBeUndefined();
        manager.LoadGame(true);
        const offline = (manager as unknown as { m_scene: SceneDouble }).m_scene;
        expect(offline.spellIntentSink).toBeUndefined();
        expect(offline.moveIntentSink).toBeUndefined();
        expect(offline.aimIntentSink).toBeUndefined();
    });

    it("does not revive a relay removed while the scene was still loading", () => {
        const manager = new PixiGameManager();
        Object.assign(manager, {
            sceneConstructor: SceneDouble as unknown as SceneConstructor,
            pixiApp: { getTicker: () => ({ addOnce: () => undefined }) },
            textures: {},
        });
        manager.SetSpellIntentSink(mock());
        manager.SetMoveIntentSink(mock());
        manager.SetAimIntentSink(mock());
        manager.SetSpellIntentSink(undefined);
        manager.SetMoveIntentSink(undefined);
        manager.SetAimIntentSink(undefined);
        manager.LoadGame();
        const scene = (manager as unknown as { m_scene: SceneDouble }).m_scene;
        expect(scene.spellIntentSink).toBeUndefined();
        expect(scene.moveIntentSink).toBeUndefined();
        expect(scene.aimIntentSink).toBeUndefined();
    });
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

import { FightStateManager } from "@heroesofcrypto/common";
import { afterEach, expect, test } from "bun:test";

import { Sandbox } from "./Sandbox";

afterEach(() => FightStateManager.getInstance().reset());

// Between replay records nothing animates, so the cursor used to reach the active unit's interactive previews
// and draw its move silhouette until the next record cleared it: projections flickering over the replay.
test("hovering the board during a replay never draws the replayed unit's interactive previews", () => {
    FightStateManager.getInstance().getFightProperties().startFight();
    const hoverCalls: string[] = [];
    const hoverManager = new Proxy({} as Record<string, unknown>, {
        get: (target, key: string) => {
            if (key in target) return target[key];
            return (..._args: unknown[]) => {
                hoverCalls.push(key);
            };
        },
        set: (target, key: string, value) => {
            target[key] = value;
            return true;
        },
    });
    const moveIntents: unknown[] = [];
    const active = { hasAbilityActive: () => false, getTeam: () => 1 };
    const scene = Object.create(Sandbox.prototype) as Sandbox;
    Object.assign(scene, {
        replayPlaybackActive: true,
        currentActiveUnit: active,
        aiControlledTeams: new Set(),
        rangedProjectiles: { hasActive: () => false },
        hoverManager,
        sc_mouseWorld: { x: 10, y: 10 },
        getUnitAtPosition: () => undefined,
        getViewerTeam: () => undefined,
        renderIncomingThreatPreview: () => false,
        isEnemyActiveTurn: () => false,
        setHoveredSpell: () => undefined,
        emitLocalMoveIntent: (intent: unknown) => moveIntents.push(intent),
    });

    (scene as unknown as { hover(): void }).hover();

    expect(hoverCalls).toContain("clearHoverSilhouette");
    expect(hoverCalls.filter((name) => !name.startsWith("clear"))).toEqual([]);
    expect(moveIntents).toEqual([undefined]);
});

import { describe, expect, mock, test } from "bun:test";
import { GridMath } from "@heroesofcrypto/common";

import { PlayAimKind, type OpponentAim, type PlayAim } from "../api/play_protocol";
import { Sandbox } from "./Sandbox";
import type { RenderableUnit } from "./RenderableUnit";
import type { PixiRenderableSpell } from "./RenderableSpell";

interface AimScene {
    currentActiveUnit?: RenderableUnit;
    currentActiveSpell?: PixiRenderableSpell;
    localAim?: PlayAim;
    opponentMoveIntent?: { unitId: string; cell: { x: number; y: number } };
    opponentAim?: OpponentAim;
    canShowHoverForActiveUnit(): boolean;
    isPlayingActionAnimation(): boolean;
    isAwaitingAuthoritativeTurnHandoff(): boolean;
    setAimIntentSink(sink?: (aim?: PlayAim) => void): void;
    syncLocalAim(): void;
    emitLocalMoveIntent(cell?: { x: number; y: number }): void;
    setOpponentAim(aim?: OpponentAim): void;
    renderOpponentAim(): void;
}

const fixture = () => {
    const send = mock();
    const clearGhost = mock();
    const clearOverlay = mock();
    const spell = mock();
    const scene: AimScene = Object.assign(Object.create(Sandbox.prototype), {
        currentActiveUnit: { getId: () => "actor", isDead: () => false, isSmallSize: () => false },
        canShowHoverForActiveUnit: () => true,
        canControlCurrentActiveUnit: () => false,
        isPlayingActionAnimation: () => false,
        isAwaitingAuthoritativeTurnHandoff: () => false,
        sc_visibleState: { hasFinished: false },
        hoverManager: {
            clearOpponentIntentSilhouette: clearGhost,
            findLargeUnitMoveCandidate: () => [
                { x: 4, y: 6 },
                { x: 5, y: 6 },
                { x: 6, y: 6 },
            ],
        },
        opponentAimOverlay: { clear: clearOverlay },
        setOpponentSpellIntent: spell,
    });
    scene.setAimIntentSink(send);
    return { scene, send, clearGhost, clearOverlay, spell };
};

describe("ranked scene live aim lifecycle", () => {
    test("movement emits the resolved rectangular anchor even without a legacy sink", () => {
        const { scene, send } = fixture();
        scene.emitLocalMoveIntent({ x: 4, y: 6 });
        scene.syncLocalAim();
        expect(send).toHaveBeenLastCalledWith({ kind: PlayAimKind.MOVE, unitId: "actor", cell: { x: 6, y: 6 } });
        expect(
            GridMath.getFootprintAnchorForCells([
                { x: 4, y: 6 },
                { x: 6, y: 6 },
            ]),
        ).toEqual({ x: 6, y: 6 });
    });

    test("arming and canceling a spell share the same aim channel", () => {
        const { scene, send } = fixture();
        scene.currentActiveSpell = { getName: () => "Heal" } as PixiRenderableSpell;
        scene.syncLocalAim();
        expect(send).toHaveBeenLastCalledWith({ kind: PlayAimKind.SPELL, unitId: "actor", spellName: "Heal" });
        scene.currentActiveSpell = undefined;
        scene.syncLocalAim();
        expect(send).toHaveBeenLastCalledWith(undefined);
    });

    for (const gate of ["enemy turn", "animation", "handoff", "next actor"] as const)
        test(`drops the local aim during ${gate}`, () => {
            const { scene, send } = fixture();
            scene.localAim = { kind: PlayAimKind.RANGED, unitId: "actor", cell: { x: 10, y: 7 } };
            if (gate === "enemy turn") scene.canShowHoverForActiveUnit = () => false;
            if (gate === "animation") scene.isPlayingActionAnimation = () => true;
            if (gate === "handoff") scene.isAwaitingAuthoritativeTurnHandoff = () => true;
            if (gate === "next actor")
                scene.currentActiveUnit = { getId: () => "next", isDead: () => false } as RenderableUnit;
            scene.syncLocalAim();
            expect(send).toHaveBeenLastCalledWith(undefined);
        });

    test("clearing a live preview preserves a committed movement destination ghost", () => {
        const { scene, clearGhost, clearOverlay } = fixture();
        scene.opponentMoveIntent = { unitId: "actor", cell: { x: 9, y: 7 } };
        scene.setOpponentAim(undefined);
        expect(clearGhost).not.toHaveBeenCalled();
        expect(clearOverlay).toHaveBeenCalledTimes(1);
    });

    test("expiry removes the full live overlay and spell badge", () => {
        const { scene, clearGhost, clearOverlay, spell } = fixture();
        scene.opponentAim = { kind: PlayAimKind.SPELL, unitId: "actor", spellName: "Fire Wall", expiresAt: -1 };
        scene.renderOpponentAim();
        expect(scene.opponentAim).toBeUndefined();
        expect(clearGhost).toHaveBeenCalledTimes(1);
        expect(clearOverlay).toHaveBeenCalledTimes(1);
        expect(spell).toHaveBeenCalledWith(undefined);
        expect(scene.currentActiveSpell).toBeUndefined();
    });
});

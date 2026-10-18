import { describe, expect, mock, test } from "bun:test";
import { Texture } from "pixi.js";

import { SpellTargetType, TeamVals, type TeamType } from "@heroesofcrypto/common";

import { RankedPlayScene } from "./RankedPlayScene";
import { RenderableUnit } from "./RenderableUnit";
import type { PixiRenderableSpell } from "./RenderableSpell";

interface IntentScene {
    currentActiveUnit?: RenderableUnit;
    currentActiveSpell?: PixiRenderableSpell;
    opponentSpellIntent?: { unitId: string; spellName: string };
    viewerTeam?: TeamType;
    sc_visibleState: { hasFinished: boolean };
    setOpponentSpellIntent(intent?: { unitId: string; spellName: string }): void;
    setSpellIntentSink(sink?: (unitId?: string, spellName?: string) => void): void;
    getSelectedSpellName(): string | undefined;
    renderOpponentSpellIntent(): void;
    syncLocalSpellIntent(): void;
}

const fixture = () => {
    const caster: RenderableUnit = Object.assign(Object.create(RenderableUnit.prototype) as RenderableUnit, {
        getId: () => "caster",
        getTeam: () => TeamVals.RIGHT,
        isDead: () => false,
        getVisualCenter: () => ({ x: 150, y: 250 }),
        getBookSpellByName: (name: string) => ({
            isBuff: () => name === "Heal",
            getSpellTargetType: () => SpellTargetType.ANY_ENEMY,
        }),
    });
    const units = new Map([["caster", caster]]);
    const draw = mock();
    const clear = mock();
    const refresh = mock();
    const texAny = mock((_name: string): Texture | undefined => Texture.WHITE);
    const clearMove = mock();
    const scene: IntentScene = Object.assign(Object.create(RankedPlayScene.prototype) as IntentScene, {
        viewerTeam: TeamVals.LEFT,
        currentActiveUnit: caster,
        sc_visibleState: { hasFinished: false },
        hoverManager: { drawOpponentSpellBadge: draw, clearOpponentSpellBadge: clear },
        buttonManager: { refreshButtons: refresh },
        unitsHolder: { getAllUnits: () => units },
        sc_sceneSettings: { getGridSettings: () => ({}) },
        texAny,
        emitLocalMoveIntent: clearMove,
    });
    return { scene, caster, units, draw, clear, refresh, texAny, clearMove };
};

describe("ranked opponent spell selection", () => {
    test("shows the relayed name and canonical art without arming a local spell", () => {
        const { scene, draw, texAny, refresh } = fixture();
        scene.setOpponentSpellIntent({ unitId: "caster", spellName: "Fire Strike" });
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(scene.getSelectedSpellName()).toBe("Fire Strike");
        expect(scene.currentActiveSpell).toBeUndefined();
        scene.renderOpponentSpellIntent();
        expect(texAny).toHaveBeenCalledWith("fire_strike_chaos_256_v1");
        expect(draw).toHaveBeenCalledWith({
            casterPos: { x: 150, y: 250 },
            iconTex: Texture.WHITE,
            label: "Fire Strike",
            color: 0xe02b16,
        });
    });

    test("keeps the same positive badge for an opponent's heal and for an observer", () => {
        const { scene, draw } = fixture();
        scene.viewerTeam = undefined;
        scene.setOpponentSpellIntent({ unitId: "caster", spellName: "Heal" });
        scene.renderOpponentSpellIntent();
        expect(scene.getSelectedSpellName()).toBe("Heal");
        expect(draw).toHaveBeenCalledWith(expect.objectContaining({ label: "Heal", color: 0x18c868 }));
    });

    test("switching and canceling refresh both displays; duplicate hints do no extra UI work", () => {
        const { scene, draw, clear, refresh } = fixture();
        const intent = { unitId: "caster", spellName: "Meteorite" };
        scene.setOpponentSpellIntent(intent);
        scene.setOpponentSpellIntent({ ...intent });
        expect(refresh).toHaveBeenCalledTimes(1);
        scene.setOpponentSpellIntent({ ...intent, spellName: "Heal" });
        scene.renderOpponentSpellIntent();
        expect(scene.getSelectedSpellName()).toBe("Heal");
        expect(draw).toHaveBeenCalledWith(expect.objectContaining({ label: "Heal" }));
        scene.setOpponentSpellIntent(undefined);
        expect(scene.getSelectedSpellName()).toBeUndefined();
        expect(clear).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledTimes(3);
        scene.renderOpponentSpellIntent();
        expect(draw).toHaveBeenCalledTimes(1);
    });

    for (const end of ["next unit", "no active unit", "dead caster", "removed caster", "finished"] as const) {
        test(`clears the selection after ${end}`, () => {
            const { scene, caster, units, draw, clear, refresh } = fixture();
            scene.setOpponentSpellIntent({ unitId: "caster", spellName: "Heal" });
            scene.renderOpponentSpellIntent();
            switch (end) {
                case "next unit":
                    scene.currentActiveUnit = Object.assign(Object.create(caster) as RenderableUnit, {
                        getId: () => "next",
                    });
                    break;
                case "no active unit":
                    scene.currentActiveUnit = undefined;
                    break;
                case "dead caster":
                    caster.isDead = () => true;
                    break;
                case "removed caster":
                    units.clear();
                    break;
                case "finished":
                    scene.sc_visibleState.hasFinished = true;
                    break;
            }
            scene.renderOpponentSpellIntent();
            expect(scene.opponentSpellIntent).toBeUndefined();
            expect(scene.getSelectedSpellName()).toBeUndefined();
            expect(clear).toHaveBeenCalledTimes(1);
            expect(refresh).toHaveBeenCalledTimes(2);
            expect(draw).toHaveBeenCalledTimes(1);
        });
    }

    test("a stale opponent hint never replaces our own selected spell", () => {
        const { scene, draw, clear } = fixture();
        scene.viewerTeam = TeamVals.RIGHT;
        scene.currentActiveSpell = { getName: () => "Heal" } as PixiRenderableSpell;
        scene.setOpponentSpellIntent({ unitId: "caster", spellName: "Meteorite" });
        expect(scene.getSelectedSpellName()).toBe("Heal");
        scene.renderOpponentSpellIntent();
        expect(scene.getSelectedSpellName()).toBe("Heal");
        expect(draw).not.toHaveBeenCalled();
        expect(clear).toHaveBeenCalledTimes(1);
    });

    test("late icon loading fills the existing opponent badge", () => {
        const { scene, texAny, draw } = fixture();
        texAny.mockReturnValueOnce(undefined);
        scene.setOpponentSpellIntent({ unitId: "caster", spellName: "Meteorite" });
        scene.renderOpponentSpellIntent();
        expect(draw).toHaveBeenLastCalledWith(expect.objectContaining({ iconTex: Texture.EMPTY }));
        scene.renderOpponentSpellIntent();
        expect(draw).toHaveBeenLastCalledWith(expect.objectContaining({ iconTex: Texture.WHITE }));
        expect(texAny.mock.calls.map(([name]) => name)).toEqual(["meteorite_chaos_256_v1", "meteorite_chaos_256_v1"]);
    });

    test("relays only our armed spell and never echoes the opponent selection", () => {
        const { scene, clearMove } = fixture();
        const send = mock();
        scene.setSpellIntentSink(send);
        scene.viewerTeam = TeamVals.RIGHT;
        scene.currentActiveSpell = { getName: () => "Heal" } as PixiRenderableSpell;
        scene.syncLocalSpellIntent();
        scene.syncLocalSpellIntent();
        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenLastCalledWith("caster", "Heal");
        expect(clearMove).toHaveBeenCalledWith(undefined);
        scene.viewerTeam = TeamVals.LEFT;
        scene.currentActiveSpell = undefined;
        scene.setOpponentSpellIntent({ unitId: "caster", spellName: "Meteorite" });
        scene.syncLocalSpellIntent();
        expect(send).toHaveBeenCalledTimes(2);
        expect(send).toHaveBeenLastCalledWith(undefined, undefined);
        expect(scene.getSelectedSpellName()).toBe("Meteorite");
    });
});

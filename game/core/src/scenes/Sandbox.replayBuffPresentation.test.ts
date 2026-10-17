import { expect, mock, test } from "bun:test";

import { RankedPlayScene } from "./RankedPlayScene";
import { Sandbox } from "./Sandbox";

for (const ranked of [false, true]) {
    for (const completed of [false, true]) {
        test(`${ranked ? "ranked" : "sandbox"} recorded buffs with local reapply completed=${completed}`, async () => {
            const caster = {
                getId: () => "caster",
                getName: () => "Healer",
                getPosition: () => ({ x: 100, y: 100 }),
                getVisualCenter: () => ({ x: 100, y: 100 }),
                faceBoardTarget: mock(() => undefined),
                hasAnimationState: () => false,
            };
            const target = {
                getId: () => "target",
                getPosition: () => ({ x: 200, y: 200 }),
                getBaseCell: () => ({ x: 2, y: 2 }),
                isDead: () => false,
                flashBuffApplied: mock(() => undefined),
            };
            const units = new Map<string, unknown>([
                ["caster", caster],
                ["target", target],
            ]);
            const popEffectOnUnit = mock(() => undefined);
            const scene = Object.assign(Object.create(ranked ? RankedPlayScene.prototype : Sandbox.prototype), {
                unitsHolder: { getAllUnits: () => units },
                sc_sceneSettings: { getGridSettings: () => ({}) },
                snapshotRenderableUnits: () => units,
                createActionEngine: () => ({ apply: () => ({ completed, events: [] }) }),
                playUnitCombatSound: mock(() => undefined),
                renderHealVfx: mock(() => undefined),
                renderSpellDamageVfx: mock(() => undefined),
                spawnAbilityTransferVfx: mock(() => undefined),
                renderSnareResistVfx: mock(() => undefined),
                cleanupAfterSpell: mock(() => undefined),
                applyReplayEvents: mock(() => undefined),
                delayReplay: () => Promise.resolve(),
                popEffectOnUnit,
            });
            const record = {
                action: { type: "cast_spell", casterId: "caster", targetId: "target", spellName: "Blessing" },
                events: [
                    {
                        type: "effects_applied",
                        applications: [
                            { unitId: "target", name: "Blessing", kind: "buff" },
                            { unitId: "target", name: "Blessing", kind: "buff" },
                            { unitId: "target", name: "Courage", kind: "buff", resisted: true },
                            { unitId: "target", name: "Weakness", kind: "debuff" },
                            { unitId: "target", name: "Armor Rune", kind: "buff" },
                            { unitId: "target", name: "Spiritual Armor", kind: "buff", sourceUnitId: "donor" },
                        ],
                    },
                ],
                stateAfter: { units: [] },
            };
            expect(await scene.playReplayCastSpellAction(record)).toBe(true);
            if (ranked) {
                expect(popEffectOnUnit).not.toHaveBeenCalled();
                expect(target.flashBuffApplied).not.toHaveBeenCalled();
            } else {
                expect(popEffectOnUnit).toHaveBeenCalledTimes(1);
                expect(popEffectOnUnit).toHaveBeenCalledWith(target, "Blessing", 0, "buff");
                expect(target.flashBuffApplied).toHaveBeenCalledTimes(1);
            }
        });
    }
}

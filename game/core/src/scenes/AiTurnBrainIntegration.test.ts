import { describe, expect, mock, test } from "bun:test";
import { Sandbox } from "./Sandbox";

describe("AI brain activation routing", () => {
    function fixture() {
        let driven = true;
        let dead = false;
        let autoPlayed = false;
        const unit = {
            getId: () => "boar",
            isDead: () => dead,
            hasAbilityActive: (name: string) => name === "AI Driven" && driven,
        };
        const syncAiTurnBrain = mock((_unit?: unknown) => undefined);
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            currentActiveUnit: unit,
            creatureAnimationLabEnabled: false,
            creatureAnimationLabAiBrainUnitId: undefined,
            getCreatureAnimationLabUnit: () => unit,
            aiController: { isCurrentTurnAutoPlayed: () => autoPlayed },
            combatVisuals: { syncAiTurnBrain },
        });
        return {
            scene,
            unit,
            syncAiTurnBrain,
            set: (values: { driven?: boolean; dead?: boolean; autoPlayed?: boolean }) => {
                driven = values.driven ?? driven;
                dead = values.dead ?? dead;
                autoPlayed = values.autoPlayed ?? autoPlayed;
            },
        };
    }

    test("self-playing units show on either network seat; other AI units show for the entire activation", () => {
        const { scene, unit, syncAiTurnBrain, set } = fixture();
        scene.updateAiTurnBrain(true, false);
        expect(syncAiTurnBrain.mock.calls.at(-1)?.[0]).toBe(unit);
        set({ driven: false });
        scene.updateAiTurnBrain(true, false);
        expect(syncAiTurnBrain.mock.calls.at(-1)?.[0]).toBeUndefined();
        set({ autoPlayed: true });
        scene.updateAiTurnBrain(true, false);
        expect(syncAiTurnBrain.mock.calls.at(-1)?.[0]).toBe(unit);
        for (const [started, finished] of [
            [false, false],
            [true, true],
        ]) {
            scene.updateAiTurnBrain(started, finished);
            expect(syncAiTurnBrain.mock.calls.at(-1)?.[0]).toBeUndefined();
        }
        set({ dead: true });
        scene.updateAiTurnBrain(true, false);
        expect(syncAiTurnBrain.mock.calls.at(-1)?.[0]).toBeUndefined();
    });

    test("lab preview is opt-in and does not require starting a fight", () => {
        const { scene, unit, syncAiTurnBrain } = fixture();
        scene.creatureAnimationLabEnabled = true;
        scene.updateAiTurnBrain(false, false);
        expect(syncAiTurnBrain.mock.calls.at(-1)?.[0]).toBeUndefined();
        scene.creatureAnimationLabAiBrainUnitId = unit.getId();
        scene.updateAiTurnBrain(false, false);
        expect(syncAiTurnBrain.mock.calls.at(-1)?.[0]).toBe(unit);
        scene.creatureAnimationLabAiBrainUnitId = undefined;
        scene.updateAiTurnBrain(false, false);
        expect(syncAiTurnBrain.mock.calls.at(-1)?.[0]).toBeUndefined();
    });
});

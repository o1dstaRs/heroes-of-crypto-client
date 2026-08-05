import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FIGHT_EVENT_VFX } from "./fight_vfx_catalog";

const sceneSource = (name: string): string => readFileSync(join(import.meta.dir, name), "utf8");

describe("Wild Regeneration transfer VFX wiring", () => {
    test("is documented as authoritative spell-cast VFX", () => {
        expect(FIGHT_EVENT_VFX.spell_cast.rendered).toBe(true);
        expect(FIGHT_EVENT_VFX.spell_cast.ranked).toBe("replay");
        expect(FIGHT_EVENT_VFX.spell_cast.note).toContain("abilityTransfers[]");
        expect(FIGHT_EVENT_VFX.spell_cast.note).toContain("spawnAbilityTransferVfx");
    });

    test("CombatVisuals provides the recipient-side gift flight", () => {
        expect(sceneSource("sandbox/CombatVisuals.ts")).toContain("public spawnAbilityGift(");
    });

    test("the same helper is called from live sandbox and authoritative replay", () => {
        const sandbox = sceneSource("Sandbox.ts");
        const liveStart = sandbox.indexOf("private castSpellOnTarget(");
        const replayStart = sandbox.indexOf("private async playReplayCastSpellAction(");
        const eventStart = sandbox.indexOf("private applyTurnEngineEvents(");

        expect(liveStart).toBeGreaterThan(-1);
        expect(replayStart).toBeGreaterThan(-1);
        expect(eventStart).toBeGreaterThan(-1);
        expect(sandbox.slice(liveStart, liveStart + 9000)).toContain(
            "this.spawnAbilityTransferVfx(result.events, unitSnapshot)",
        );
        expect(sandbox.slice(replayStart, replayStart + 13000)).toContain(
            "this.spawnAbilityTransferVfx(record.events, unitSnapshot)",
        );
        expect(sandbox.slice(eventStart, eventStart + 15000)).toContain(
            "this.syncAbilityTransferUi(event, unitSnapshot)",
        );
    });
});

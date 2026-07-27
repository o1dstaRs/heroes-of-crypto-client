import { describe, expect, test } from "bun:test";

import { FIGHT_EVENT_VFX } from "./fight_vfx_catalog";

/**
 * The Magic Mirror rebound is rendered from `spell_cast.damaged[]`, inside the SHARED renderSpellDamageVfx —
 * the helper the live cast paths (castSpellOnTarget / castAreaSpellAtCell) and the ranked replay path
 * (playReplayCastSpellAction) all call. That sharing is the whole reason the effect plays in ranked as well
 * as sandbox, and it is exactly the wiring that has silently gone missing for other abilities before, so it
 * is pinned here rather than left to a reviewer's memory.
 */
describe("Magic Mirror rebound VFX wiring", () => {
    test("rides the spell_cast event, which ranked renders on its replay path", () => {
        const spellCast = FIGHT_EVENT_VFX.spell_cast;

        expect(spellCast.rendered).toBe(true);
        expect(spellCast.ranked).toBe("replay");
    });

    test("the catalog names the rebound helper and the holder field it draws the beam from", () => {
        const note = FIGHT_EVENT_VFX.spell_cast.note;

        expect(note).toContain("spawnMagicMirrorRebound");
        expect(note).toContain("reboundedFromUnitId");
        // Called out as riding renderSpellDamageVfx: that is what makes it play in BOTH scenes.
        expect(note).toContain("renderSpellDamageVfx");
    });
});

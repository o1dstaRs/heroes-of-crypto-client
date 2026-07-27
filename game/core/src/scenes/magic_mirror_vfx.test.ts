import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FIGHT_EVENT_VFX } from "./fight_vfx_catalog";

/**
 * The Magic Reflection rebound is rendered from `spell_cast.damaged[]`, inside the SHARED
 * renderSpellDamageVfx — the helper the live cast paths (castSpellOnTarget / castAreaSpellAtCell) and the
 * ranked replay path (playReplayCastSpellAction) all call. That sharing is the whole reason the effect plays
 * in ranked as well as sandbox.
 *
 * These assertions read the SOURCE rather than the catalog blurb on purpose. The first version of this test
 * only checked the documentation, and a later conflict resolution dropped the actual call while leaving the
 * helper, the constants and the prose in place — the effect became dead code and the test stayed green. A
 * VFX that silently stops firing is precisely the failure the catalog exists to prevent, so the wiring
 * itself is what gets pinned.
 */
const sceneSource = (name: string): string => readFileSync(join(import.meta.dir, name), "utf8");

describe("Magic Reflection rebound VFX wiring", () => {
    test("rides the spell_cast event, which ranked renders on its replay path", () => {
        const spellCast = FIGHT_EVENT_VFX.spell_cast;

        expect(spellCast.rendered).toBe(true);
        expect(spellCast.ranked).toBe("replay");
        expect(spellCast.note).toContain("spawnMagicMirrorRebound");
    });

    test("CombatVisuals still provides the effect", () => {
        expect(sceneSource("sandbox/CombatVisuals.ts")).toContain("public spawnMagicMirrorRebound(");
    });

    test("renderSpellDamageVfx actually calls it for a rebounded hit", () => {
        const sandbox = sceneSource("Sandbox.ts");
        const start = sandbox.indexOf("protected renderSpellDamageVfx(");
        expect(start).toBeGreaterThan(-1);
        // The helper is the last thing in its own method; bound the slice generously and assert the call
        // sits INSIDE it rather than merely somewhere in the file.
        const body = sandbox.slice(start, start + 4000);

        expect(body).toContain("hit.rebounded");
        expect(body).toContain("this.combatVisuals.spawnMagicMirrorRebound(");
        // The beam needs the mirror that threw it back — ranked replays VFX from events alone.
        expect(body).toContain("reboundedFromUnitId");
    });
});

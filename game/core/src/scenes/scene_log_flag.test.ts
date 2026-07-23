import { describe, expect, test } from "bun:test";

import { TeamVals } from "@heroesofcrypto/common";

import { indexUnitTeam, resolveLineTeamFlag, type TeamOrAmbiguous } from "./scene_log_flag";

const GREEN = TeamVals.LOWER;
const RED = TeamVals.UPPER;

const indexed = (...entries: [string, number][]): Map<string, TeamOrAmbiguous> => {
    const m = new Map<string, TeamOrAmbiguous>();
    for (const [name, team] of entries) {
        indexUnitTeam(m, name, team);
    }
    return m;
};

describe("indexUnitTeam", () => {
    test("records a name's team on first sight and is idempotent for the same team", () => {
        const m = indexed(["Berserker", GREEN], ["Berserker", GREEN]);
        expect(m.get("Berserker")).toBe(GREEN);
    });

    test("marks a name fielded on both teams as ambiguous, and ambiguous is sticky", () => {
        const m = indexed(["Berserker", GREEN], ["Berserker", RED]);
        expect(m.get("Berserker")).toBe("ambiguous");
        indexUnitTeam(m, "Berserker", GREEN); // seeing it again on one team must NOT un-ambiguate
        expect(m.get("Berserker")).toBe("ambiguous");
    });
});

describe("resolveLineTeamFlag", () => {
    test("flags a line by the unit it leads with (LOWER=green, UPPER=red)", () => {
        const m = indexed(["Berserker", GREEN], ["Troglodyte", RED]);
        expect(resolveLineTeamFlag("Berserker moved to(2, 7)", m)).toBe("🟢");
        expect(resolveLineTeamFlag("Troglodyte moved to(3, 9)", m)).toBe("🔴");
    });

    test("returns '' for a line that isn't about a known unit", () => {
        const m = indexed(["Berserker", GREEN]);
        expect(resolveLineTeamFlag("Fight started!", m)).toBe("");
        expect(resolveLineTeamFlag("Map narrowed", m)).toBe("");
    });

    test("longest matching name wins so 'Wolf Rider' isn't shadowed by 'Wolf'", () => {
        const m = indexed(["Wolf", RED], ["Wolf Rider", GREEN]);
        expect(resolveLineTeamFlag("Wolf Rider attk Berserker (5)", m)).toBe("🟢");
        expect(resolveLineTeamFlag("Wolf moved to(1, 1)", m)).toBe("🔴");
    });

    test("a creature mirrored on both teams is unflagged without an active-unit hint", () => {
        const m = indexed(["Berserker", GREEN], ["Berserker", RED]);
        expect(resolveLineTeamFlag("Berserker moved to(2, 7)", m)).toBe("");
    });

    test("the active unit's real team flags its own lines even when its creature is mirrored", () => {
        // The bug: an AI-driven Berserker mirrored on both teams read as "no flag". With the active unit
        // known, its move/attack lines now resolve to its real side.
        const m = indexed(["Berserker", GREEN], ["Berserker", RED]);
        const activeGreenBerserker = { name: "Berserker", team: GREEN };
        expect(resolveLineTeamFlag("Berserker moved to(2, 7)", m, activeGreenBerserker)).toBe("🟢");
        expect(resolveLineTeamFlag("Berserker ⚔️ Troglodyte (33)", m, activeGreenBerserker)).toBe("🟢");
    });

    test("the active-unit hint only applies to lines that lead with the active unit's name", () => {
        // A response line leads with the responder, not the active unit, so it resolves via the map.
        const m = indexed(["Berserker", GREEN], ["Troglodyte", RED]);
        const activeBerserker = { name: "Berserker", team: GREEN };
        expect(resolveLineTeamFlag("Troglodyte resp Berserker (325)", m, activeBerserker)).toBe("🔴");
    });

    test("does not misattribute a longer-named unit to the same-prefixed active unit", () => {
        const m = indexed(["Wolf", GREEN], ["Wolf Rider", RED]);
        const activeWolf = { name: "Wolf", team: GREEN };
        // Line is about Wolf Rider (red), not the active Wolf — longest match keeps it correct.
        expect(resolveLineTeamFlag("Wolf Rider moved to(1, 1)", m, activeWolf)).toBe("🔴");
    });

    test("flags a count-led line (Petrifying Gaze kill) by the struck unit's team", () => {
        const m = indexed(["Medusa", GREEN], ["Beholder", RED]);
        // "N <Unit> killed by Petrifying Gaze" leads with the count; colour by the receiver (Beholder).
        expect(resolveLineTeamFlag("4 Beholder killed by Petrifying Gaze", m)).toBe("🔴");
        expect(resolveLineTeamFlag("12 Medusa killed by Petrifying Gaze", m)).toBe("🟢");
    });

    test("craft result lines flag the active caster's team even for a mirrored ally", () => {
        // Blacksmith casts Craft on its allies; an "Elf" fielded by both teams is ambiguous by name, but
        // the craft always targets the active caster's OWN allies, so the lines take the caster's side.
        const m = indexed(["Elf", GREEN], ["Elf", RED], ["Blacksmith", RED]);
        const activeRedBlacksmith = { name: "Blacksmith", team: RED };
        expect(resolveLineTeamFlag("Elf was crafted with Crafted Frozen Bow", m, activeRedBlacksmith)).toBe("🔴");
        expect(resolveLineTeamFlag("Elf's craft found nothing to improve", m, activeRedBlacksmith)).toBe("🔴");
        expect(resolveLineTeamFlag("Elf's craft failed", m, activeRedBlacksmith)).toBe("🔴");
        expect(resolveLineTeamFlag("Elf's craft backfired — stunned", m, activeRedBlacksmith)).toBe("🔴");
    });

    describe("mirror match (same creature on both teams)", () => {
        // Beholder-vs-Beholder: the name is ambiguous, so without the active-unit hint nothing flags.
        const m = indexed(["Beholder", GREEN], ["Beholder", RED]);
        const activeRedBeholder = { name: "Beholder", team: RED };

        test("the active unit's own action lines flag its side", () => {
            expect(resolveLineTeamFlag("Beholder moved to(8, 3)", m, activeRedBeholder)).toBe("🔴");
            expect(resolveLineTeamFlag("Beholder 🏹 Beholder (97)", m, activeRedBeholder)).toBe("🔴");
            expect(resolveLineTeamFlag("Beholder applied Cowardice on Beholder for 1 lap", m, activeRedBeholder)).toBe(
                "🔴",
            );
        });

        test("a response line flags the opponent (the responder is the active unit's enemy)", () => {
            expect(resolveLineTeamFlag("Beholder resp Beholder (116)", m, activeRedBeholder)).toBe("🟢");
        });

        test("a death / killed line stays unflagged (the victim instance is ambiguous)", () => {
            expect(resolveLineTeamFlag("Beholder died", m, activeRedBeholder)).toBe("");
        });

        test("without an active unit, mirror lines stay unflagged (no false colour)", () => {
            expect(resolveLineTeamFlag("Beholder moved to(8, 3)", m)).toBe("");
        });
    });
});

import { describe, expect, test } from "bun:test";
import { Artifact, CreatureVals, creatureInfo } from "@heroesofcrypto/common";

import { premiumDraftAssessment, type PremiumDraftState } from "./premiumDraftAssessment";

const draft = (overrides: Partial<PremiumDraftState> = {}): PremiumDraftState => ({
    gameId: "draft-0",
    picked: [],
    opponentPicked: [],
    artifactTier1: 0,
    artifactTier2: 0,
    isYourTurn: false,
    ...overrides,
});
const note = (state: PremiumDraftState, label: string) =>
    premiumDraftAssessment(state).notes.find((entry) => entry.label === label)?.text;

describe("Premium draft assessment", () => {
    test("assesses confirmed picks while waiting and updates after the next pick", () => {
        const before = draft({ picked: [CreatureVals.PEASANT] });
        expect(premiumDraftAssessment(before).headline).toBe("No ranged damage drafted yet");
        const after = { ...before, picked: [...before.picked, CreatureVals.ELF] };
        expect(premiumDraftAssessment(after).headline).toBe("Melee and ranged options covered");
        expect(premiumDraftAssessment(after).roster).toBe("2 of 6 creatures locked in");
    });

    test("a damaging spell counts as ranged pressure but support spells alone do not", () => {
        const caster = draft({ picked: [CreatureVals.WANDERING_MAGE] });
        expect(premiumDraftAssessment(caster).headline).toBe("Melee and ranged options covered");
        expect(note(caster, "Spell pressure")).toContain("limited charges");
        expect(premiumDraftAssessment(draft({ picked: [CreatureVals.HEALER] })).headline).toBe(
            "No ranged damage drafted yet",
        );
    });

    test("does not count duplicate, hidden, or unknown creatures toward roles or synergies", () => {
        const state = draft({ picked: [0, CreatureVals.ELF, CreatureVals.ELF, -1, 999999] });
        const result = premiumDraftAssessment(state);
        expect(result.roster).toBe("1 of 6 creatures locked in");
        expect(result.headline).toBe("Ranged pressure, little melee cover");
        expect(note(state, "Synergies")).toContain("one more distinct Nature creature");
        expect(note(state, "Synergy gap")).toBeUndefined();
    });

    test("uses the match's rolled synergy and checks the whole army for beneficiaries", () => {
        const state = draft({ picked: [CreatureVals.ELF, CreatureVals.TRENT] });
        expect(note(state, "Synergies")).toContain("Nature Flying armor level 1");
        expect(premiumDraftAssessment(state).focus).toContain("no flying creature");
        const otherVariant = { ...state, gameId: "draft-1" };
        expect(note(otherVariant, "Synergies")).toContain("Nature Board units level 1");
        expect(note(otherVariant, "Synergy gap")).toBeUndefined();
        const flyer = Object.values(CreatureVals).find((id) => typeof id === "number" && creatureInfo(id)?.canFly);
        expect(flyer).toBeDefined();
        expect(note({ ...state, picked: [...state.picked, flyer as number] }, "Synergy gap")).toBeUndefined();
    });

    test("does not infer hidden enemy roles or a win probability", () => {
        const state = draft({ picked: [CreatureVals.PEASANT], opponentPicked: [0, 0, 0, 0] });
        expect(note(state, "Opponent")).toContain("No enemy creatures revealed");
        const revealed = { ...state, opponentPicked: [0, CreatureVals.ELF, 0] };
        expect(note(revealed, "Opponent")).toContain("1 revealed creature");
        expect(note(revealed, "Opponent")).toContain("Elf can threaten from range");
        expect(JSON.stringify(premiumDraftAssessment(revealed))).not.toMatch(/winning|ahead|win rate|%/i);
    });

    test("completed drafts get placement guidance rather than impossible extra picks", () => {
        const melee = Object.values(CreatureVals)
            .filter((id): id is number => typeof id === "number")
            .filter((id) => {
                const info = creatureInfo(id);
                return info?.melee && !info.ranged && !info.rangedSpellDamage;
            })
            .slice(0, 6);
        const result = premiumDraftAssessment(draft({ picked: melee }));
        expect(result.focus).toContain("close the gap");
        expect(JSON.stringify(result)).not.toContain("one more distinct");
        expect(result.focus).not.toContain("Look for a shooter");
    });

    test("selected artifacts carry their actual effect, including while waiting", () => {
        const artifactTier1 = Object.values(Artifact.Tier1Artifact).find(
            (id) => typeof id === "number" && id > 0,
        ) as number;
        const artifact = Artifact.getTier1ArtifactProperties(artifactTier1);
        expect(note(draft({ artifactTier1 }), artifact.name)).toBe(Artifact.formatArtifactDescription(artifact));
    });

    test("before the bundle is confirmed, explains the first decision without inventing an army", () => {
        const result = premiumDraftAssessment(draft());
        expect(result.roster).toBe("0 of 6 creatures locked in");
        expect(result.focus).toContain("bundle");
        expect(result.notes.some((entry) => entry.label === "Army")).toBe(false);
    });

    test("does not guess a synergy variant without a match id", () => {
        const state = draft({ gameId: undefined, picked: [CreatureVals.ELF, CreatureVals.TRENT] });
        expect(note(state, "Synergies")).toContain("Nature synergy level 1");
        expect(note(state, "Synergy gap")).toBeUndefined();
    });

    test("a fully revealed roster is not described as partially hidden", () => {
        const opponentPicked = Object.values(CreatureVals)
            .filter((id): id is number => typeof id === "number" && !!creatureInfo(id))
            .slice(0, 6);
        const text = note(draft({ opponentPicked }), "Opponent");
        expect(text).toContain("Full enemy roster revealed");
        expect(text).not.toContain("may still be hidden");
    });
});

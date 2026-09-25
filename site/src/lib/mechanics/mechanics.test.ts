/*
 * Every ability, spell, artifact and status effect the Knowledge Base shows carries a "How it works" note in
 * both languages. A new card without one is a gap the AI search would otherwise fill from the one-line card
 * text alone, so the gap fails here instead of shipping.
 */

import effectsJson from "@heroesofcrypto/common/src/configuration/effects.json";
import { describe, expect, test } from "bun:test";

import { artifacts } from "../artifacts-data";
import { spells } from "../spells-data";
import { abilities, allUnits } from "../units-data";
import { abilityNote, artifactFit, artifactNote, effectNote, spellNote, unitCounterLines, type NoteLanguage } from "./index";

const languages: NoteLanguage[] = ["en", "ru"];
const effectNames = Object.entries(effectsJson as Record<string, unknown>)
    .filter(([, value]) => typeof value === "object")
    .map(([name]) => name);

const expectNote = (label: string, note: string | undefined, language: NoteLanguage): void => {
    expect(note, `${label} has no ${language} note`).toBeTruthy();
    // A placeholder the formatter missed, or an arithmetic slip, reads as nonsense on the page.
    expect(note, `${label} (${language})`).not.toMatch(/\{\}|NaN|undefined|Infinity/);
    if (language === "ru") {
        expect(note, `${label}: the Russian note should be Russian`).toMatch(/[а-яё]/i);
    }
};

describe("mechanics notes", () => {
    test("cover every ability in the codex", () => {
        for (const ability of abilities) {
            for (const language of languages) expectNote(ability.name, abilityNote(ability.name, language), language);
        }
    });

    test("cover every spell in the codex", () => {
        for (const spell of spells) {
            for (const language of languages) expectNote(spell.name, spellNote(spell.name, language), language);
        }
    });

    test("cover every artifact a player can be offered", () => {
        for (const artifact of artifacts) {
            for (const language of languages)
                expectNote(artifact.name, artifactNote(artifact.name, language), language);
        }
    });

    test("cover every status effect", () => {
        for (const name of effectNames) {
            for (const language of languages) expectNote(name, effectNote(name, language), language);
        }
    });

    test("take their numbers from the game configuration", () => {
        // Stun's power is 35: 7% per stack power, 35% at full stack.
        expect(abilityNote("Stun", "en")).toContain("7% per stack power (35% at full stack)");
        expect(abilityNote("Stun", "ru")).toContain("7% за единицу силы стека (35% при полной силе)");
        // Paralysis rolls twice its power per stack power and cuts damage by the EFFECT's power, not the card's.
        expect(abilityNote("Paralysis", "en")).toContain("20% per stack power (100% at full stack)");
        expect(abilityNote("Paralysis", "en")).toContain("8% per Mantis stack power (40% at full stack");
        // Decimals use a comma in Russian.
        expect(abilityNote("Sharpened Weapons Aura", "ru")).toContain("3,6%");
    });
});

describe("build advice", () => {
    test("every artifact says what it suits, in both languages", () => {
        for (const artifact of artifacts) {
            for (const language of ["en", "ru"] as const) {
                const fit = artifactFit(artifact.name, language);
                expect(fit, `${artifact.name} ${language}`).toBeTruthy();
                expect(fit).not.toMatch(/undefined|NaN|\$\{/);
                if (language === "ru") {
                    expect(fit).toMatch(/[а-яё]/i);
                }
            }
        }
    });

    test("unit counters never promise what a trait rules out", () => {
        const byName = new Map(allUnits.map((unit) => [unit.name, unit]));
        const text = (name: string): string => unitCounterLines(byName.get(name)!, "en").join("\n");
        expect(text("Black Dragon")).not.toContain("Hamstring (Dryad) can take");
        expect(text("Tsar Cannon")).not.toContain("Rangebane");
        expect(text("Arbalester")).not.toContain("Farsight Quiver lengthen");
        expect(text("Abomination")).not.toContain("Splitting");
        for (const unit of allUnits) {
            for (const line of unitCounterLines(unit, "ru")) {
                expect(line).not.toMatch(/undefined|NaN/);
            }
        }
    });
});


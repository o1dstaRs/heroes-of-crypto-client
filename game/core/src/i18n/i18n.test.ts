import { describe, expect, it, afterEach } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, getLanguage, setLanguage, t, tf } from "./i18n";
import { RU_TRANSLATIONS } from "./ru";
import { standingLabel } from "./standing";

afterEach(() => {
    setLanguage(DEFAULT_LANGUAGE);
});

/** Every literal key handed to t()/tf() in a directory — dynamic keys (t(variable)) are invisible here. */
const literalKeysUnder = (path: string): string[] => {
    const keys: string[] = [];
    const files: string[] = [];
    const visit = (candidate: string): void => {
        if (statSync(candidate).isDirectory()) {
            for (const name of readdirSync(candidate)) {
                visit(join(candidate, name));
            }
        } else if (/\.tsx?$/.test(candidate) && !candidate.includes(".test.")) {
            files.push(candidate);
        }
    };
    visit(path);
    for (const file of files) {
        const source = readFileSync(file, "utf8");
        for (const pattern of [/(?<![\w.])t\(\s*"((?:[^"\\]|\\.)*)"/g, /(?<![\w.])tf\(\s*"((?:[^"\\]|\\.)*)"/g]) {
            for (const match of source.matchAll(pattern)) {
                keys.push(match[1]);
            }
        }
    }
    return [...new Set(keys)];
};

const literalKeysAcross = (paths: string[]): string[] => [...new Set(paths.flatMap(literalKeysUnder))];

describe("game-client i18n", () => {
    it("registers at least English and Russian, English first as the default", () => {
        expect(SUPPORTED_LANGUAGES[0].code).toBe("en");
        expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toContain("ru");
        expect(DEFAULT_LANGUAGE).toBe("en");
    });

    it("renders English keys verbatim and switches to the picked language", () => {
        expect(t("Your turn")).toBe("Your turn");
        setLanguage("ru");
        expect(getLanguage()).toBe("ru");
        expect(t("Your turn")).toBe("Ваш ход");
        expect(t("Pick a creature")).toBe("Выберите существо");
    });

    it("falls back to the English key for untranslated strings and rejects unknown codes", () => {
        setLanguage("ru");
        expect(t("Some brand new chrome string")).toBe("Some brand new chrome string");
        setLanguage("xx");
        expect(getLanguage()).toBe("ru");
    });

    it("has no empty or identity Russian entries", () => {
        for (const [english, russian] of Object.entries(RU_TRANSLATIONS)) {
            expect(russian.trim().length).toBeGreaterThan(0);
            expect(russian).not.toBe(english);
        }
    });
});

describe("tf interpolation", () => {
    it("fills named slots and lets a translation reorder them", () => {
        expect(tf("{count} games", { count: 7 })).toBe("7 games");
        setLanguage("ru");
        // The Russian entry moves {count} to the end — the slot travels with it.
        expect(tf("{count} games", { count: 7 })).toBe("партий: 7");
    });

    it("leaves unsupplied slots verbatim instead of dropping them", () => {
        expect(tf("Level {level}: {description}", { level: 2 })).toBe("Level 2: {description}");
    });
});

describe("player portal localization", () => {
    // The portal hosts the language picker, so an untranslated key there reads as "the switch is broken".
    it("has a Russian entry for every literal key the portal renders", () => {
        const keys = literalKeysUnder(join(import.meta.dir, "..", "ui", "PlayerPortal"));
        expect(keys.length).toBeGreaterThan(50);
        expect(keys.filter((key) => !(key in RU_TRANSLATIONS))).toEqual([]);
    });
});

describe("ranked flow localization", () => {
    it("has Russian entries for every literal key from arena through draft and fight", () => {
        const ui = join(import.meta.dir, "..", "ui");
        const keys = literalKeysAcross([
            join(ui, "MatchmakingRoute.tsx"),
            join(ui, "RankedBanPicker.tsx"),
            join(ui, "RankedGameView.tsx"),
            join(ui, "AugmentStepPreview.tsx"),
            join(ui, "ExitReplayBadge.tsx"),
            join(ui, "RankedFinishedActions.tsx"),
            join(ui, "NextLapHazardBadge.tsx"),
            join(ui, "PickAndBan"),
            join(ui, "LeftSideBar"),
            join(ui, "RightSideBar"),
            join(ui, "FightFinishedOverlay"),
            join(ui, "FightStats"),
            join(ui, "DraggableToolbar"),
            join(ui, "UpNextOverlay"),
            join(ui, "PlayerPortal", "LivePredictionMarkets.tsx"),
            join(ui, "WagerNegotiator.tsx"),
            join(ui, "WagerStakeBox.tsx"),
            join(ui, "audio", "ThemeMusic.tsx"),
            join(ui, "index.tsx"),
            join(import.meta.dir, "..", "scenes", "LoadingScreen.ts"),
            join(import.meta.dir, "..", "scenes", "sandbox", "CombatVisuals.ts"),
        ]);
        expect(keys.length).toBeGreaterThan(190);
        expect(keys.filter((key) => !(key in RU_TRANSLATIONS))).toEqual([]);
    });

    it("covers data-driven perk, map, and hazard copy", () => {
        const dynamicKeys = [
            "Scout",
            "Spymaster",
            "Blind Fury",
            "Half their army, spread across every tier",
            "The whole enemy draft, live",
            "Draft blind, field the strongest army",
            "Standard",
            "Lava",
            "Cemetery",
            "Water",
            "Armageddon next lap",
            "Map narrows next lap",
        ];
        expect(dynamicKeys.filter((key) => !(key in RU_TRANSLATIONS))).toEqual([]);
    });

    it("covers the league and wealth names the server renders into a standing", () => {
        // These come back from the server already rendered (its LEAGUE_NAMES / WEALTH_NAMES tables,
        // worst -> best) and reach t() as a variable, so the literal scan above cannot see them.
        const leagueNames = ["Aspirant", "Vanguard", "Marshal", "Overlord", "Demigod", "Unranked"];
        const wealthNames = ["Ragged", "Stacked", "Whale"];
        expect([...leagueNames, ...wealthNames].filter((key) => !(key in RU_TRANSLATIONS))).toEqual([]);
    });
});

describe("standing label", () => {
    it("leads with the adjective tiers and trails with the noun one, in the picked language", () => {
        expect(standingLabel(1, "Ragged", "Aspirant")).toBe("Ragged Aspirant");
        expect(standingLabel(2, "Stacked", "Marshal")).toBe("Stacked Marshal");
        expect(standingLabel(3, "Whale", "Demigod")).toBe("Demigod Whale");
        setLanguage("ru");
        expect(standingLabel(1, "Ragged", "Aspirant")).toBe("Нищий Новобранец");
        expect(standingLabel(3, "Whale", "Marshal")).toBe("Маршал Кит");
    });

    it("shows no wealth standing while the player has no league cohort", () => {
        // Calibrating players come back as tier 0 with an empty wealth name.
        expect(standingLabel(0, "", "Unranked")).toBe("Unranked");
        expect(standingLabel(0, "", "Demigod")).toBe("Demigod");
        expect(standingLabel(3, "Whale", "")).toBe("Whale");
        expect(standingLabel(0, "", "")).toBe("");
    });
});

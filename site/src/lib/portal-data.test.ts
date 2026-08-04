import { describe, expect, test } from "bun:test";

import { CreatureVals, FactionVals } from "@heroesofcrypto/common/src/generated/protobuf/v1/enums_reexports";

import { creatureById, factionById, streakLabel, timeAgo, winRateColor, winRatePct } from "./portal-data";

describe("profile portal presentation", () => {
    test("resolves protobuf creature and faction ids to the live catalog assets", () => {
        expect(creatureById(CreatureVals.BERSERKER)).toEqual({
            name: "Berserker",
            image: "/assets/images/units/units/berserker_512.webp",
        });
        expect(factionById(FactionVals.MIGHT)).toEqual({
            name: "Might",
            image: "/assets/images/units/factions/might_128.webp",
            color: "#e0b04a",
        });
    });

    test("keeps unknown server ids readable and uses safe fallback art", () => {
        expect(creatureById(999_999)).toEqual({
            name: "#999999",
            image: "/assets/images/units/units/unknown_creature_512.webp",
        });
        expect(factionById(999_999)).toEqual({
            name: "Neutral",
            image: "/assets/images/units/factions/neutral_128.webp",
            color: "#f2c75d",
        });
    });

    test("formats win rates and streaks at their user-visible boundaries", () => {
        expect(winRatePct(0, 0)).toBe(0);
        expect(winRatePct(7, 10)).toBe(70);
        expect(winRatePct(2, 3)).toBe(67);
        expect(winRateColor(44)).toBe("#ff5a5a");
        expect(winRateColor(45)).toBe("#f2c75d");
        expect(winRateColor(60)).toBe("#46d160");

        const labels = { win: "{}W streak", loss: "{}L streak", none: "No streak" };
        expect(streakLabel(4, labels)).toBe("4W streak");
        expect(streakLabel(-3, labels)).toBe("3L streak");
        expect(streakLabel(0, labels)).toBe("No streak");
    });

    test("formats relative times across every displayed unit", () => {
        const labels = { now: "now", m: "m", h: "h", d: "d", mo: "mo", y: "y" };
        const now = Date.UTC(2026, 7, 2);

        expect(timeAgo(0, labels, now)).toBe("");
        expect(timeAgo(now - 59_999, labels, now)).toBe("now");
        expect(timeAgo(now - 60_000, labels, now)).toBe("1m");
        expect(timeAgo(now - 60 * 60_000, labels, now)).toBe("1h");
        expect(timeAgo(now - 24 * 60 * 60_000, labels, now)).toBe("1d");
        expect(timeAgo(now - 30 * 24 * 60 * 60_000, labels, now)).toBe("1mo");
        expect(timeAgo(now - 365 * 24 * 60 * 60_000, labels, now)).toBe("1y");
    });
});

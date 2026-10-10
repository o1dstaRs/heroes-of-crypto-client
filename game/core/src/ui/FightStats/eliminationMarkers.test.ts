import { describe, expect, test } from "bun:test";

import { TeamType, TeamVals } from "@heroesofcrypto/common";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";

import { IFightDeathEntry, IFightStatsSample } from "../../scenes/VisibleState";
import { CasualtyChart } from "./CasualtyChart";
import {
    ELIMINATION_MARKER_GAP,
    ELIMINATION_MARKER_RADIUS,
    layoutEliminationMarkers,
    withUnmarkedEliminations,
} from "./eliminationMarkers";

const LEFT = TeamVals.LEFT as TeamType;
const RIGHT = TeamVals.RIGHT as TeamType;

const death = (name: string, team: TeamType, died: number, start: number): IFightDeathEntry => ({
    name,
    smallTextureName: `${name.toLowerCase()}_512`,
    died,
    start,
    team,
});

const sample = (lap: number, leftKilled: number, rightKilled: number): IFightStatsSample => ({
    lap,
    leftKilled,
    rightKilled,
    leftKilledPct: leftKilled,
    rightKilledPct: rightKilled,
});

describe("casualty timeline markers", () => {
    test("adds every fully wiped creature the sampler never timed, and leaves a partial stack off", () => {
        const series = [
            sample(1, 0, 0),
            {
                ...sample(6, 80, 40),
                eliminations: [
                    {
                        creatureKey: `${RIGHT}|fairy`,
                        name: "Fairy",
                        smallTextureName: "fairy_512",
                        team: RIGHT,
                    },
                ],
            },
            sample(8, 100, 90),
        ];
        const deaths = [
            death("Gargantuan", LEFT, 2, 2),
            death("Zena", LEFT, 8, 8),
            death("Beholder", LEFT, 22, 22),
            death("Fairy", RIGHT, 139, 139),
            death("Crusader", RIGHT, 6, 20),
        ];

        const marked = withUnmarkedEliminations(series, deaths, LEFT);
        const names = marked.flatMap((point) => (point.eliminations ?? []).map((elimination) => elimination.name));

        expect(names).toEqual(["Fairy", "Gargantuan", "Zena", "Beholder"]);
        // Green has no named death of its own, and lap 6 is the first point that already shows its losses.
        expect(marked[1].eliminations?.map((elimination) => elimination.name)).toEqual([
            "Fairy",
            "Gargantuan",
            "Zena",
            "Beholder",
        ]);
        expect(marked[2].eliminations).toBeUndefined();
        expect(names).not.toContain("Crusader");
    });

    test("puts an untimed wipe on the rise before the first death that side could name", () => {
        const series = [
            sample(1, 0, 0),
            sample(4, 70, 0),
            {
                ...sample(8, 100, 0),
                eliminations: [
                    {
                        creatureKey: `${LEFT}|gargantuan`,
                        name: "Gargantuan",
                        smallTextureName: "gargantuan_512",
                        team: LEFT,
                    },
                ],
            },
        ];
        const marked = withUnmarkedEliminations(
            series,
            [death("Zena", LEFT, 8, 8), death("Gargantuan", LEFT, 2, 2)],
            LEFT,
        );
        expect(marked[1].eliminations?.map((elimination) => elimination.name)).toEqual(["Zena"]);
        expect(marked[2].eliminations?.map((elimination) => elimination.name)).toEqual(["Gargantuan"]);
    });

    test("does not duplicate a wipe the series already timed", () => {
        const series = [
            sample(1, 0, 0),
            {
                ...sample(4, 100, 0),
                eliminations: [
                    {
                        creatureKey: `${LEFT}|zena`,
                        name: "Zena",
                        smallTextureName: "zena_512",
                        team: LEFT,
                    },
                ],
            },
        ];
        const marked = withUnmarkedEliminations(series, [death("Zena", LEFT, 8, 8)], LEFT);
        expect(marked[1].eliminations).toHaveLength(1);
    });

    test("separates portraits that would otherwise share one pixel", () => {
        const drafts = Array.from({ length: 8 }, (_, index) => ({
            elimination: {
                creatureKey: `k${index}`,
                name: `Creature ${index}`,
                smallTextureName: "creature_512",
                team: LEFT,
            },
            pointX: 400,
            pointY: 40,
            lap: 6,
            sampleIndex: 3,
            eliminationIndex: index,
        }));
        const laidOut = layoutEliminationMarkers(drafts, { left: 40, right: 760, top: 24, bottom: 120 });
        const minDist = ELIMINATION_MARKER_RADIUS * 2 + ELIMINATION_MARKER_GAP;

        expect(laidOut).toHaveLength(8);
        for (let i = 0; i < laidOut.length; i++) {
            expect(laidOut[i].centerX).toBeGreaterThanOrEqual(40);
            expect(laidOut[i].centerX).toBeLessThanOrEqual(760);
            expect(laidOut[i].centerY).toBeGreaterThanOrEqual(24);
            expect(laidOut[i].centerY).toBeLessThanOrEqual(120);
            for (let j = i + 1; j < laidOut.length; j++) {
                const dx = laidOut[i].centerX - laidOut[j].centerX;
                const dy = laidOut[i].centerY - laidOut[j].centerY;
                expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(minDist - 0.01);
            }
        }
    });

    test("the results chart draws every wiped creature as a large portrait", () => {
        // MUI Joy is emotion-backed: an explicit cache keeps the server render off the null default
        // cache in CI (same fix as SynergySlots and PremiumEvidenceText).
        const emotionCache = createCache({ key: "hoc-ssr-test" });
        const html = renderToStaticMarkup(
            React.createElement(
                CacheProvider,
                { value: emotionCache },
                React.createElement(CasualtyChart, {
                    series: [sample(1, 0, 0), sample(6, 100, 90)],
                    deaths: [
                        death("Gargantuan", LEFT, 2, 2),
                        death("Zena", LEFT, 8, 8),
                        death("Beholder", LEFT, 22, 22),
                        death("Wandering Mage", LEFT, 164, 164),
                        death("Arbalester", LEFT, 124, 124),
                        death("Battle Mage", LEFT, 50, 50),
                        death("Fairy", RIGHT, 139, 139),
                        death("Troglodyte", RIGHT, 107, 107),
                        death("Valkyrie", RIGHT, 29, 29),
                        death("Trent", RIGHT, 12, 12),
                        death("Crusader", RIGHT, 6, 6),
                        death("Tsar Cannon", RIGHT, 4, 40),
                    ],
                    viewWidth: 800,
                    viewHeight: 170,
                    drawDurationSec: 0,
                }),
            ),
        );
        const labels = html.match(/all stacks defeated/g) ?? [];
        expect(labels).toHaveLength(11);
        expect(html).toContain('r="16"');
        expect(html).not.toContain("Tsar Cannon");
    });

    test("leaves a portrait on its moment when nothing else is nearby", () => {
        const [marker] = layoutEliminationMarkers(
            [
                {
                    elimination: {
                        creatureKey: "one",
                        name: "Zena",
                        smallTextureName: "zena_512",
                        team: LEFT,
                    },
                    pointX: 220,
                    pointY: 48,
                    lap: 3,
                    sampleIndex: 1,
                    eliminationIndex: 0,
                },
            ],
            { left: 40, right: 760, top: 24, bottom: 120 },
        );
        expect(marker.centerX).toBe(220);
        expect(marker.centerY).toBe(48);
    });
});

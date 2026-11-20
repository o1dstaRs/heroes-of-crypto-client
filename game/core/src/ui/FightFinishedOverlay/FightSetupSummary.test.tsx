import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { Artifact, Doctrine, TeamVals } from "@heroesofcrypto/common";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import type { IFightResultSetup } from "../../scenes/VisibleState";
import { FightArmySetupIcons, FightArmySynergies } from "./FightSetupSummary";
import { DamageBreakdown } from "../FightStats/DamageBreakdown";

const setup: IFightResultSetup = {
    // Deliberately reversed: ordering must follow the player columns, not incoming map/array order.
    armies: [
        {
            team: TeamVals.RIGHT,
            doctrine: Doctrine.Doctrine.SEE_NONE,
            artifactTier1: Artifact.Tier1Artifact.BARREL_BARRICADE,
            artifactTier2: Artifact.Tier2Artifact.PENDANT_OF_VITALITY,
            synergies: ["Chaos:2:2", "Life:2:1"],
        },
        {
            team: TeamVals.LEFT,
            doctrine: Doctrine.Doctrine.SEE_ALL,
            artifactTier1: Artifact.Tier1Artifact.WINGED_BOOTS,
            artifactTier2: Artifact.Tier2Artifact.CROWN_OF_COMMAND,
            synergies: ["Nature:1:3", "Life:2:2", "Might:1:0"],
        },
    ],
    synergyVariants: { Life: 2, Nature: 1, Chaos: 2, Might: 1 },
};
const render = (value?: IFightResultSetup) =>
    renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "result-setup" })}>
            <FightArmySetupIcons
                team={TeamVals.LEFT}
                army={value?.armies.find((army) => army.team === TeamVals.LEFT)}
            />
            <FightArmySetupIcons
                team={TeamVals.RIGHT}
                army={value?.armies.find((army) => army.team === TeamVals.RIGHT)}
            />
            {[TeamVals.LEFT, TeamVals.RIGHT].map((team) => (
                <FightArmySynergies key={team} team={team} army={value?.armies.find((army) => army.team === team)} />
            ))}
        </CacheProvider>,
    );

test("army icon rails retain the correct completed doctrine and both artifact tiers without visible labels", () => {
    const html = render(setup);
    const left = html.slice(
        html.indexOf(`data-result-army="${TeamVals.LEFT}"`),
        html.indexOf(`data-result-army="${TeamVals.RIGHT}"`),
    );
    const right = html.slice(
        html.indexOf(`data-result-army="${TeamVals.RIGHT}"`),
        html.indexOf("data-result-army-synergies="),
    );
    for (const name of ["Spymaster", "Winged Boots", "Crown of Command"]) expect(left).toContain(name);
    for (const name of ["Battle Trance", "Barrel Barricade", "Pendant of Vitality"]) expect(right).toContain(name);
    expect(left).not.toContain("Battle Trance");
    expect(right).not.toContain("Spymaster");
    expect(html.match(/aria-label="Doctrine:/g)).toHaveLength(2);
    expect(html.match(/aria-label="Tier 1 artifact:/g)).toHaveLength(2);
    expect(html.match(/aria-label="Tier 2 artifact:/g)).toHaveLength(2);
    const armies = html.slice(0, html.indexOf("data-result-army-synergies="));
    const icons = [...armies.matchAll(/<span\b[^>]*data-result-choice="icon"[^>]*>(.*?)<\/span>/gs)].map(
        (match) => match[1],
    );
    expect(icons).toHaveLength(6);
    expect(icons.every((icon) => icon.includes("<img") && !icon.includes("<p"))).toBe(true);
});

test("each army shows only its recorded active synergies with one, two or three dots beneath the icon", () => {
    const html = render(setup);
    const synergies = html.slice(html.indexOf("data-result-army-synergies="));
    const left = synergies.slice(0, synergies.indexOf(`data-result-army-synergies="${TeamVals.RIGHT}"`));
    const right = synergies.slice(synergies.indexOf(`data-result-army-synergies="${TeamVals.RIGHT}"`));
    expect(left).toContain('data-result-synergy="Life:2:2"');
    expect(left).toContain('data-result-synergy="Nature:1:3"');
    expect(left.match(/data-result-synergy-dot=/g)).toHaveLength(5);
    expect(right).toContain('data-result-synergy="Life:2:1"');
    expect(right).toContain('data-result-synergy="Chaos:2:2"');
    expect(right.match(/data-result-synergy-dot=/g)).toHaveLength(3);
    expect(left).not.toContain('data-result-synergy="Chaos:');
    expect(right).not.toContain('data-result-synergy="Nature:');
    expect(html).not.toContain('data-result-synergy="Might:1:0"');
    expect(html).toContain('aria-label="Nature: Board units · Level 3"');
    expect(html).not.toContain("data-result-global-synergies");
    expect(html).not.toContain("Synergies:");
});

test("unrecorded, inactive and unrecognized synergy levels do not invent result badges", () => {
    expect(render()).not.toContain("data-result-army-synergies=");
    const html = render({
        armies: [{ team: TeamVals.LEFT, synergies: ["Life:2:0", "Nature:1:4", "Chaos:3:1", "Might:2:NaN"] }],
        synergyVariants: setup.synergyVariants,
    });
    expect(html).not.toContain("data-result-army-synergies=");
});

test("unselected and unrecorded army builds leave all available space to the army portraits", () => {
    for (const value of [
        undefined,
        {
            armies: [
                { team: TeamVals.LEFT, doctrine: 0, artifactTier1: 0, artifactTier2: 0 },
                { team: TeamVals.RIGHT, doctrine: 0, artifactTier1: 0, artifactTier2: 0 },
            ],
            synergyVariants: {},
        },
    ]) {
        const html = render(value);
        expect(html).not.toContain("data-result-army=");
        expect(html).not.toContain('aria-label="Doctrine:');
        expect(html).not.toContain('aria-label="Tier 1 artifact:');
        expect(html).not.toContain('aria-label="Tier 2 artifact:');
    }
    const partial = render({
        armies: [
            {
                team: TeamVals.LEFT,
                doctrine: 0,
                artifactTier1: 0,
                artifactTier2: Artifact.Tier2Artifact.CROWN_OF_COMMAND,
            },
        ],
        synergyVariants: {},
    });
    expect(partial.match(/data-result-army=/g)).toHaveLength(1);
    expect(partial).toContain('aria-label="Tier 2 artifact: Crown of Command"');
    expect(partial).not.toContain('aria-label="Doctrine:');
    expect(partial).not.toContain('aria-label="Tier 1 artifact:');
});

test("unknown nonzero choices stay explicit and legacy synergies never borrow current choices", () => {
    const legacy = render();
    expect(legacy).not.toContain("data-result-army-synergies=");
    expect(legacy).not.toContain('aria-label="Life: Supply"');
    expect(legacy).not.toContain("Fight setup not recorded");
    const html = render({
        armies: [{ team: TeamVals.LEFT, doctrine: 999, artifactTier1: 999, artifactTier2: 0 }],
        synergyVariants: {},
    });
    expect(html).toContain("Unknown doctrine");
    expect(html).toContain("Unknown artifact");
    expect(html).not.toContain("Tier 2 artifact:");
    expect(html.match(/data-result-army=/g)).toHaveLength(1);
});

test("completed results are independent of the doctrine preference for the next game", () => {
    const prior = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: () => {
                throw new Error("result screen must not read a next-game preference");
            },
        },
    });
    try {
        expect(render(setup)).toContain("Doctrine: Spymaster");
    } finally {
        if (prior) Object.defineProperty(globalThis, "localStorage", prior);
        else Reflect.deleteProperty(globalThis, "localStorage");
    }
});

test.each(["both", "enemy only", "neither"])(
    "each army's synergies follow its damage rows even when %s armies dealt damage",
    (mode) => {
        const entries = [
            { team: TeamVals.RIGHT, name: "Dryad", smallTextureName: "dryad_512", damage: 30 },
            { team: TeamVals.LEFT, name: "Scavenger", smallTextureName: "scavenger_512", damage: 10 },
        ].filter((entry) => mode === "both" || (mode === "enemy only" && entry.team === TeamVals.RIGHT));
        const html = renderToStaticMarkup(
            <CacheProvider value={createCache({ key: "result-damage-setup" })}>
                <DamageBreakdown
                    entries={entries}
                    armyHeader={(team) => (
                        <FightArmySynergies team={team} army={setup.armies.find((army) => army.team === team)} />
                    )}
                />
            </CacheProvider>,
        );
        const leftStart = html.indexOf(`data-result-damage-army="${TeamVals.LEFT}"`);
        const rightStart = html.indexOf(`data-result-damage-army="${TeamVals.RIGHT}"`);
        expect(leftStart).toBeGreaterThan(-1);
        expect(rightStart).toBeGreaterThan(leftStart);
        const left = html.slice(leftStart, rightStart);
        const right = html.slice(rightStart);
        expect(left).toContain('data-result-synergy="Nature:1:3"');
        expect(right).toContain('data-result-synergy="Chaos:2:2"');
        expect(left).not.toContain('data-result-synergy="Chaos:');
        expect(right).not.toContain('data-result-synergy="Nature:');
        for (const entry of entries) {
            const column = entry.team === TeamVals.LEFT ? left : right;
            expect(column.indexOf(`${entry.name} (`)).toBeGreaterThan(-1);
            // Synergies sit directly under the section heading, above the army's damage rows.
            expect(column.indexOf(`${entry.name} (`)).toBeGreaterThan(column.indexOf("data-result-army-synergies="));
        }
        if (mode === "neither") expect(html).toContain("No damage was dealt.");
    },
);

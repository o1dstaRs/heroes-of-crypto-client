import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { Artifact, Doctrine, TeamVals } from "@heroesofcrypto/common";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import type { IFightResultSetup } from "../../scenes/VisibleState";
import { FightArmySetupIcons, FightSetupSummary } from "./FightSetupSummary";

const setup: IFightResultSetup = {
    // Deliberately reversed: ordering must follow the player columns, not incoming map/array order.
    armies: [
        {
            team: TeamVals.RIGHT,
            doctrine: Doctrine.Doctrine.SEE_NONE,
            artifactTier1: Artifact.Tier1Artifact.BARREL_BARRICADE,
            artifactTier2: Artifact.Tier2Artifact.PENDANT_OF_VITALITY,
        },
        {
            team: TeamVals.LEFT,
            doctrine: Doctrine.Doctrine.SEE_ALL,
            artifactTier1: Artifact.Tier1Artifact.WINGED_BOOTS,
            artifactTier2: Artifact.Tier2Artifact.CROWN_OF_COMMAND,
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
            <FightSetupSummary setup={value} />
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
        html.indexOf("data-result-synergy="),
    );
    for (const name of ["Spymaster", "Winged Boots", "Crown of Command"]) expect(left).toContain(name);
    for (const name of ["Battle Trance", "Barrel Barricade", "Pendant of Vitality"]) expect(right).toContain(name);
    expect(left).not.toContain("Battle Trance");
    expect(right).not.toContain("Spymaster");
    expect(html.match(/aria-label="Doctrine:/g)).toHaveLength(2);
    expect(html.match(/aria-label="Tier 1 artifact:/g)).toHaveLength(2);
    expect(html.match(/aria-label="Tier 2 artifact:/g)).toHaveLength(2);
    const armies = html.slice(0, html.indexOf('aria-label="Fight setup"'));
    const icons = [...armies.matchAll(/<span\b[^>]*data-result-choice="icon"[^>]*>(.*?)<\/span>/gs)].map(
        (match) => match[1],
    );
    expect(icons).toHaveLength(6);
    expect(icons.every((icon) => icon.includes("<img") && !icon.includes("<p"))).toBe(true);
});

test("the global synergies appear once per faction, using the match's selected variants", () => {
    const html = render(setup);
    expect(html.match(/data-result-synergy=/g)).toHaveLength(4);
    for (const name of [
        "Life: Morale &amp; luck",
        "Nature: Board units",
        "Chaos: Break on attack",
        "Might: Aura range",
    ])
        expect(html).toContain(`aria-label="${name}"`);
    expect(html).toContain("Synergies");
    const synergies = html.slice(html.indexOf('aria-label="Fight setup"'));
    const icons = [...synergies.matchAll(/<span\b[^>]*data-result-choice="icon"[^>]*>(.*?)<\/span>/gs)];
    expect(icons).toHaveLength(4);
    expect(icons.every(([, contents]) => contents.includes("<img") && !contents.includes("<p"))).toBe(true);
    expect(html).not.toContain("Level 1 artifact");
    // No bogus team-wide level is inferred from survivors or one team's final synergy buffs.
    expect(html).not.toContain("lvl 1");
});

test("missing legacy data has an explicit placeholder and unknown ids do not masquerade as an empty slot", () => {
    expect(render()).toContain("Fight setup not recorded");
    const html = render({
        armies: [{ team: TeamVals.LEFT, doctrine: 999, artifactTier1: 999, artifactTier2: 0 }],
        synergyVariants: {},
    });
    expect(html).toContain("Unknown doctrine");
    expect(html).toContain("Unknown artifact");
    expect(html).toContain("Not recorded");
    const none = Artifact.getArtifactProperties(Artifact.ArtifactTier.TIER_2, 0).name;
    expect(html).toContain(`Tier 2 artifact: ${none}`);
    expect(html.match(/data-result-army=/g)).toHaveLength(2);
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

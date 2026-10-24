import { expect, test } from "bun:test";
import { AttackVals, FactionVals, HoCConfig, TeamVals, type UnitProperties } from "@heroesofcrypto/common";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { CssVarsProvider } from "@mui/joy/styles";
import { renderToStaticMarkup } from "react-dom/server.node";
import React from "react";

import { UnitStatsListItem } from "./UnitStatsListItem";
import { formatSidebarStat } from "./sidebarMetrics";
import { SYNERGY_KEY_TO_IMAGE } from "./SynergiesConstants";
import { hocJoyTheme } from "../hocTheme";
import { PixiScene } from "../../pixi/PixiScene";
import type { IVisibleOverallImpact } from "../../scenes/VisibleState";

const shooter = (shots: number): UnitProperties => {
    const unit = HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Orc", "orc_512", 2);
    // A shooter can also carry artifact-granted scrolls. This used to push ammunition into a fourth row.
    return { ...unit, range_shots: shots, range_shots_mod: 0, spells: ["Bless"], can_cast_spells: true };
};

const renderedUnit = (
    unitProperties: UnitProperties,
    overallImpact: IVisibleOverallImpact = { abilities: [], buffs: [], debuffs: [] },
) =>
    renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "hoc-stats-test" })}>
            <CssVarsProvider theme={hocJoyTheme}>
                <UnitStatsListItem
                    unitProperties={unitProperties}
                    overallImpact={overallImpact}
                    factionType={FactionVals.NO_FACTION}
                />
            </CssVarsProvider>
        </CacheProvider>,
    );

const renderedStats = async (unitProperties: UnitProperties) => {
    const html = renderedUnit(unitProperties);
    const stats = { cells: 0, shots: "", distance: "", scrolls: "" };
    const readText = (key: "shots" | "distance" | "scrolls") => ({
        text(chunk: { text: string }) {
            stats[key] += chunk.text;
        },
    });
    await new HTMLRewriter()
        .on('[aria-label="Unit stats"] > div', {
            element() {
                stats.cells += 1;
            },
        })
        .on('[aria-label="Number of ranged shots"] span', readText("shots"))
        .on('[aria-label="Ranged shot distance in cells"] span', readText("distance"))
        .on('[aria-label="Magic scrolls left to cast"] span', readText("scrolls"))
        .transform(new Response(html))
        .text();
    return stats;
};

test.each([{ shots: 6 }, { shots: 5 }, { shots: 0 }])(
    "shows $shots remaining shots alongside scrolls within the three-row stat grid",
    async ({ shots }) => {
        const unit = shooter(shots);
        expect(await renderedStats(unit)).toEqual({
            cells: 9,
            shots: String(shots),
            distance: formatSidebarStat(unit.shot_distance),
            scrolls: "1",
        });
    },
);

test("keeps a native shooter's ammunition visible while melee is selected", async () => {
    const unit = { ...shooter(3), attack_type_selected: AttackVals.MELEE };
    expect((await renderedStats(unit)).shots).toBe("3");
});

test("uses granted ammunition for a melee creature that gains ranged attacks", async () => {
    const unit = { ...shooter(0), attack_type: AttackVals.MELEE, range_shots_mod: 9 };
    expect((await renderedStats(unit)).shots).toBe("9");
});

test("does not add ranged stats for a melee-only creature", async () => {
    const unit = { ...shooter(0), attack_type: AttackVals.MELEE, shot_distance: 0 };
    expect(await renderedStats(unit)).toEqual({ cells: 8, shots: "", distance: "", scrolls: "1" });
});

test("new temporary statuses render before older effects, permanent bonuses and synergy badges", async () => {
    const unit = shooter(6);
    const synergy = Object.keys(SYNERGY_KEY_TO_IMAGE).find((key) => key.startsWith("Life:"))!;
    unit.synergies = [synergy];
    unit.applied_buffs = ["Riot", "Spiritual Armor", "Water Shield"];
    unit.applied_buffs_laps = [5, 1, Number.MAX_SAFE_INTEGER];
    unit.applied_buffs_descriptions = ["Old attack buff.;", "New armor buff.;", "Permanent shield.;"];
    unit.applied_debuffs = ["Weakness", "Quagmire"];
    unit.applied_debuffs_laps = [1, 4];
    unit.applied_debuffs_descriptions = ["Old weakness.;", "New slow.;"];
    const impact = (Object.create(PixiScene.prototype) as PixiScene).getUnitVisibleImpact(unit);
    const icons: string[] = [];
    const statusNames = new Set(["Riot", "Spiritual Armor", "Water Shield", "Weakness", "Quagmire"]);
    await new HTMLRewriter()
        .on("[aria-label]", {
            element(element) {
                const label = element.getAttribute("aria-label")!;
                if (statusNames.has(label)) icons.push(label);
            },
        })
        .on("img", {
            element(element) {
                if (
                    element.getAttribute("src") === SYNERGY_KEY_TO_IMAGE[synergy as keyof typeof SYNERGY_KEY_TO_IMAGE]
                ) {
                    icons.push("synergy");
                }
            },
        })
        .transform(new Response(renderedUnit(unit, impact)))
        .text();
    expect(icons).toEqual(["Spiritual Armor", "Riot", "Water Shield", "synergy", "Quagmire", "Weakness"]);
});

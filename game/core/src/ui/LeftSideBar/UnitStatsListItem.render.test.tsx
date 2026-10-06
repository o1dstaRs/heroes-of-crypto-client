import { expect, test } from "bun:test";
import { AttackVals, FactionVals, HoCConfig, TeamVals, type UnitProperties } from "@heroesofcrypto/common";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { CssVarsProvider } from "@mui/joy/styles";
import { renderToStaticMarkup } from "react-dom/server.node";
import React from "react";

import { UnitStatsListItem } from "./UnitStatsListItem";
import { formatSidebarStat } from "./sidebarMetrics";
import { hocJoyTheme } from "../hocTheme";

const shooter = (shots: number): UnitProperties => {
    const unit = HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Orc", "orc_512", 2);
    // A shooter can also carry artifact-granted scrolls. This used to push ammunition into a fourth row.
    return { ...unit, range_shots: shots, range_shots_mod: 0, spells: ["Bless"], can_cast_spells: true };
};

const renderedStats = async (unitProperties: UnitProperties) => {
    const html = renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "hoc-stats-test" })}>
            <CssVarsProvider theme={hocJoyTheme}>
                <UnitStatsListItem
                    unitProperties={unitProperties}
                    overallImpact={{ abilities: [], buffs: [], debuffs: [] }}
                    factionType={FactionVals.NO_FACTION}
                />
            </CssVarsProvider>
        </CacheProvider>,
    );
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

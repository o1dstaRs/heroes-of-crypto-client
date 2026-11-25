import { expect, test } from "bun:test";
import { FactionVals, HoCConfig, TeamVals } from "@heroesofcrypto/common";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { CssVarsProvider } from "@mui/joy/styles";
import { renderToStaticMarkup } from "react-dom/server.node";
import React from "react";

import { UnitStatsListItem } from "./UnitStatsListItem";
import { hocJoyTheme } from "../hocTheme";

const render = (debuffs: string[]) => {
    const unitProperties = HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Griffin", "griffin_512", 2);
    unitProperties.applied_debuffs = debuffs;
    return renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "hoc-grounded-test" })}>
            <CssVarsProvider theme={hocJoyTheme}>
                <UnitStatsListItem
                    unitProperties={unitProperties}
                    overallImpact={{ abilities: [], buffs: [], debuffs: [] }}
                    factionType={FactionVals.NO_FACTION}
                    animatePortrait={false}
                />
            </CssVarsProvider>
        </CacheProvider>,
    );
};

// The movement cell's icon, read from the rendered <img src> rather than the preload links.
const movementIcon = (html: string) => html.match(/src="[^"]*\/(stat_(?:fly|walk)_gold_v2)\.webp"/)?.[1];

test("a Griffin flies in the sidebar until Gravebound or Hamstrung grounds it", () => {
    expect(movementIcon(render([]))).toBe("stat_fly_gold_v2");
    expect(movementIcon(render(["Quagmire"]))).toBe("stat_fly_gold_v2");
    // Owner ruling 2026-11-25: a grounded flyer walks, so the sidebar shows a walking unit.
    expect(movementIcon(render(["Hamstrung"]))).toBe("stat_walk_gold_v2");
    expect(movementIcon(render(["Gravebound"]))).toBe("stat_walk_gold_v2");
});

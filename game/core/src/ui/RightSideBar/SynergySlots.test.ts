import { describe, expect, it } from "bun:test";
import { createElement } from "react";
// server.node, not the bare "react-dom/server": on some runners bun's condition map resolves the
// default specifier to the BROWSER legacy renderer, whose dev build crashes SSR of Joy tooltips
// ("cache.registered" TypeError). The node entry is the resolution this test means, everywhere.
import { renderToStaticMarkup } from "react-dom/server.node";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { CssVarsProvider } from "@mui/joy/styles";

import { hocJoyTheme } from "../hocTheme";
import { SynergyLadderTip } from "../LeftSideBar/SynergyLadderTip";
import { appliedSynergyLevelByKey, substitutedSynergyDescription, SynergySlotTip } from "./SynergySlots";

describe("synergy sidebar helpers", () => {
    it("fills every {} placeholder with the level's real numbers", () => {
        // The raw templates rendered literally ("+{} morale and +{} luck") — the owner's report.
        expect(substitutedSynergyDescription("Life:2:2")).toBe("The entire army gets +13 morale and +5 luck");
        expect(substitutedSynergyDescription("Life:1:1")).toBe(
            "Increases each unit's supply by 6% at the start of the battle",
        );
        // Break is a 2-lap effect (common effects.json), and it ticks down on the broken unit's own turns.
        expect(substitutedSynergyDescription("Chaos:2:3")).toBe(
            "17% chance to apply Break on attack which disables enemy abilities for 2 turns",
        );
        // Nature:1:2 is [3] since the board-slot rebalance (+2/+3/+4, common 451e4cf).
        expect(substitutedSynergyDescription("Nature:1:2")).toBe("Team can place 3 more units on the board");
        // No leftover placeholders in ANY level of any synergy.
        for (const faction of ["Life", "Chaos", "Might", "Nature"]) {
            for (const variant of [1, 2]) {
                for (const level of [1, 2, 3]) {
                    expect(substitutedSynergyDescription(`${faction}:${variant}:${level}`)).not.toContain("{}");
                }
            }
        }
    });

    it("indexes the applied one-of-two entries by faction:variant", () => {
        expect(appliedSynergyLevelByKey(["Life:2:2", "Might:1:3"])).toEqual({
            "Life:2": 2,
            "Might:1": 3,
        });
        // Zero-level and malformed entries never register as chosen.
        expect(appliedSynergyLevelByKey(["Chaos:1:0", "garbage", ""])).toEqual({});
    });
});

describe("sandbox synergy tooltips", () => {
    // @emotion/react's cache-context default is only a real cache when HTMLElement existed at ITS
    // module init — under bun test there is no DOM, so the default is null and styled components
    // crash on `cache.registered`. The browser never hits this (real DOM); an SSR-style test must
    // hand emotion an explicit cache. CssVarsProvider then supplies the Joy theme like index.tsx.
    const emotionCache = createCache({ key: "hoc-ssr-test" });
    const moraleTip = (unlockedLevel: number, appliedLevel: number) =>
        renderToStaticMarkup(
            createElement(
                CacheProvider,
                { value: emotionCache },
                createElement(
                    CssVarsProvider,
                    { theme: hocJoyTheme },
                    createElement(SynergySlotTip, {
                        faction: "Life",
                        variant: 2,
                        label: "Life Morale & Luck",
                        unlockedLevel,
                        appliedLevel,
                    }),
                ),
            ),
        );

    it("shows the full effect ladder even while locked, without claiming an active effect", () => {
        const html = moraleTip(0, 0);
        expect(html).toContain("The entire army gets +6 morale and +2 luck");
        for (const value of ["Level 1 morale: 6", "Level 2 morale: 13", "Level 3 morale: 20", "Level 3 luck: 9"]) {
            expect(html).toContain(`aria-label="${value}"`);
        }
        expect(html).toContain("2 different Life creatures → lvl 1");
        expect(html).not.toContain("aria-current");
        expect(html).not.toContain("Selected synergy");
        expect(html).not.toContain("Click to field");
    });

    it("highlights the applied level, including when it differs from the available level", () => {
        const html = moraleTip(3, 2);
        expect(html).toContain("The entire army gets +13 morale and +5 luck");
        expect(html).toContain('aria-label="Level 2 morale: 13" aria-current="step"');
        expect(html).toContain('aria-label="Level 2 luck: 5" aria-current="step"');
        expect(html).toContain("Selected synergy");
        expect(html).toContain("6 different Life creatures → lvl 3");
        expect(html).not.toContain("(preview)");
        expect(html).not.toContain("Click to field");
    });

    it("previews an available alternative without marking it as selected", () => {
        const html = moraleTip(3, 0);
        expect(html).toContain("The entire army gets +20 morale and +9 luck");
        expect(html).toContain('aria-label="Level 3 morale: 20 (preview)"');
        expect(html).toContain('aria-label="Level 3 luck: 9 (preview)"');
        expect(html).toContain("Click to field this synergy instead");
        expect(html).not.toContain("aria-current");
        expect(html).not.toContain("Selected synergy");
        expect(html).not.toContain("Confirming this pick");
    });

    it("shows the maximum level when a selected synergy is fully unlocked", () => {
        const html = moraleTip(3, 3);
        expect(html).toContain("Maxed at lvl 3");
        expect(html).not.toContain("lvl 4");
    });

    it("keeps draft previews and their exact remaining-unit counts", () => {
        const renderDraftTip = (previewLevel: number) =>
            renderToStaticMarkup(
                createElement(
                    CacheProvider,
                    { value: emotionCache },
                    createElement(SynergyLadderTip, {
                        faction: "Nature",
                        variant: 2,
                        label: "Flying armor",
                        level: 1,
                        previewLevel,
                        units: 3,
                    }),
                ),
            );
        expect(renderDraftTip(1)).toContain("1 more Nature unit → lvl 2");
        const preview = renderDraftTip(2);
        expect(preview).toContain("Flying units get +24% of additional armor");
        expect(preview).toContain("Confirming this pick → lvl 2");
        expect(preview).toContain('aria-label="Level 1: 15%" aria-current="step"');
        expect(preview).toContain('aria-label="Level 2: 24% (preview)"');
    });
});

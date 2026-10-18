import { afterEach, expect, test } from "bun:test";
import { CREATURES_JSON, CreatureVals, FactionVals, HoCConfig, TeamVals } from "@heroesofcrypto/common";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { CssVarsProvider } from "@mui/joy/styles";
import { renderToStaticMarkup } from "react-dom/server.node";
import React from "react";

import { UnitStatsListItem } from "./UnitStatsListItem";
import {
    installPortraitImageFactoryForTests,
    resetPortraitImageCacheForTests,
    warmDecodedImage,
} from "../decodedImageCache";
import { hocJoyTheme } from "../hocTheme";
import { resolveIntegratedArbalesterPortrait } from "../integratedArbalesterPortrait";
import { resolveLeftSidebarPortraitAnimation } from "../leftSidebarPortraitAnimation";
import { isCreaturePortraitMirrored } from "../creaturePortraitVisual";
import { UNIT_NAME_TO_ID } from "../unit_ui_constants";
import {
    leftSidebarPortraitSources,
    resetLeftSidebarPortraitWarmForTests,
    warmLeftSidebarPortrait,
} from "../leftSidebarPortraitWarm";

afterEach(() => {
    resetLeftSidebarPortraitWarmForTests();
    resetPortraitImageCacheForTests();
});

const installImages = () => {
    installPortraitImageFactoryForTests(() => ({
        decoding: "",
        naturalWidth: 1144,
        naturalHeight: 1616,
        onload: null,
        onerror: null,
        src: "",
        decode: () => Promise.resolve(),
    }));
};

const renderPortrait = async (animatePortrait = true, name = "Arbalester", faction = "Life") => {
    const unitProperties = HoCConfig.getCreatureConfig(
        TeamVals.LEFT,
        faction,
        name,
        `${name.toLowerCase().replaceAll(" ", "_")}_512`,
        2,
    );
    const html = renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "hoc-portrait-test" })}>
            <CssVarsProvider theme={hocJoyTheme}>
                <UnitStatsListItem
                    unitProperties={unitProperties}
                    overallImpact={{ abilities: [], buffs: [], debuffs: [] }}
                    factionType={FactionVals.NO_FACTION}
                    animatePortrait={animatePortrait}
                />
            </CssVarsProvider>
        </CacheProvider>,
    );
    const ids: string[] = [];
    const animatedLabels: string[] = [];
    const atlasElements: Array<{ tag: string; source: string | null }> = [];
    let stillStyle: string | null = null;
    let animatedStyle: string | null = null;
    await new HTMLRewriter()
        .on("[data-creature-portrait]", {
            element(element) {
                ids.push(element.getAttribute("data-creature-portrait")!);
            },
        })
        .on('[aria-label$="animated portrait"]', {
            element(element) {
                animatedLabels.push(element.getAttribute("aria-label")!);
                animatedStyle = element.getAttribute("style");
            },
        })
        .on("img[data-portrait-critical]", {
            element(element) {
                if (element.getAttribute("alt") === name) stillStyle = element.getAttribute("style");
            },
        })
        .on("[data-sidebar-atlas]", {
            element(element) {
                atlasElements.push({ tag: element.tagName, source: element.getAttribute("data-sidebar-atlas") });
            },
        })
        .transform(new Response(html))
        .text();
    return { html, ids, animatedLabels, atlasElements, stillStyle, animatedStyle };
};

test("a first cold selection waits for its complete portrait pair instead of painting a partial creature", async () => {
    expect((await renderPortrait()).ids).toEqual([]);
});

test("a decoded creature still waits for its faction background before the portrait is mounted", async () => {
    installImages();
    const sources = leftSidebarPortraitSources(CreatureVals.ARBALESTER);
    expect(await warmDecodedImage(sources.creature)).toBe(true);
    expect((await renderPortrait()).ids).toEqual([]);
});

test("a ready portrait preserves the integrated animation and inspection can display only its still", async () => {
    installImages();
    expect(await warmLeftSidebarPortrait(CreatureVals.ARBALESTER, false)).toBe(true);
    const animated = await renderPortrait();
    expect(animated.ids).toEqual([String(CreatureVals.ARBALESTER)]);
    expect(animated.animatedLabels).toEqual(["Arbalester animated portrait"]);
    expect(animated.html).toContain(resolveIntegratedArbalesterPortrait(CreatureVals.ARBALESTER, null)!.src);
    expect(animated.atlasElements).toEqual([
        { tag: "canvas", source: resolveIntegratedArbalesterPortrait(CreatureVals.ARBALESTER, null)!.src },
    ]);
    const inspected = await renderPortrait(false);
    expect(inspected.ids).toEqual([String(CreatureVals.ARBALESTER)]);
    expect(inspected.animatedLabels).toEqual([]);
    expect(inspected.atlasElements).toEqual([]);
});

const animatedCreatures = Object.entries(CREATURES_JSON).flatMap(([faction, creatures]) =>
    Object.keys(creatures)
        .map((name) => ({ faction, name, id: UNIT_NAME_TO_ID[name] }))
        .filter(({ id }) => resolveIntegratedArbalesterPortrait(id, resolveLeftSidebarPortraitAnimation(id))),
);
const styleProperties = (style: string | null) =>
    Object.fromEntries(
        (style ?? "")
            .split(";")
            .filter(Boolean)
            .map((property) => property.split(":")),
    );

test.each(animatedCreatures)("$name keeps its still's facing and framing when animation starts", async (creature) => {
    installImages();
    expect(await warmLeftSidebarPortrait(creature.id, false)).toBe(true);
    const animated = await renderPortrait(true, creature.name, creature.faction);
    const still = styleProperties(animated.stillStyle);
    const motion = styleProperties(animated.animatedStyle);
    expect(animated.animatedLabels).toEqual([`${creature.name} animated portrait`]);
    expect(still.transform).toContain(`scaleX(${isCreaturePortraitMirrored(creature.id) ? -1 : 1})`);
    const placement = ["transform", "position", "left", "top", "width", "height", "transform-origin"];
    for (const property of placement) {
        expect(motion[property], `${creature.name}: ${property}`).toBe(still[property]);
    }
    expect(still.opacity).toBe("1");
    expect(motion.opacity).toBe("0");
    const inspected = await renderPortrait(false, creature.name, creature.faction);
    for (const property of placement) {
        expect(styleProperties(inspected.stillStyle)[property]).toBe(still[property]);
    }
    expect(inspected.animatedLabels).toEqual([]);
});

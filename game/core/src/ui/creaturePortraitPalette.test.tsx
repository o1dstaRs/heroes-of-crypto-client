import { CreatureFactionsMap, CreatureVals, FactionVals } from "@heroesofcrypto/common";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { CreaturePortraitImage } from "./CreaturePortraitImage";
import { resolveCreaturePortraitVisual } from "./creaturePortraitVisual";
import {
    CHAOS_PORTRAIT_BACKGROUND_MATRIX,
    HYDRA_PORTRAIT_NON_EMISSIVE_MASK,
    HYDRA_PORTRAIT_SCALE_MATRIX,
    HYDRA_PORTRAIT_WARM_MASK,
} from "./creaturePortraitPalette";

test("all Chaos portraits lift the background, and only Hydra changes the creature palette", () => {
    for (const [id, faction] of Object.entries(CreatureFactionsMap)) {
        const visual = resolveCreaturePortraitVisual(Number(id));
        if (!visual) continue;
        expect(visual.backgroundTone).toBe(faction === FactionVals.CHAOS ? "chaos" : undefined);
        expect(visual.artPalette).toBe(Number(id) === CreatureVals.HYDRA ? "hydra" : undefined);
    }
});

test("Hydra's poster and animated canvas share one palette, outside the faction background", async () => {
    const html = renderToStaticMarkup(
        <CreaturePortraitImage
            creatureId={CreatureVals.HYDRA}
            renderArt={(art) => (
                <>
                    {art}
                    <canvas data-test-animation />
                </>
            )}
        />,
    );
    let insidePalette = false;
    let backgrounds = 0;
    let posters = 0;
    let canvases = 0;
    await new HTMLRewriter()
        .on("[data-hydra-portrait-palette]", {
            element(element) {
                insidePalette = true;
                element.onEndTag(() => {
                    insidePalette = false;
                });
            },
        })
        .on("[data-creature-portrait-background]", {
            element() {
                backgrounds++;
                expect(insidePalette).toBe(false);
            },
        })
        .on('img[alt="Hydra"]', {
            element() {
                posters++;
                expect(insidePalette).toBe(true);
            },
        })
        .on("[data-test-animation]", {
            element() {
                canvases++;
                expect(insidePalette).toBe(true);
            },
        })
        .transform(new Response(html))
        .text();
    expect({ backgrounds, posters, canvases }).toEqual({ backgrounds: 1, posters: 1, canvases: 1 });
    expect(renderToStaticMarkup(<CreaturePortraitImage creatureId={CreatureVals.BLACK_DRAGON} />)).not.toContain(
        "data-hydra-portrait-palette",
    );
});

test("large Hydra portraits sharpen the same still/animation composition while preserving silhouette alpha", () => {
    const large = renderToStaticMarkup(<CreaturePortraitImage creatureId={CreatureVals.HYDRA} highQualityArt />);
    expect(large).toContain("feConvolveMatrix");
    expect(large).toContain('preserveAlpha="true"');
    expect(renderToStaticMarkup(<CreaturePortraitImage creatureId={CreatureVals.HYDRA} />)).not.toContain(
        "feConvolveMatrix",
    );
    expect(
        renderToStaticMarkup(<CreaturePortraitImage creatureId={CreatureVals.BLACK_DRAGON} highQualityArt />),
    ).not.toContain("feConvolveMatrix");
});

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const gradeScale = (rgb: readonly number[]) => {
    const warm = clamp(rgb.reduce((sum, value, i) => sum + value * HYDRA_PORTRAIT_WARM_MASK[i], 0) / 255);
    const nonEmissive = clamp(
        rgb.reduce((sum, value, i) => sum + value * HYDRA_PORTRAIT_NON_EMISSIVE_MASK[i], 0) / 255 +
            HYDRA_PORTRAIT_NON_EMISSIVE_MASK[4],
    );
    return rgb.map((value, channel) => {
        const olive = rgb.reduce(
            (sum, component, i) => sum + component * HYDRA_PORTRAIT_SCALE_MATRIX[channel * 5 + i],
            0,
        );
        return value + (olive - value) * (1 - warm) * nonEmissive;
    });
};

test("the material grade produces olive scales while retaining warm details and the luminous eye", () => {
    for (const anchor of [
        [40, 40, 40],
        [53, 47, 43],
        [16, 60, 76],
    ]) {
        const [red, green, blue] = gradeScale(anchor);
        expect(green).toBeGreaterThan(red);
        expect(green).toBeGreaterThan(blue * 1.5);
    }
    expect(gradeScale([94, 19, 13])).toEqual([94, 19, 13]);
    expect(gradeScale([255, 145, 8])).toEqual([255, 145, 8]);
    expect(gradeScale([45, 80, 245])).toEqual([45, 80, 245]);
    gradeScale([140, 119, 80]).forEach((value, i) => expect(Math.abs(value - [140, 119, 80][i])).toBeLessThan(2));
    expect(HYDRA_PORTRAIT_SCALE_MATRIX.slice(15)).toEqual([0, 0, 0, 1, 0]);
    expect(CHAOS_PORTRAIT_BACKGROUND_MATRIX.slice(15)).toEqual([0, 0, 0, 1, 0]);
    expect(CHAOS_PORTRAIT_BACKGROUND_MATRIX[4] * 255 * (1 - 0.126)).toBeGreaterThan(29);
});

import { expect, test } from "bun:test";
import { getCreaturesByLevel } from "@heroesofcrypto/common";
import { images } from "../generated/image_imports";
import { LEFT_SIDEBAR_PORTRAIT_ATLASES } from "../ui/leftSidebarPortraitAnimationSources";
import { resolveLeftSidebarPortraitBackground } from "../ui/leftSidebarPortraitBackground";
import { resolveLeftSidebarPortraitAnimation } from "../ui/leftSidebarPortraitAnimation";
import { resolveIntegratedArbalesterPortrait } from "../ui/integratedArbalesterPortrait";
import { CREATURE_PORTRAIT_ASSET_KEYS } from "./creaturePortraitAssetKeys";
import { isProductionOmittedAssetKey } from "./imageAssetTiers";
import {
    isProductionOmittedDisabledUnitAnimationAssetKey,
    isProductionOmittedEnvironmentAssetKey,
    isProductionOmittedLegacyUiAssetKey,
    isProductionOmittedUnreferencedAssetKey,
} from "./productionImageAssetPolicy";

test("every roster sidebar has a shippable faction background and every authored animation keeps its pages", () => {
    const keyForSource = new Map(Object.entries(images).map(([key, source]) => [source, key]));
    const omitted = [
        isProductionOmittedAssetKey,
        isProductionOmittedDisabledUnitAnimationAssetKey,
        isProductionOmittedEnvironmentAssetKey,
        isProductionOmittedLegacyUiAssetKey,
        isProductionOmittedUnreferencedAssetKey,
    ];
    let animated = 0;
    for (const creatureId of [1, 2, 3, 4].flatMap((level) => [...getCreaturesByLevel(level)])) {
        const background = resolveLeftSidebarPortraitBackground(creatureId);
        expect(background, `creature ${creatureId}: background`).toBeString();
        const animation = resolveIntegratedArbalesterPortrait(
            creatureId,
            resolveLeftSidebarPortraitAnimation(creatureId),
        );
        if (animation) {
            animated++;
            expect(animation.meta.frameCount).toBeGreaterThan(1);
            expect(animation.pages?.reduce((count, page) => count + page.frameCount, 0)).toBe(
                animation.meta.frameCount,
            );
        }
        const sources = [
            background!,
            ...(animation ? [animation.src, ...animation.pages!.map((page) => page.src)] : []),
        ];
        for (const source of sources) {
            const key = keyForSource.get(source);
            expect(key, `creature ${creatureId}: ${source}`).toBeDefined();
            expect(
                omitted.some((omit) => omit(key!)),
                `creature ${creatureId}: ${key}`,
            ).toBe(false);
        }
    }
    expect(animated).toBeGreaterThan(50);
});

test("production retains every card, sidebar and full-body portrait source used by the local selectors", () => {
    for (const key of CREATURE_PORTRAIT_ASSET_KEYS) {
        expect(isProductionOmittedAssetKey(key), key).toBe(false);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey(key), key).toBe(false);
        expect(isProductionOmittedEnvironmentAssetKey(key), key).toBe(false);
        expect(isProductionOmittedLegacyUiAssetKey(key), key).toBe(false);
        expect(isProductionOmittedUnreferencedAssetKey(key), key).toBe(false);
        expect((images as Record<string, string>)[key], key).toBeString();
    }
});

test("production retains every versioned sidebar animation even when battlefield animations are disabled", () => {
    const filenames = [
        ...Object.values(LEFT_SIDEBAR_PORTRAIT_ATLASES).map((src) =>
            new URL(src, "http://localhost").pathname.split("/").pop()!,
        ),
        "arbalester_v8_atlas.webp",
    ];
    for (const filename of filenames) {
        const key = filename.replace(/\.webp$/, "");
        expect(CREATURE_PORTRAIT_ASSET_KEYS.has(key), key).toBe(true);
        expect(isProductionOmittedAssetKey(key), key).toBe(false);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey(key), key).toBe(false);
        expect(isProductionOmittedEnvironmentAssetKey(key), key).toBe(false);
        expect(isProductionOmittedLegacyUiAssetKey(key), key).toBe(false);
        expect(isProductionOmittedUnreferencedAssetKey(key), key).toBe(false);
    }
});

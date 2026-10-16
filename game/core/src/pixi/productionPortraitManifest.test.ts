import { CreatureVals, getCreaturesByLevel } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import imageKeys from "../generated/image_keys.json";
import { DEFAULT_PORTRAIT_FRAMING, PORTRAIT_FRAMING_CHECKPOINT_X } from "../ui/portraitFraming";
import { REQUIRED_FULL_BODY_PORTRAIT_SOURCES } from "./creaturePortraitAssetKeys";
import { isProductionOmittedAssetKey } from "./imageAssetTiers";
import {
    isProductionOmittedDisabledUnitAnimationAssetKey,
    isProductionOmittedEnvironmentAssetKey,
    isProductionOmittedLegacyUiAssetKey,
    isProductionOmittedUnreferencedAssetKey,
} from "./productionImageAssetPolicy";

// Exercise the real production generator's filtering against the committed source catalog. Do not
// import generated images: CI's permissive image Proxy invents URLs even for omitted production keys.
const sourceCatalog = new Set<string>(imageKeys);
const omissionPredicates = [
    isProductionOmittedAssetKey,
    isProductionOmittedDisabledUnitAnimationAssetKey,
    isProductionOmittedEnvironmentAssetKey,
    isProductionOmittedLegacyUiAssetKey,
    isProductionOmittedUnreferencedAssetKey,
];
const productionManifest = new Set(imageKeys.filter((key) => !omissionPredicates.some((omit) => omit(key))));

// These are approved source alternatives, not portrait fallbacks. In particular, a full-body frame
// must never silently use a *_512 portrait with the crop tuned for its different full-body canvas.
const specialFullSources = new Map<number, readonly string[]>([
    [CreatureVals.ORC, ["orc_model_full"]],
    [CreatureVals.SCAVENGER, ["thief_model_full"]],
    [CreatureVals.WANDERING_MAGE, ["wandering_mage_portrait_full"]],
    [CreatureVals.EFREET, ["efreet_portrait_full_v7", "efreet_portrait_full_v5"]],
    [CreatureVals.MANTIS, ["mantis_portrait_full_v3", "mantis_portrait_full_v2"]],
    [CreatureVals.THUNDERBIRD, ["thunderbird_portrait_full_v2"]],
]);

const creatureEnumName = (creatureId: number): string => {
    const name = Object.entries(CreatureVals).find(([, id]) => id === creatureId)?.[0];
    if (!name) throw new Error(`No common creature enum name for active creature ${creatureId}`);
    return name;
};

const creatureDisplayName = (creatureId: number): string =>
    creatureEnumName(creatureId)
        .toLowerCase()
        .split("_")
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(" ");

const approvedFullSources = (creatureId: number): readonly string[] =>
    specialFullSources.get(creatureId) ?? [`${creatureEnumName(creatureId).toLowerCase()}_portrait_full`];

const selectApprovedSource = (creatureId: number, catalog: ReadonlySet<string>): string | undefined =>
    approvedFullSources(creatureId).find((key) => catalog.has(key));

const activeCreatureIds = [1, 2, 3, 4].flatMap((level) => [...getCreaturesByLevel(level)]);
const fullFramedCreatureIds = activeCreatureIds.filter(
    (creatureId) => (PORTRAIT_FRAMING_CHECKPOINT_X[creatureId] ?? DEFAULT_PORTRAIT_FRAMING).source === "full",
);

describe("production approved full-body portrait manifest", () => {
    test("enumerates the active common roster independently of generated image URLs", () => {
        expect(activeCreatureIds.length).toBeGreaterThan(50);
        expect(new Set(activeCreatureIds).size).toBe(activeCreatureIds.length);
        expect(fullFramedCreatureIds.length).toBeGreaterThan(20);
        expect(fullFramedCreatureIds).toContain(CreatureVals.WOLF_RIDER);
        expect(fullFramedCreatureIds).toContain(CreatureVals.EFREET);
        expect(fullFramedCreatureIds).toContain(CreatureVals.THUNDERBIRD);
        expect(fullFramedCreatureIds).toContain(CreatureVals.MAGIC_DRAGON);
    });

    for (const creatureId of fullFramedCreatureIds) {
        test(`${creatureEnumName(creatureId)} keeps its approved full-body source and declared alternatives`, () => {
            // Derive expectations independently so a missing release-guard group cannot be hidden by
            // a different allowlist entry that happens to keep its asset in the generated manifest.
            expect(
                REQUIRED_FULL_BODY_PORTRAIT_SOURCES[creatureDisplayName(creatureId)],
                `${creatureDisplayName(creatureId)} must be covered by the actual release guard`,
            ).toEqual(approvedFullSources(creatureId));
            const availableApprovedSources = approvedFullSources(creatureId).filter((key) => sourceCatalog.has(key));
            expect(availableApprovedSources.length).toBeGreaterThan(0);
            for (const key of availableApprovedSources) {
                expect(productionManifest.has(key), `${creatureEnumName(creatureId)} requires ${key}`).toBe(true);
                for (const omit of omissionPredicates) expect(omit(key), `${omit.name} prunes ${key}`).toBe(false);
            }
        });
    }

    test("permits only the declared versioned alternatives when an approved preferred source is absent", () => {
        for (const [creatureId, preferred, alternative] of [
            [CreatureVals.EFREET, "efreet_portrait_full_v7", "efreet_portrait_full_v5"],
            [CreatureVals.MANTIS, "mantis_portrait_full_v3", "mantis_portrait_full_v2"],
        ] as const) {
            expect(selectApprovedSource(creatureId, new Set([preferred, alternative]))).toBe(preferred);
            expect(selectApprovedSource(creatureId, new Set([alternative]))).toBe(alternative);
            expect(
                selectApprovedSource(creatureId, new Set([`${creatureEnumName(creatureId).toLowerCase()}_512`])),
            ).toBeUndefined();
        }
        expect(selectApprovedSource(CreatureVals.WOLF_RIDER, new Set(["wolf_rider_512"]))).toBeUndefined();
        expect(selectApprovedSource(CreatureVals.THUNDERBIRD, new Set(["thunderbird_512_v2"]))).toBeUndefined();
    });

    test("keeps superseded full-body versions out of the production manifest", () => {
        for (const key of [
            "efreet_portrait_full_v6",
            "goblin_knight_portrait_full_v2",
            "cyclops_portrait_full_v2",
            "ogre_mage_portrait_full_v2",
            "unicorn_portrait_full_v2",
            "pegasus_portrait_full_v2",
            "griffin_portrait_full_v2",
            "monk_portrait_full_v2",
            "zena_portrait_full_v2",
            "zena_portrait_full_v3",
            "crusader_portrait_full_v2",
            "nightmare_portrait_full_v2",
        ]) {
            expect(sourceCatalog.has(key), `${key} must remain covered by the committed catalog`).toBe(true);
            expect(productionManifest.has(key), `${key} is not an approved source alternative`).toBe(false);
        }
    });
});

import { expect, test } from "bun:test";
import { TIER1_ARTIFACTS, TIER2_ARTIFACTS } from "@heroesofcrypto/common/src/artifacts/artifact_properties";

import release from "../../animation-release.json";
import environmentAssets from "../animations/battlefieldEnvironmentAssets.json";
import levelOneAssets from "../animations/levelOneAssets.json";
import imageKeys from "../generated/image_keys.json";
import { CREATURE_PORTRAIT_ASSET_KEYS } from "../pixi/creaturePortraitAssetKeys";
import shotTrajectoryAssets from "../pixi/shotTrajectoryAssets.json";
import retiredImageAssets from "./retiredImageAssets.json";

test("retired images stay out of the runtime catalog and restore requirements", () => {
    const retired = new Set(retiredImageAssets);
    expect(imageKeys.filter((key) => retired.has(`${key}.webp`))).toEqual([]);
    expect(
        Object.keys(release.files).filter((file) => file.startsWith("images/") && retired.has(file.slice(7))),
    ).toEqual([]);
});

test("cleanup preserves approved portraits, required effects, and artifacts supported by saved games", () => {
    const retired = new Set(retiredImageAssets);
    const protectedKeys = [
        ...CREATURE_PORTRAIT_ASSET_KEYS,
        ...[...Object.values(TIER1_ARTIFACTS), ...Object.values(TIER2_ARTIFACTS)].map((artifact) => artifact.imageKey),
        ...[...levelOneAssets, ...environmentAssets, ...shotTrajectoryAssets].map((asset) => asset.key),
    ];
    expect(protectedKeys.filter((key) => retired.has(`${key}.webp`))).toEqual([]);
});

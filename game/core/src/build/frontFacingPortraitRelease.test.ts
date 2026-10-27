import { CreatureVals, getCreaturesByLevel } from "@heroesofcrypto/common";
import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";

import imageKeys from "../generated/image_keys.json";
import { isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";
import {
    isProductionOmittedDisabledUnitAnimationAssetKey,
    isProductionOmittedEnvironmentAssetKey,
    isProductionOmittedLegacyUiAssetKey,
    isProductionOmittedUnreferencedAssetKey,
} from "../pixi/productionImageAssetPolicy";

const omissionPredicates = [
    isProductionOmittedAssetKey,
    isProductionOmittedDisabledUnitAnimationAssetKey,
    isProductionOmittedEnvironmentAssetKey,
    isProductionOmittedLegacyUiAssetKey,
    isProductionOmittedUnreferencedAssetKey,
];
const releaseImages = Object.fromEntries(
    imageKeys.filter((key) => !omissionPredicates.some((omit) => omit(key))).map((key) => [key, `/assets/${key}.webp`]),
);

interface PortraitModule {
    frontFacingPortraitPreviewSource(creatureId: number): string | undefined;
    frontFacingPortraitBackgroundShadeSource(source: string): string | undefined;
}

for (const mode of ["test", "production"]) {
    test(`${mode} bundle retains approved sandbox portraits with development disabled`, async () => {
        const result = await Bun.build({
            entrypoints: [`${import.meta.dir}/../ui/frontFacingPortraitPreview.ts`],
            target: "node",
            format: "cjs",
            minify: true,
            define: {
                "import.meta.env.DEV": "false",
                "import.meta.env.PROD": "true",
                "import.meta.env.MODE": JSON.stringify(mode),
            },
            plugins: [
                {
                    name: "release-portrait-inputs",
                    setup(build) {
                        build.onLoad({ filter: /generated\/image_imports\.ts$/ }, () => ({
                            contents: `export const images = ${JSON.stringify(releaseImages)};`,
                            loader: "js",
                        }));
                        build.onResolve({ filter: /^@heroesofcrypto\/common$/ }, () => ({
                            path: "creatures",
                            namespace: "portrait-roster",
                        }));
                        build.onLoad({ filter: /.*/, namespace: "portrait-roster" }, () => ({
                            contents: `export const CreatureVals = ${JSON.stringify(CreatureVals)};`,
                            loader: "js",
                        }));
                    },
                },
            ],
        });
        expect(result.success).toBe(true);
        const source = await result.outputs[0].text();
        const module = { exports: {} as PortraitModule };
        const window = { location: { pathname: "/" } };
        runInNewContext(source, { module, exports: module.exports, window });
        const portraits = module.exports;
        const roster = [1, 2, 3, 4].flatMap((level) => [...getCreaturesByLevel(level)]);
        expect(roster.length).toBeGreaterThan(50);

        for (const pathname of ["/", "/sandbox/shared-game", "/preview/picks/level2"]) {
            window.location.pathname = pathname;
            for (const creatureId of roster) {
                expect(portraits.frontFacingPortraitPreviewSource(creatureId), `${pathname}: ${creatureId}`).toMatch(
                    /^\/assets\/portrait_aaa_front_(?:v1|nature_cutout_v2)_.*\.webp$/,
                );
            }
            const valkyrie = portraits.frontFacingPortraitPreviewSource(CreatureVals.VALKYRIE)!;
            expect(portraits.frontFacingPortraitBackgroundShadeSource(valkyrie)).toBe(
                "/assets/portrait_aaa_front_bg_shade_v1_valkyrie.webp",
            );
            expect(portraits.frontFacingPortraitPreviewSource(CreatureVals.ELF)).toBe(
                "/assets/portrait_aaa_front_nature_cutout_v2_elf.webp",
            );
            expect(portraits.frontFacingPortraitPreviewSource(CreatureVals.NO_CREATURE)).toBeUndefined();
        }

        window.location.pathname = "/dev/portrait-framing";
        expect(portraits.frontFacingPortraitPreviewSource(CreatureVals.VALKYRIE)).toBeUndefined();
    });
}

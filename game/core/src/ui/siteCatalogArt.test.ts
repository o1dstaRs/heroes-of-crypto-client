import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import runtimeArt from "../../animation-release.json";
import { resolveCreaturePortraitVisual } from "./creaturePortraitVisual";
import {
    CHAOS_PORTRAIT_BACKGROUND_FILTER,
    HYDRA_PORTRAIT_NON_EMISSIVE_MASK,
    HYDRA_PORTRAIT_SCALE_MATRIX,
    HYDRA_PORTRAIT_WARM_MASK,
} from "./creaturePortraitPalette";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";
import { abilityImageKey, ABILITY_IMAGE_ALIASES } from "./abilityImage";
import { spellIconTextureKey } from "../scenes/spellIcons";
import recipes from "../../../../site/src/lib/generated/portrait-recipes.json";

// Cross-game checks belong in the core suite: its clean CI checkout prepares common and asset stubs.
// The website itself must build from its committed exports without private/generated game files.
const siteRoot = fileURLToPath(new URL("../../../../site/", import.meta.url));
const [{ portraitRecipe }, { abilities }, { spells }, { syncPortraitArt }] = await Promise.all([
    import(join(siteRoot, "src/lib/portrait.ts")),
    import(join(siteRoot, "src/lib/units-data.ts")),
    import(join(siteRoot, "src/lib/spells-data.ts")),
    import(join(siteRoot, "scripts/sync_portrait_art.ts")),
]);

describe("website art parity with the game", () => {
    test("every game creature carries its current framing, orientation, shade and palette", () => {
        for (const [id, name] of Object.entries(UNIT_ID_TO_NAME)) {
            const game = resolveCreaturePortraitVisual(Number(id))!;
            const slug = name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_|_$/g, "");
            const site = portraitRecipe(slug)!;
            expect(site, name).toBeDefined();
            expect(site.art.replace(/\.[a-f0-9]{8}(?=\.webp$)/, ""), name).toBe(
                basename(new URL(game.source).pathname),
            );
            expect(site.background?.replace(/\.[a-f0-9]{8}(?=\.webp$)/, "") ?? null, name).toBe(
                game.background ? basename(new URL(game.background).pathname) : null,
            );
            expect(
                {
                    opacity: site.backgroundOpacity,
                    shadeAlpha: site.shadeAlpha,
                    shadeColor: site.shadeColor,
                    tone: site.backgroundTone,
                    palette: site.artPalette,
                    mirrored: site.mirrored,
                    blur: site.blurBackdrop,
                    fit: site.fit,
                    scale: site.scale,
                    x: site.offsetX,
                    y: site.offsetY,
                },
                name,
            ).toEqual({
                opacity: game.backgroundOpacity,
                shadeAlpha: Number(game.backgroundShadeAlpha.toFixed(4)),
                shadeColor: game.backgroundShadeColor,
                tone: game.backgroundTone,
                palette: game.artPalette,
                mirrored: game.mirrored,
                blur: game.framing.background === "soft",
                fit: game.framing.fit,
                scale: game.framing.scale,
                x: game.framing.offsetX,
                y: game.framing.offsetY,
            });
        }
        expect(recipes.filters).toEqual({
            chaosBackground: CHAOS_PORTRAIT_BACKGROUND_FILTER,
            hydraScale: [...HYDRA_PORTRAIT_SCALE_MATRIX],
            hydraWarmMask: [...HYDRA_PORTRAIT_WARM_MASK],
            hydraNonEmissiveMask: [...HYDRA_PORTRAIT_NON_EMISSIVE_MASK],
        });
    });

    test("spell and ability icon selections follow the game's current art and rename aliases", () => {
        const pins: Record<string, unknown> = runtimeArt.files;
        const filenameFor = (key: string): string =>
            `${pins[`images/${key}.webp`] ? key : (ABILITY_IMAGE_ALIASES[key] ?? key)}.webp`;
        for (const ability of abilities) {
            expect(ability.icon.split("?", 1)[0].split("/").at(-1), ability.name).toBe(
                filenameFor(abilityImageKey(ability.name)),
            );
        }
        for (const spell of spells) {
            expect(spell.icon.split("?", 1)[0].split("/").at(-1), spell.name).toBe(
                filenameFor(spellIconTextureKey(spell.name)),
            );
        }
    });

    test("a missing canonical input leaves existing exports intact, including in --check mode", async () => {
        const root = mkdtempSync(join(tmpdir(), "hoc-portrait-preflight-"));
        try {
            const source = join(root, "source");
            const site = join(root, "site");
            const portraits = join(site, "public/assets/images/units/portraits");
            mkdirSync(source, { recursive: true });
            mkdirSync(portraits, { recursive: true });
            const sentinel = join(portraits, "existing.webp");
            writeFileSync(sentinel, "existing website export");
            const first = resolveCreaturePortraitVisual(Number(Object.keys(UNIT_ID_TO_NAME)[0]))!;
            writeFileSync(join(source, basename(new URL(first.source).pathname)), "first source resolves");
            for (const checkOnly of [false, true]) {
                await expect(syncPortraitArt(source, site, checkOnly)).rejects.toThrow(
                    "Missing canonical portrait art",
                );
                expect(readFileSync(sentinel, "utf8")).toBe("existing website export");
            }
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});

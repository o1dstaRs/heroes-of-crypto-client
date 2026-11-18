import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import runtimeArt from "../../../game/core/animation-release.json";
import { resolveCreaturePortraitVisual } from "../../../game/core/src/ui/creaturePortraitVisual";
import {
    CHAOS_PORTRAIT_BACKGROUND_FILTER,
    HYDRA_PORTRAIT_NON_EMISSIVE_MASK,
    HYDRA_PORTRAIT_SCALE_MATRIX,
    HYDRA_PORTRAIT_WARM_MASK,
} from "../../../game/core/src/ui/creaturePortraitPalette";
import { UNIT_ID_TO_NAME } from "../../../game/core/src/ui/unit_ui_constants";
import { syncPortraitArt } from "../../scripts/sync_portrait_art";
import recipes from "./generated/portrait-recipes.json";
import { portraitFilterMarkup, portraitMarkup, portraitRecipe } from "./portrait";

describe("website portraits share the game's approved presentation", () => {
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

    test("portrait art and faction backgrounds match the published runtime masters without Drive", async () => {
        const pins: Record<string, { sha256: string }> = runtimeArt.files;
        const assets = new Set<string>();
        for (const recipe of Object.values(recipes.creatures)) {
            assets.add(`portraits/${recipe.art}`);
            if (recipe.background) assets.add(`portrait-backgrounds/${recipe.background}`);
        }
        for (const path of assets) {
            const sourceName = basename(path).replace(/\.[a-f0-9]{8}(?=\.webp$)/, "");
            const pin = pins[`images/${sourceName}`];
            expect(pin, sourceName).toBeDefined();
            const bytes = await Bun.file(
                new URL(`../../public/assets/images/units/${path}`, import.meta.url),
            ).arrayBuffer();
            expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex"), path).toBe(pin.sha256);
        }
    });

    test("mirrors the creature and crop, and lifts Chaos backgrounds without grading the whole card", () => {
        const recipe = portraitRecipe("orc")!;
        expect(recipe.mirrored).toBe(true);
        const markup = portraitMarkup("orc", "Orc");
        expect(markup).toContain(
            `translate(${-recipe.offsetX}%, ${recipe.offsetY}%) scale(${recipe.scale}) scaleX(-1)`,
        );
        expect(markup).toContain(`filter:${CHAOS_PORTRAIT_BACKGROUND_FILTER}`);
        expect(markup).toContain("background:#9b3d00");
        expect(markup).not.toContain("portrait__palette");
        expect(portraitMarkup("peasant", "Peasant")).not.toContain(CHAOS_PORTRAIT_BACKGROUND_FILTER);
    });

    test("Hydra grades only the art and shares one page filter across repeated/dynamic portraits", () => {
        const markup = portraitMarkup("hydra", "Hydra");
        expect(markup).toContain('class="portrait__palette" style="filter:url(#site-hydra-portrait-palette)"');
        expect(markup.indexOf("portrait__palette")).toBeGreaterThan(markup.indexOf("portrait__shade"));
        expect(markup).not.toContain("<filter");
        const page = portraitFilterMarkup() + markup + markup;
        expect(page.match(/id="site-hydra-portrait-palette"/g)).toHaveLength(1);
        expect(page).toContain(`values="${HYDRA_PORTRAIT_SCALE_MATRIX.join(" ")}"`);
        expect(page).toContain('in="SourceGraphic" in2="scales" operator="out"');
    });

    test("a missing canonical input leaves existing exports intact, including in --check mode", () => {
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
                expect(() => syncPortraitArt(source, site, checkOnly)).toThrow("Missing canonical portrait art");
                expect(readFileSync(sentinel, "utf8")).toBe("existing website export");
            }
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    test("the icon version check works without a private art checkout", async () => {
        const proc = Bun.spawn([process.execPath, "scripts/sync_catalog_icons.ts", "--check"], {
            cwd: fileURLToPath(new URL("../../", import.meta.url)),
            env: { ...process.env, HOC_IMAGES_LOC: "" },
            stdout: "pipe",
            stderr: "pipe",
        });
        const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
        expect(code, stderr).toBe(0);
    });
});

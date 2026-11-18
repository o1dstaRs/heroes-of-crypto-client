import { describe, expect, test } from "bun:test";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

import runtimeArt from "../../../game/core/animation-release.json";
import {
    CHAOS_PORTRAIT_BACKGROUND_FILTER,
    HYDRA_PORTRAIT_NON_EMISSIVE_MASK,
    HYDRA_PORTRAIT_SCALE_MATRIX,
    HYDRA_PORTRAIT_WARM_MASK,
} from "../../../game/core/src/ui/creaturePortraitPalette";
import recipes from "./generated/portrait-recipes.json";
import { portraitFilterMarkup, portraitMarkup, portraitRecipe } from "./portrait";

describe("website portraits share the game's approved presentation", () => {
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

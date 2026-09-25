/*
 * Bring the site's creature portraits in line with the game's.
 *
 * The site used to keep its own hand-copied `<slug>_512.webp` per creature, refreshed only when someone
 * noticed a drift. That is how it ended up three months behind: 94 of 105 files differed from the art
 * source, and the ones that matched were the six creatures the game has no portrait pipeline for.
 *
 * A byte refresh alone would still have been wrong, because the game does not have "a portrait file". It
 * COMPOSES one: a faction background, a black shade layer, then the creature art under an individually
 * approved crop, scale and offsets, at a 190x256 pick-card frame. This script resolves that recipe through
 * the game's own modules — no second copy of the rules — copies the exact files it names out of the art
 * source, and writes the recipe the site renders from.
 *
 *     bun run --cwd site sync:portraits
 *
 * Run it whenever the art source changes or the framing checkpoint moves, and commit what it writes.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { images } from "../../game/core/src/generated/image_imports";
import {
    creaturePortraitBackgroundKey,
    creaturePortraitBackgroundOpacity,
    creaturePortraitBackgroundShadeAlpha,
} from "../../game/core/src/ui/creaturePortraitBackground";
import { CREATURE_PORTRAIT_ASPECT } from "../../game/core/src/ui/creaturePortraitVisual";
import { normalizePortraitFraming, PICK_PORTRAIT_FRAMING } from "../../game/core/src/ui/portraitFraming";
import { fullBodyCreatureImage, UNIT_ID_TO_IMAGE, UNIT_ID_TO_NAME } from "../../game/core/src/ui/unit_ui_constants";

const SITE = new URL("..", import.meta.url).pathname;
const PORTRAIT_DIR = join(SITE, "public/assets/images/units/portraits");
const BACKGROUND_DIR = join(SITE, "public/assets/images/units/portrait-backgrounds");
const RECIPE_FILE = join(SITE, "src/lib/generated/portrait-recipes.json");

const artSource = process.env.HOC_IMAGES_LOC;
if (!artSource) {
    // Same rule the game keeps (game/core/src/assetLocations.ts): the art location is configuration and is
    // never guessed, because a wrong guess rolls art back with a green exit code.
    console.error("HOC_IMAGES_LOC is not set. It must name the directory holding the game art.");
    process.exit(1);
}

/**
 * The manifest this resolves through decides which portrait each creature gets, because
 * `fullBodyCreatureImage` falls back whenever its first choice is absent — and the two manifests disagree.
 *
 * The framing checkpoint (`PICK_PORTRAIT_FRAMING`: crop, scale, offsets) is authored in the framing editor,
 * which runs in development against the UNPRUNED manifest, so those numbers describe the `*_portrait_full`
 * sources. The deploy builds the game the same way (`build:test` sets no NODE_ENV, so nothing is pruned) and
 * ships all of them. The committed manifest, by contrast, is production-pruned: resolved through it, the
 * same numbers land on the `*_512` art — a whole figure, not a large canvas — and crop a giant head or an
 * empty corner. That is what the website shipped first (owner screenshot 2026-09-23), so this refuses the
 * pruned manifest and names the way to get the other one.
 */
const developmentManifest = Object.keys(images).some((key) => key.endsWith("_portrait_full"));
if (!developmentManifest) {
    console.error(
        [
            "game/core/src/generated/image_imports.ts is the production-PRUNED manifest: no *_portrait_full key resolves,",
            "so every framed creature would fall back to its *_512 art under crop numbers authored for the full-body sources.",
            "Regenerate the development manifest the game is actually built from:",
            "  bun run --cwd game/core generate:images        (no NODE_ENV=production)",
            "then re-run this script, and restore the manifest afterwards if you do not intend to commit it.",
        ].join("\n"),
    );
    process.exit(1);
}

/** `images` holds file: URLs into game/core/images; the site needs the bare filename to copy and serve. */
const fileNameOf = (url: string | undefined): string | undefined => (url ? basename(new URL(url).pathname) : undefined);

const slugOf = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");

export interface PortraitRecipe {
    /** File under public/assets/images/units/portraits, already cache-busted by content. */
    art: string;
    /** File under public/assets/images/units/portrait-backgrounds, or null where the faction has none. */
    background: string | null;
    backgroundOpacity: number;
    shadeAlpha: number;
    /** A blurred copy of the art sits behind it when the approved framing asks for a soft backdrop. */
    blurBackdrop: boolean;
    fit: "cover" | "contain";
    scale: number;
    offsetX: number;
    offsetY: number;
}

const copied = new Map<string, string>();
/** Copy one art file to `dir`, returning the served filename with a content hash for cache busting. */
const publish = (dir: string, fileName: string): string => {
    const cacheKey = `${dir}/${fileName}`;
    const already = copied.get(cacheKey);
    if (already) return already;

    const from = join(artSource, fileName);
    if (!existsSync(from)) {
        console.error(`Missing art: ${fileName} is referenced by the game but absent from HOC_IMAGES_LOC.`);
        process.exit(1);
    }
    const bytes = readFileSync(from);
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
    const served = fileName.replace(/\.webp$/, `.${digest}.webp`);
    writeFileSync(join(dir, served), bytes);
    copied.set(cacheKey, served);
    return served;
};

for (const dir of [PORTRAIT_DIR, BACKGROUND_DIR]) {
    // Rebuilt wholesale: a creature that changes source would otherwise leave its old file behind forever,
    // and the drift checker could not tell an orphan from art the site still serves.
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
}

const recipes: Record<string, PortraitRecipe> = {};
for (const [idText, name] of Object.entries(UNIT_ID_TO_NAME)) {
    const creatureId = Number(idText);
    const framing = normalizePortraitFraming(PICK_PORTRAIT_FRAMING[creatureId]);
    // Exactly the selection resolveCreaturePortraitVisual makes, including its fallback.
    const portraitSource = UNIT_ID_TO_IMAGE[creatureId];
    const source = framing.source === "full" ? (fullBodyCreatureImage(creatureId) ?? portraitSource) : portraitSource;
    const artFile = fileNameOf(source);
    if (!artFile) {
        console.error(`No portrait source resolved for ${name} (id ${creatureId}).`);
        process.exit(1);
    }

    const backgroundKey = creaturePortraitBackgroundKey(creatureId);
    recipes[slugOf(name)] = {
        art: publish(PORTRAIT_DIR, artFile),
        background: backgroundKey ? publish(BACKGROUND_DIR, `${backgroundKey}.webp`) : null,
        backgroundOpacity: creaturePortraitBackgroundOpacity(creatureId),
        shadeAlpha: Number(creaturePortraitBackgroundShadeAlpha(creatureId).toFixed(4)),
        blurBackdrop: framing.background === "soft",
        fit: framing.fit,
        scale: framing.scale,
        offsetX: framing.offsetX,
        offsetY: framing.offsetY,
    };
}

mkdirSync(join(SITE, "src/lib/generated"), { recursive: true });
writeFileSync(
    RECIPE_FILE,
    `${JSON.stringify(
        {
            $comment:
                "AUTO-GENERATED BY site/scripts/sync_portrait_art.ts — do not edit. Resolved from the game's " +
                "own portrait modules against the development image manifest the game is built from.",
            aspectRatio: Number(CREATURE_PORTRAIT_ASPECT.toFixed(6)),
            creatures: Object.fromEntries(Object.entries(recipes).sort(([a], [b]) => a.localeCompare(b))),
        },
        null,
        4,
    )}\n`,
);

const bytesIn = (dir: string): number =>
    readdirSync(dir).reduce((total, f) => total + readFileSync(join(dir, f)).byteLength, 0);

console.log(
    `Portraits synced: ${Object.keys(recipes).length} creatures, ` +
        `${readdirSync(PORTRAIT_DIR).length} art files (${(bytesIn(PORTRAIT_DIR) / 1024 / 1024).toFixed(1)} MB), ` +
        `${readdirSync(BACKGROUND_DIR).length} backgrounds (${(bytesIn(BACKGROUND_DIR) / 1024 / 1024).toFixed(1)} MB).`,
);

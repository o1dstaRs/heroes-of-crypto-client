/*
 * Keep the site's flat icon art in step with the game's.
 *
 * Portraits are composed and get their own script (sync_portrait_art.ts). Everything else the site shows —
 * ability icons, spell icons, artifact icons, faction crests, a few UI pieces — is the same file the game
 * ships, under the same name, so it only has to be mirrored. It had not been: ability icons were 36 of 175
 * behind, spells 26 of 57, because each one was hand-copied whenever somebody noticed.
 *
 *     bun run --cwd site sync:icons          # copy what drifted
 *     bun run --cwd site check:art           # fail if anything has drifted since
 *
 * Site-only art (the home page, knowledge-base screenshots, league emblems) has no counterpart in the art
 * source and is left alone — this only touches files that exist on both sides.
 */
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SITE = new URL("..", import.meta.url).pathname;
const IMAGE_ROOT = join(SITE, "public/assets/images");
/* Composed-portrait art is written by sync_portrait_art.ts under content-hashed names, so it has no
   same-named counterpart in the art source and must not be walked here.

   `anim` holds four sprite atlases for AnimatedUnit.astro, which no page imports — nothing on the site
   references them. Refreshing them from the art source would add 4.6 MB to the repository to feed a
   component that renders nowhere, and an atlas must never be recompressed to claw that back (a crushed
   lava atlas shipped visibly broken once). Left out until something actually uses them. */
const SKIP_DIRECTORIES = new Set(["portraits", "portrait-backgrounds", "anim"]);

const checkOnly = process.argv.includes("--check");

const artSource = process.env.HOC_IMAGES_LOC;
if (!artSource) {
    /* The drift check runs as part of the site tests, and CI has no copy of the art source — it builds
       against generated stubs. So the check reports that it could not run rather than failing the build;
       it is a guard for the machines that DO have the art. Copying, on the other hand, must never guess
       where the art lives (see game/core/src/assetLocations.ts). */
    if (checkOnly) {
        console.log(
            "Skipping the site-art drift check: HOC_IMAGES_LOC is not set, so there is nothing to compare against.",
        );
        process.exit(0);
    }
    console.error("HOC_IMAGES_LOC is not set. It must name the directory holding the game art.");
    process.exit(1);
}

const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.isDirectory()) {
            return SKIP_DIRECTORIES.has(entry.name) ? [] : walk(join(dir, entry.name));
        }
        return entry.isFile() ? [join(dir, entry.name)] : [];
    });

const drifted: string[] = [];
const siteOnly: string[] = [];
let matched = 0;

for (const file of walk(IMAGE_ROOT)) {
    const source = join(artSource, file.split("/").pop()!);
    if (!existsSync(source)) {
        siteOnly.push(relative(IMAGE_ROOT, file));
        continue;
    }
    const sourceBytes = readFileSync(source);
    if (sourceBytes.equals(readFileSync(file))) {
        matched += 1;
        continue;
    }
    drifted.push(relative(IMAGE_ROOT, file));
    if (!checkOnly) {
        copyFileSync(source, file);
    }
}

const summary =
    `${matched} already current, ${drifted.length} drifted, ` +
    `${siteOnly.length} site-only (no counterpart in the art source).`;

if (checkOnly && drifted.length) {
    console.error(`Site art has drifted from ${artSource}:\n  ${drifted.join("\n  ")}`);
    console.error(`\n${summary}`);
    console.error("Run `bun run --cwd site sync:icons` (and sync:portraits) to bring it up to date.");
    process.exit(1);
}

if (checkOnly) {
    console.log(`Site art is in step with the game. ${summary}`);
} else {
    const bytes = drifted.reduce((total, f) => total + statSync(join(IMAGE_ROOT, f)).size, 0);
    console.log(
        `Refreshed ${drifted.length} file(s), ${(bytes / 1024 / 1024).toFixed(1)} MB. ${summary}` +
            (drifted.length ? `\n  ${drifted.join("\n  ")}` : ""),
    );
}

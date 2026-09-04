// scripts/generate_ci_stubs.js
// Writes minimal, type-accurate stubs for the gitignored src/generated/*.ts files
// (image_imports.ts, animation_atlases.ts) so `tsc --noEmit` can run in CI without
// the local image/animation assets. Locally these are produced by
// generate_image_imports.js / generate_animation_atlases.js instead.
// Usage: bun run scripts/generate_ci_stubs.js   (CI only)
const fs = require("fs");
const path = require("path");

const generatedDir = path.resolve(__dirname, "../src/generated");
if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });

const sourceDir = path.resolve(__dirname, "../src");
const imageKeys = new Set();
const scanImageKeys = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== "generated") scanImageKeys(fullPath);
            continue;
        }
        if (!/\.(?:ts|tsx)$/.test(entry.name)) continue;
        const source = fs.readFileSync(fullPath, "utf8");
        for (const match of source.matchAll(/\bimages\.([A-Za-z0-9_]+)/g)) imageKeys.add(match[1]);
        // Pick/sandbox portraits are intentionally resolved through runtimeImages with a slug, so they
        // do not appear as `images.some_key` property accesses. Keep the reverse URL lookup complete in
        // CI as well; otherwise roster tests silently fall back to unframed, unmirrored textures.
        for (const match of source.matchAll(/\bpickSandboxPortrait\("([A-Za-z0-9_]+)"\)/g)) {
            imageKeys.add(`${match[1]}_pick_sandbox_x2`);
        }
    }
};
scanImageKeys(sourceDir);
for (const key of [
    "chaos_portrait_bg_obsidian_fissure_corner_fire_v1",
    "life_portrait_bg_golden_dawn_four_corner_haze_v1",
    "might_portrait_bg_blood_claw_strong_red_corners_v1",
    "nature_portrait_bg_xray_leaf_corner_glow_v2_soft",
]) {
    imageKeys.add(key);
}
for (const name of [
    "Valkyrie",
    "Harpy",
    "Nomad",
    "Hyena",
    "Wyvern",
    "Cyclops",
    "Ogre Mage",
    "Zena",
    "Thunderbird",
    "Behemoth",
    "Frenzied Boar",
    "Black Dragon",
]) {
    imageKeys.add(`${name.toLowerCase().replaceAll(" ", "_")}_portrait_full`);
}

// The runtime builds these keys from creature names, animation states, board dimensions, or constants
// before indexing `images[key]`. The source scanner above can only see direct `images.foo` accesses,
// but the texture-bundle contract tests must exercise the same dynamic entries in CI that production
// receives from the complete generated manifest.
for (const key of [
    "background_stone_tiles_sinister_16x16_original_restored",
    "efreet_battlefield_side_right_final_v1",
    "efreet_battlefield_side_right_v7",
    "lava_center_anim_atlas",
    "nature_portrait_bg_tier_1_2",
    "peasant_512",
    "peasant_walk_atlas_quarter",
    "scavenger_512",
    "thief_model_full",
    "thunderbird_512_v2",
    "thunderbird_battlefield_side_right_final_v1",
    "thunderbird_portrait_full_v2",
    "wolf_attack_atlas_quarter",
    "wolf_idle_atlas_quarter",
    "wolf_walk_atlas",
    "wolf_walk_atlas_quarter",
    "zena_battlefield_side_right_final_v1",
    "zena_battlefield_side_right_v3",
    "zena_final",
]) {
    imageKeys.add(key);
}
for (const columns of [3, 4, 5]) {
    imageKeys.add(`placement_carpet_green_uniform_gold_aaa_${columns}col_v16`);
}
for (const columns of [3, 4, 5, 6]) {
    for (const rows of [14, 16]) {
        imageKeys.add(`placement_gold_outer_border_green_continuous_${columns}col_${rows}row_v23`);
    }
}
const knownImageKeys = [...imageKeys].sort();

const imageImportsStub = `/* CI stub — replaced locally by scripts/generate_image_imports.js */
// Asset-policy and portrait tests exercise the generated lookup contract without downloading the
// private art bundle. Mirror the production generator's URL-shaped values so tests exercise the same
// contract instead of receiving bare asset keys that no browser or texture loader can resolve.
const stubImageUrl = (key: string): string =>
    \`\${new URL(\`../../images/\${key}.webp\`, import.meta.url).toString()}#ci-stub\`;
const knownImages = Object.fromEntries(
    ${JSON.stringify(knownImageKeys)}.map((key) => [key, stubImageUrl(key)]),
) as Record<string, string>;
export const images = new Proxy<Record<string, string>>(knownImages, {
    get: (_target, key) => typeof key === "string" ? stubImageUrl(key) : undefined,
    has: (_target, key) => typeof key === "string",
});
export type ImageKey = keyof typeof images;
`;

const animationAtlasesStub = `/* CI stub — replaced locally by scripts/generate_animation_atlases.js */
export interface IAtlasAnimationMeta {
    frameWidth: number;
    frameHeight: number;
    atlasWidth: number;
    atlasHeight: number;
    frameCount: number;
    fps: number;
    frameDurationSec: number;
    frameDurationsMs?: number[];
    totalDurationSec: number;
    layout: { cols: number; rows: number };
    footAnchorY?: number;
    geometry?: string;
    encoding?: string;
    phases?: {
        intro: { startFrame: number; endFrame: number; loop: boolean; distanceCells?: number; speedMultiplier?: number };
        flight: { startFrame: number; endFrame: number; loop: boolean; distanceCells?: number; speedMultiplier?: number };
        landing: { startFrame: number; endFrame: number; loop: boolean; distanceCells?: number; speedMultiplier?: number };
    };
    loopDurationMs: number;
    pauseMs: number;
}
export type AnimationAtlasMeta = IAtlasAnimationMeta;
export const animationAtlases: Readonly<Record<string, Readonly<Record<string, IAtlasAnimationMeta>>>> = {};
export type AnimationUnitName = string;
export type AnimationStateName<_U extends AnimationUnitName = AnimationUnitName> = string;
`;

fs.writeFileSync(path.join(generatedDir, "image_imports.ts"), imageImportsStub);
// The atlas metadata is COMMITTED (see game/core/.gitignore) so the animation tests run for
// real in CI — only stub it when the checkout somehow lacks it.
const animationAtlasesPath = path.join(generatedDir, "animation_atlases.ts");
if (!fs.existsSync(animationAtlasesPath)) fs.writeFileSync(animationAtlasesPath, animationAtlasesStub);

console.log("Wrote CI typecheck stubs to src/generated/");

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

const imageImportsStub = `/* CI stub — replaced locally by scripts/generate_image_imports.js */
export const images = {} as Record<string, string>;
export type ImageKey = keyof typeof images;
`;

const animationAtlasesStub = `/* CI stub — replaced locally by scripts/generate_animation_atlases.js */
type AtlasMeta = {
    frameWidth: number;
    frameHeight: number;
    atlasWidth: number;
    atlasHeight: number;
    frameCount: number;
    fps: number;
    frameDurationSec: number;
    totalDurationSec: number;
    layout: { cols: number; rows: number };
    loopDurationMs: number;
    pauseMs: number;
};
export const animationAtlases = {} as Record<string, Record<string, AtlasMeta>>;
export type AnimationUnitName = keyof typeof animationAtlases;
export type AnimationStateName<U extends AnimationUnitName = AnimationUnitName> = keyof typeof animationAtlases[U];
`;

fs.writeFileSync(path.join(generatedDir, "image_imports.ts"), imageImportsStub);
fs.writeFileSync(path.join(generatedDir, "animation_atlases.ts"), animationAtlasesStub);

console.log("Wrote CI typecheck stubs to src/generated/");

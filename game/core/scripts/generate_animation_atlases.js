// scripts/generate_animation_atlases.js
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Approved animation art that must never be silently replaced by an older export. The Scavenger
// walk was tuned frame-by-frame (including which leg stays in the foreground), so accepting any
// other bytes here would visibly restore the rejected gait on the next image-generation pass.
const PINNED_ATLAS_SHA256 = Object.freeze({
    "arbalester_idle_atlas.webp": "681ae7d8512e2fcad101a5cce9fab6a4e563b6a66a5c14264812dc6d49f9209a",
    "arbalester_idle_atlas_quarter.webp": "fae89a8440e77c9417115f7b22e152a3b24306259b6951e74377f32bd60d89a9",
    "arbalester_walk_atlas.webp": "0f710bb008f76b26d550e7ec20ffda7af593cfa248d6bbd16050a8a6a52d5a6c",
    "arbalester_walk_atlas_quarter.webp": "0b0163d72b92ec788c8fb7d34d1bb3205781f98918253c330de0065e68afe5bf",
    "peasant_hit_atlas.webp": "e7a70e5bbbcee4c5fff666ff67ff54d07d0dbb133d0f0ed1c33eda311b08c355",
    "peasant_hit_atlas_quarter.webp": "68dae9a288e292a935e0d3fa4837d37e9c7cbdcd4c31fb77e1cf4d8fdbfd5d4c",
    "squire_death_atlas.webp": "5473794426ccf536bcaf7b55417308c2f231dbd41bf357be14465c31af835878",
    "squire_death_atlas_quarter.webp": "b7f9bffde0ccb82d066bd83183999913863f4f3f647f8405873a2951a647f8c0",
    "squire_walk_atlas.webp": "c916b803fa2c5a51bc44cd6326c3be1c699540e4848dc2d2baaedca9a039eddb",
    "squire_walk_atlas_quarter.webp": "fcafc98678c26bfdf23b24555d141459b3301c5ac40e33f5229ac6ee35b4f571",
    "thief_walk_atlas.webp": "975b76a8fe56fe7b9d8a4c94c8a77b9edcffdf68115b5754918ed37970e62be0",
    "thief_walk_atlas_quarter.webp": "379d5657f086a3bdc726002df1f0f27cbf15a94591ea25e9070c78744a880970",
});

function sha256(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// Root directory where all meta.jsons live: always HOC_ANIMATIONS_LOC, or an explicit CLI override.
// See src/assetLocations.ts for why there is no fallback path here.
const { resolveAnimationsOutputLocation } = require("../src/assetLocations");

const animationsRoot = resolveAnimationsOutputLocation(process.env, process.argv[2]);

// TARGET IMAGES DIR: ../images from this script location
const imagesDir = path.resolve(__dirname, "../images");

const generatedDir = path.resolve(__dirname, "../src/generated");
const outputFile = path.join(generatedDir, "animation_atlases.ts");

// Ensure generated + images dirs exist
if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
}
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}

function walkDir(dir, acc = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDir(full, acc);
        } else {
            acc.push(full);
        }
    }
    return acc;
}

// Turn "wolf_rider" -> "Wolf Rider", "angel" -> "Angel"
function toUnitName(base) {
    return base
        .split("_")
        .filter(Boolean)
        .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
        .join(" ");
}

// Extract { unitName, state } from "angel_default_meta.json" / "wolf_rider_default_meta.json"
function parseMetaFileName(filePath) {
    const fileName = path.basename(filePath, ".json"); // e.g. "angel_default_meta"
    const withoutMeta = fileName.replace(/_meta$/, ""); // "angel_default"
    // Directional action names contain an underscore. Match those suffixes before the legacy
    // final-token parser so `ash_moth_attack_up` remains unit "Ash Moth", state "attack_up".
    for (const state of ["melee_attack_up", "melee_attack_down", "melee_attack", "attack_up", "attack_down"]) {
        const suffix = `_${state}`;
        if (withoutMeta.endsWith(suffix)) {
            const base = withoutMeta.slice(0, -suffix.length);
            return base ? { unitName: toUnitName(base), state } : null;
        }
    }
    const parts = withoutMeta.split("_");
    if (parts.length < 2) {
        return null;
    }
    const state = parts[parts.length - 1]; // "default"
    const base = parts.slice(0, -1).join("_"); // "angel", "wolf_rider"
    const unitName = toUnitName(base); // "Angel", "Wolf Rider"
    return { unitName, state };
}

function main() {
    const root = path.resolve(animationsRoot);

    if (!fs.existsSync(root)) {
        console.warn(`Animations root does not exist: ${root}`);
        process.exit(0);
    }

    console.log(`Scanning for *_meta.json and *_atlas.webp under: ${root}`);
    console.log(`Atlas .webp files will be copied into: ${imagesDir}`);

    const allFiles = walkDir(root, []);

    const metaFiles = allFiles.filter((f) => f.endsWith("_meta.json")).sort();
    const atlasWebps = allFiles
        .filter(
            (f) =>
                f.endsWith(".webp") &&
                f.includes(`${path.sep}atlas${path.sep}`) &&
                (f.endsWith("_atlas.webp") || f.endsWith("_atlas_quarter.webp") || f.endsWith("_atlas_half.webp")),
        )
        .sort();

    if (metaFiles.length === 0) {
        console.error("No *_meta.json files found.");
        process.exit(1);
    }

    /** @type {Record<string, Record<string, any>>} */
    const atlasMap = {};

    // --- Build TS meta map ---------------------------------------------------
    for (const file of metaFiles) {
        const info = parseMetaFileName(file);
        if (!info) {
            console.warn(`Skipping (cannot parse name): ${file}`);
            continue;
        }

        const { unitName, state } = info;

        const raw = fs.readFileSync(file, "utf8");
        let json;
        try {
            json = JSON.parse(raw);
        } catch (err) {
            console.warn(`Skipping (invalid JSON): ${file}`, err);
            continue;
        }

        if (!json.meta) {
            console.warn(`Skipping (no "meta" field): ${file}`);
            continue;
        }

        const meta = json.meta;

        // ⭐️ Derive animation timings from totalDurationSec. An authored meta that already carries
        // explicit loopDurationMs/pauseMs (e.g. the frame-timed Peasant idle with no upright pause)
        // keeps its own values: the derived 10%-faster loop with a 40% hold is only the default.
        if (typeof meta.totalDurationSec === "number" && Number.isFinite(meta.totalDurationSec)) {
            const baseTotalMs = meta.totalDurationSec * 1000;
            const loopDurationMs =
                typeof meta.loopDurationMs === "number" && Number.isFinite(meta.loopDurationMs)
                    ? meta.loopDurationMs
                    : Math.round(baseTotalMs * 0.9); // 10% faster
            const pauseMs =
                typeof meta.pauseMs === "number" && Number.isFinite(meta.pauseMs)
                    ? meta.pauseMs
                    : Math.round(loopDurationMs * 0.4); // 40% of loopDurationMs

            meta.loopDurationMs = loopDurationMs;
            meta.pauseMs = pauseMs;
        }

        if (!atlasMap[unitName]) {
            atlasMap[unitName] = {};
        }
        atlasMap[unitName][state] = meta;
    }

    const lines = [];
    lines.push("/* AUTO-GENERATED BY scripts/generate_animation_atlases.js — DO NOT EDIT */");
    lines.push("/* eslint-disable */");
    lines.push("");
    lines.push("/**");
    lines.push(" * One atlas entry per unit per animation state. Typed as an EXPLICIT record on purpose:");
    lines.push(" * the old `as const` + distributed-keyof types collapsed every indexed lookup to `never`");
    lines.push(' * the moment the external art set went heterogeneous (a unit shipping only an "attack"');
    lines.push(' * atlas while the rest carry "default"), which broke the client build at deploy time');
    lines.push(" * even though CI — with no external art drive — stayed green. Consumers already resolve units and");
    lines.push(" * states at runtime (`name in animationAtlases`, `Object.keys(...)`), so string keys");
    lines.push(" * with a strict value shape is the honest contract.");
    lines.push(" */");
    lines.push("export interface IAtlasAnimationMeta {");
    lines.push("    frameWidth: number;");
    lines.push("    frameHeight: number;");
    lines.push("    atlasWidth: number;");
    lines.push("    atlasHeight: number;");
    lines.push("    frameCount: number;");
    lines.push("    fps: number;");
    lines.push("    frameDurationSec: number;");
    lines.push("    frameDurationsMs?: number[];");
    lines.push("    totalDurationSec: number;");
    lines.push("    layout: { cols: number; rows: number };");
    lines.push("    footAnchorY?: number;");
    lines.push("    geometry?: string;");
    lines.push("    encoding?: string;");
    lines.push("    phases?: {");
    lines.push(
        "        intro: { startFrame: number; endFrame: number; loop: boolean; distanceCells?: number; speedMultiplier?: number };",
    );
    lines.push(
        "        flight: { startFrame: number; endFrame: number; loop: boolean; distanceCells?: number; speedMultiplier?: number };",
    );
    lines.push(
        "        landing: { startFrame: number; endFrame: number; loop: boolean; distanceCells?: number; speedMultiplier?: number };",
    );
    lines.push("    };");
    lines.push("    loopDurationMs: number;");
    lines.push("    pauseMs: number;");
    lines.push("    /** Forward-compat: Google Drive art metadata evolves ahead of this generator (e.g. the");
    lines.push("     * multi-phase intro/walk animation data). Undeclared keys pass through untyped so a");
    lines.push("     * new meta field never breaks the DEPLOY build while CI (no external art drive) stays green. */");
    lines.push("    [key: string]: unknown;");
    lines.push("}");
    lines.push("");
    lines.push(
        "export const animationAtlases: Readonly<Record<string, Readonly<Record<string, IAtlasAnimationMeta>>>> =",
    );
    lines.push(JSON.stringify(atlasMap, null, 2) + ";");
    lines.push("");
    lines.push("export type AnimationUnitName = string;");
    lines.push("export type AnimationStateName<_U extends AnimationUnitName = AnimationUnitName> = string;");
    lines.push("export type AnimationAtlasMeta = IAtlasAnimationMeta;");
    lines.push("");

    fs.writeFileSync(outputFile, lines.join("\n"), "utf8");
    console.log(`✅ Animation atlas meta generated successfully: ${outputFile}`);

    // --- Copy atlas .webp files into ../images ------------------------------
    let copied = 0;
    for (const file of atlasWebps) {
        const basename = path.basename(file);
        const dest = path.join(imagesDir, basename);
        const pinnedHash = PINNED_ATLAS_SHA256[basename];
        if (pinnedHash) {
            const actualHash = sha256(file);
            if (actualHash !== pinnedHash) {
                // A cloud sync that lags the approval must not brick regeneration on every OTHER
                // atlas: when the approved file is already in place, keep it and move on. Only a
                // missing approved copy is fatal — then there is nothing correct to ship.
                if (fs.existsSync(dest) && sha256(dest) === pinnedHash) {
                    console.warn(`⚠️ Keeping approved ${basename} (source copy at ${file} is a different revision).`);
                    continue;
                }
                throw new Error(
                    `Refusing to replace approved ${basename}: expected sha256 ${pinnedHash}, got ${actualHash} from ${file}`,
                );
            }
        }
        try {
            fs.copyFileSync(file, dest);
            copied++;
        } catch (err) {
            console.warn(`Failed to copy atlas webp: ${file} -> ${dest}`, err);
        }
    }

    console.log(`✅ Copied ${copied} atlas .webp files into: ${imagesDir}`);
}

main();

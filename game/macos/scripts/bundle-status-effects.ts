import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveAnimationsOutputLocation, resolveImagesLocation } from "../../core/src/assetLocations";
import { animationAtlases, type IAtlasAnimationMeta } from "../../core/src/generated/animation_atlases";
import { images } from "../../core/src/imageAssets";
import { buffDebuffTextureName } from "../../core/src/pixi/PixiScene";
import { effectCaption, EFFECT_FACTION_COLORS } from "../../core/src/scenes/effectCaptions";
import { isPassiveEffectName } from "../../core/src/scenes/effect_pops";
import { BEHOLDER_DEBUFFS, beholderDebuffTextureName } from "../../core/src/scenes/sandbox/BeholderDebuffPops";
import { BOAR_SALIVA_EFFECT } from "../../core/src/scenes/sandbox/BoarSalivaPops";
import { beholderDebuffFramePose } from "../../core/src/scenes/sandbox/beholderDebuffRegistration";
import { borrowedGraceFlagKind } from "../../core/src/scenes/sandbox/borrowedGraceTransfers";
import { statusFlagName, shouldShowStatusFlagPop } from "../../core/src/scenes/sandbox/combatStatusPopups";
import {
    commonFlagFades,
    commonFlagPopArt,
    commonFlagRestarts,
    type FlagPopKind,
} from "../../core/src/scenes/sandbox/CommonFlagPops";
import { MAGIC_REFLECTION_EFFECT } from "../../core/src/scenes/sandbox/MagicReflectionPops";
import { terrifyingGazeFragment } from "../../core/src/scenes/sandbox/TerrifyingGazePops";
import {
    OVERHEAD_EFFECT_DURATION_MS,
    STATUS_EFFECT_APPEARANCE_SPEED,
} from "../../core/src/settings/statusEffectTiming";
import abilities from "../../heroes-of-crypto-common/src/configuration/abilities.json";
import effects from "../../heroes-of-crypto-common/src/configuration/effects.json";
import spells from "../../heroes-of-crypto-common/src/configuration/spells.json";

const output = process.argv[2];
if (!output) throw new Error("Pass the app's Resources directory.");
const atlasDir = join(output, "Atlases");
mkdirSync(atlasDir, { recursive: true });
const localImage = (url: string) => fileURLToPath(url.split("?")[0]);
const packaged = Boolean(process.env.HOC_IMAGES_LOC && process.env.HOC_ANIMATIONS_LOC);
const imageDir = packaged ? resolveImagesLocation(process.env) : "";
const exportsDir = packaged ? join(resolveAnimationsOutputLocation(process.env), "q93_atlases_v1") : "";
const copied = new Set<string>();

function copyArt(url: string, destination: string, required = true): boolean {
    if (!packaged || copied.has(destination)) return true;
    const local = localImage(url);
    const filename = basename(local);
    const released = join(exportsDir, filename.slice(0, -5), "atlas", filename);
    const artwork = [local, released, join(imageDir, filename)].find(existsSync);
    if (!artwork) {
        if (required) throw new Error(`Missing web status art ${filename}`);
        return false;
    }
    copyFileSync(artwork, destination);
    copied.add(destination);
    return true;
}

type Clip = {
    resource: string;
    cols: number;
    rows: number;
    durations: readonly number[];
    style: "common" | "roar" | "cut" | "beholder" | "procedural" | "borrow" | "petrifying";
    fades?: boolean;
    restarts?: boolean;
    registration?: ReturnType<typeof beholderDebuffFramePose>[];
};

const clips: Record<string, Clip> = {};
function addClip(name: string, url: string, meta: IAtlasAnimationMeta | undefined, style: Clip["style"] = "common") {
    if (!meta) throw new Error(`Missing web status timing for ${name}`);
    const resource = basename(localImage(url));
    copyArt(url, join(atlasDir, resource));
    return (clips[name] = {
        resource,
        ...meta.layout,
        durations: meta.frameDurationsMs ?? Array<number>(meta.frameCount).fill(meta.frameDurationSec * 1000),
        style,
    });
}

for (const [kind, { url, meta }] of Object.entries(commonFlagPopArt)) {
    if (!shouldShowStatusFlagPop(kind as FlagPopKind, "combat")) continue;
    const clip = addClip(statusFlagName(kind as FlagPopKind), url, meta);
    clip.fades = commonFlagFades(kind as FlagPopKind);
    clip.restarts = commonFlagRestarts(kind as FlagPopKind);
}
clips["Mass Riot"] = clips.Riot;
clips["Mass Magic Mirror"] = clips["Magic Mirror"];
delete clips.Miss;
addClip("Battle Roar", images.vfx_battle_roar_short_atlas, animationAtlases["Vfx Battle Roar"].short, "roar");
addClip("Boar Saliva", BOAR_SALIVA_EFFECT.url, BOAR_SALIVA_EFFECT.meta);
addClip("Magic Reflection", MAGIC_REFLECTION_EFFECT.url, MAGIC_REFLECTION_EFFECT.meta);
addClip("Borrowed Grace", images.vfx_borrowed_grace_pop_atlas, animationAtlases["Vfx Borrowed Grace"].pop, "borrow");
addClip("Petrifying Gaze", images.vfx_petrifying_gaze_pop_atlas, animationAtlases["Vfx Petrifying Gaze"].pop, "petrifying");
const woundAtlases = [
    images.vfx_deep_wounds_level_1_atlas,
    images.vfx_deep_wounds_level_2_atlas,
    images.vfx_deep_wounds_level_3_atlas,
];
for (const [index, url] of woundAtlases.entries()) {
    const level = index + 1;
    addClip(`Deep Wounds ${level}`, url, animationAtlases["Vfx Deep Wounds Level"][String(level)], "cut");
}
for (const name of BEHOLDER_DEBUFFS) {
    const key = beholderDebuffTextureName(name)! as keyof typeof images;
    const resource = basename(localImage(images[key]));
    copyArt(images[key], join(atlasDir, resource));
    clips[name] = {
        resource,
        cols: 4,
        rows: 4,
        durations: Array<number>(16).fill(1000 / 16),
        style: "beholder",
        registration: Array.from({ length: 16 }, (_, index) => beholderDebuffFramePose(name, index)),
    };
}

const gazeResource = "terrifying-gaze-native.png";
copyArt(images.ember_covenant_ring, join(output, "ember_covenant_ring.webp"));
clips["Terrifying Gaze"] = {
    resource: gazeResource,
    cols: 6,
    rows: 7,
    durations: Array<number>(42).fill(1000 / 42),
    style: "procedural",
};
if (packaged) {
    const shader = join(output, "terrifying-gaze.glsl");
    const texture = join(output, "terrifying-gaze-input.webp");
    copyArt(images.terrifying_gaze_256, texture);
    writeFileSync(shader, terrifyingGazeFragment);
    const rasterizer = process.argv[3];
    if (!rasterizer) throw new Error("Pass the native status shader renderer.");
    const { cols, rows } = clips["Terrifying Gaze"];
    const rendering = Bun.spawnSync(
        [rasterizer, shader, texture, join(atlasDir, gazeResource), String(cols), String(rows)],
        { stdout: "inherit", stderr: "inherit" },
    );
    if (!rendering.success) throw new Error("Could not render Terrifying Gaze's web shader.");
    await Promise.all([Bun.file(shader).delete(), Bun.file(texture).delete()]);
}

const statusNames = new Set([
    ...Object.keys(effects),
    ...Object.values(spells).flatMap((faction) => (typeof faction === "object" ? Object.keys(faction) : [])),
    ...Object.keys(clips),
]);
const passive = [...statusNames, ...Object.keys(abilities)].filter((name) => !clips[name] && isPassiveEffectName(name));
const colors = Object.fromEntries(
    Array.from(
        new Set([...statusNames, ...Object.keys(abilities)]),
        (name) => [name, effectCaption(name).faction] as const,
    ).filter(([, faction]) => faction !== "System"),
);
const icons: Record<string, string> = {};
for (const name of statusNames) {
    if (passive.includes(name) || (clips[name] && borrowedGraceFlagKind(name))) continue;
    const key = buffDebuffTextureName(name) as keyof typeof images;
    const url = images[key];
    if (!url) continue;
    const resource = basename(localImage(url), ".webp");
    if (copyArt(url, join(output, `${resource}.webp`), false)) icons[name] = resource;
}
writeFileSync(
    join(output, "status-effects.json"),
    JSON.stringify({
        clips,
        passive,
        icons,
        colors,
        palette: EFFECT_FACTION_COLORS,
        borrowedClips: [...statusNames].filter((name) => borrowedGraceFlagKind(name)),
        duration: OVERHEAD_EFFECT_DURATION_MS / 1000,
        appearanceSpeed: STATUS_EFFECT_APPEARANCE_SPEED,
    }),
);

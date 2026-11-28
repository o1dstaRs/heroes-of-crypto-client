import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { boardAnimationReferences } from "../../core/scripts/board-animation-reference";
import {
    animationAtlases as approvedAtlases,
    type IAtlasAnimationMeta,
} from "../../core/src/animations/levelOneAtlases";
import { resolveAnimationsOutputLocation } from "../../core/src/assetLocations";
import { animationAtlases as generatedAtlases } from "../../core/src/generated/animation_atlases";
import { approvedAnimationAssetKeysForUnit } from "../../core/src/pixi/creatureAnimationSettings";
import { ANGEL_LAB_FLIGHT_ANCHOR_X, ANGEL_LAB_FLIGHT_CANVAS_SCALE } from "../../core/src/scenes/AngelLabFlight";
import { BEHEMOTH_LAB_WALK_SCALE_X, BEHEMOTH_LAB_WALK_SCALE_Y } from "../../core/src/scenes/BehemothLabWalkCalibration";
import {
    BLACK_DRAGON_LAB_FLIGHT_ANCHOR_X,
    BLACK_DRAGON_LAB_FLIGHT_CANVAS_SCALE,
} from "../../core/src/scenes/BlackDragonLabFlight";
import { BOAR_LAB_WALK_SCALE_X, BOAR_LAB_WALK_SCALE_Y } from "../../core/src/scenes/BoarLabWalkVisuals";
import { FAIRY_LAB_IDLE_CYCLE_MS } from "../../core/src/scenes/FairyLabIdle";
import { FAIRY_IDLE_GESTURE_HAIR_GAINS, fairyIdleMotion } from "../../core/src/scenes/FairyLabIdleVisuals";
import {
    GOBLIN_ETCH_BLADE_POSES,
    GOBLIN_ETCH_CYCLE_MS,
    GOBLIN_ETCH_FRAME_MS,
    GOBLIN_ETCH_START_MS,
} from "../../core/src/scenes/GoblinKnightIdleVisuals";
import {
    HYDRA_LAB_WALK_FOOT_ANCHOR_Y,
    HYDRA_LAB_WALK_HEIGHT_SCALE,
    HYDRA_LAB_WALK_WIDTH_SCALE,
} from "../../core/src/scenes/HydraLabWalkPalette";
import {
    LEPRECHAUN_CLOTH_GRADES,
    LEPRECHAUN_CLOTH_TARGET,
    LEPRECHAUN_IDLE_CLOTH_GRADE,
    LEPRECHAUN_IDLE_HUE_TAILS,
    LEPRECHAUN_WALK_HUE_TAILS,
} from "../../core/src/scenes/LeprechaunLabWalkVisuals";
import {
    MAGIC_DRAGON_LAB_FLIGHT_ANCHOR_X,
    MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE,
} from "../../core/src/scenes/MagicDragonLabFlight";
import { PEGASUS_FLIGHT_ANCHOR_X, PEGASUS_FLIGHT_SCALE } from "../../core/src/scenes/PegasusFlight";
import {
    BATTLEFIELD_TOP_ROW_CREATURE_SCALE,
    EFREET_FIGURE_SCALE,
    EFREET_LAB_IDLE_SCALE_X,
    EFREET_LAB_IDLE_SCALE_Y,
    EFREET_LAB_LOWER_FIRE_BASE_Y,
    FLAG_WAVE_SPEED,
    HYENA_WALK_VISIBLE_HEIGHT_MULTIPLIER,
    SCAVENGER_BOARD_MODEL_HEIGHT_CELLS,
    SQUIRE_DEATH_HORIZONTAL_SCALE_MULTIPLIER,
    SQUIRE_WALK_VISIBLE_SCALE_MULTIPLIER,
    ashMothActionScaleMultiplier,
    battlefieldCreatureScaleMultiplier,
    battlefieldFootLineOffsetCells,
    nomadReactionCanvasScale,
    ogreMageDeathAnchorY,
    peasantActionScaleMultiplier,
    peasantAttackAnchorX,
    peasantAttackHorizontalScaleMultiplier,
    peasantDeathAnchorY,
    refreshedBoardVisualProfileForUnit,
    resolveAnimationAtlasState,
    squireActionCanvasScale,
    tallBoardModelFootAnchorY,
    trentActionCanvasScale,
} from "../../core/src/scenes/RenderableUnit";
import {
    THUNDERBIRD_LAB_FLIGHT_ANCHOR_X,
    THUNDERBIRD_LAB_FLIGHT_CANVAS_SCALE,
} from "../../core/src/scenes/ThunderbirdLabFlight";
import { TROLL_LAB_WALK_SCALE_X, TROLL_LAB_WALK_SCALE_Y } from "../../core/src/scenes/TrollLabWalkVisuals";
import {
    ZENA_IDLE_SHARPEN_DURATIONS_MS,
    ZENA_IDLE_SHARPEN_INTERVAL_MS,
    ZENA_IDLE_WIND_FRAMES,
    ZENA_IDLE_WIND_SUBFRAMES,
} from "../../core/src/scenes/ZenaLabIdle";
import { duplicateIdleOffsetMs } from "../../core/src/settings/idleTiming";
import {
    BATTLEFIELD_CREATURE_FRAMING,
    DEFAULT_BATTLEFIELD_CREATURE_FRAMING,
} from "../../core/src/ui/battlefieldCreatureFraming";
import { idleTimeline } from "./idle-timeline";

const atlasIndex: Record<string, Record<string, IAtlasAnimationMeta>> = generatedAtlases;
const actions = [
    "idle",
    "walk",
    "attack",
    "attack_up",
    "attack_down",
    "melee_attack",
    "melee_attack_up",
    "melee_attack_down",
    "hit",
    "death",
    "cast",
] as const;

const fileStem = (name: string, state: string) => `${name.toLowerCase().replaceAll(" ", "_")}_${state}`;
const atlasMetadata = new Map<string, { state: string; meta: IAtlasAnimationMeta }>();
const atlasPages = new Map<string, { width: number; height: number }>();
for (const registry of [atlasIndex, approvedAtlases]) {
    for (const [family, states] of Object.entries(registry)) {
        for (const [state, meta] of Object.entries(states)) {
            atlasMetadata.set(fileStem(family, state), { state, meta });
            for (const { imageKey, width, height } of meta.pages ?? []) {
                atlasPages.set(`${imageKey}.webp`, { width, height });
            }
        }
    }
}

function registeredAtlasSize(name: string): { width: number; height: number } | undefined {
    const page = atlasPages.get(name);
    if (page) return page;
    const stem = name.replace(/_atlas(?:_half|_quarter)?\.webp$/, "");
    const meta = atlasMetadata.get(stem)?.meta;
    if (!meta) return undefined;
    const divisor = name.endsWith("_quarter.webp") ? 4 : name.endsWith("_half.webp") ? 2 : 1;
    return { width: Math.round(meta.atlasWidth / divisor), height: Math.round(meta.atlasHeight / divisor) };
}

type ClipRegistration = { x: number; y: number; anchorX?: number; foot?: number };

function hasRegistration({ x, y, foot, anchorX }: ClipRegistration): boolean {
    return x !== 1 || y !== 1 || foot !== undefined || anchorX !== undefined;
}

function bowRelease(creature: string, action: string, meta?: IAtlasAnimationMeta) {
    if ((creature !== "Dryad" && creature !== "Elf") || !action.startsWith("attack") || !meta) return undefined;
    const origin = meta.projectileOrigin as { x: number; y: number } | undefined;
    if (!origin || typeof meta.projectileLength !== "number") return undefined;
    // These coordinates are authored against the whole cel, before atlas packing or downsampling.
    return {
        x: origin.x / meta.frameWidth,
        y: origin.y / meta.frameHeight,
        aspect: meta.frameWidth / meta.frameHeight,
        length: meta.projectileLength / meta.frameWidth,
    };
}

// These idles select their painted cels through a pager or shader rather than the main body sprite.
const separateIdleCels = new Set(["Abomination", "Arbalester", "Leprechaun", "Pikeman"]);

function efreetFoot(foot: number, height: number): number {
    return foot + (foot - EFREET_LAB_LOWER_FIRE_BASE_Y / height) * (1 / EFREET_FIGURE_SCALE - 1);
}

const walkRegistration: Record<string, ClipRegistration> = {
    Angel: { x: ANGEL_LAB_FLIGHT_CANVAS_SCALE, y: ANGEL_LAB_FLIGHT_CANVAS_SCALE, anchorX: ANGEL_LAB_FLIGHT_ANCHOR_X },
    Behemoth: { x: BEHEMOTH_LAB_WALK_SCALE_X, y: BEHEMOTH_LAB_WALK_SCALE_Y },
    "Black Dragon": {
        x: BLACK_DRAGON_LAB_FLIGHT_CANVAS_SCALE,
        y: BLACK_DRAGON_LAB_FLIGHT_CANVAS_SCALE,
        anchorX: BLACK_DRAGON_LAB_FLIGHT_ANCHOR_X,
    },
    "Frenzied Boar": { x: BOAR_LAB_WALK_SCALE_X, y: BOAR_LAB_WALK_SCALE_Y },
    Hydra: { x: HYDRA_LAB_WALK_WIDTH_SCALE, y: HYDRA_LAB_WALK_HEIGHT_SCALE, foot: HYDRA_LAB_WALK_FOOT_ANCHOR_Y },
    Hyena: { x: 1, y: HYENA_WALK_VISIBLE_HEIGHT_MULTIPLIER },
    "Magic Dragon": {
        x: MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE,
        y: MAGIC_DRAGON_LAB_FLIGHT_CANVAS_SCALE,
        anchorX: MAGIC_DRAGON_LAB_FLIGHT_ANCHOR_X,
    },
    Pegasus: { x: PEGASUS_FLIGHT_SCALE, y: PEGASUS_FLIGHT_SCALE, anchorX: PEGASUS_FLIGHT_ANCHOR_X },
    Squire: { x: SQUIRE_WALK_VISIBLE_SCALE_MULTIPLIER, y: SQUIRE_WALK_VISIBLE_SCALE_MULTIPLIER },
    Thunderbird: {
        x: THUNDERBIRD_LAB_FLIGHT_CANVAS_SCALE,
        y: THUNDERBIRD_LAB_FLIGHT_CANVAS_SCALE,
        anchorX: THUNDERBIRD_LAB_FLIGHT_ANCHOR_X,
    },
    Troll: { x: TROLL_LAB_WALK_SCALE_X, y: TROLL_LAB_WALK_SCALE_Y },
};

function actionRegistration(
    name: string,
    action: string,
    frame: number,
    foot: number,
    frameHeight: number,
): ClipRegistration {
    if (name === "Efreet") {
        return {
            x: EFREET_FIGURE_SCALE * EFREET_LAB_IDLE_SCALE_X,
            y: EFREET_FIGURE_SCALE * EFREET_LAB_IDLE_SCALE_Y,
            foot: efreetFoot(foot, frameHeight),
        };
    }
    if (action === "walk") return walkRegistration[name] ?? { x: 1, y: 1 };
    if (name === "Peasant") {
        const y = peasantActionScaleMultiplier(action, frame);
        if (action === "death") return { x: y, y, foot: peasantDeathAnchorY(foot, frame) };
        if (action.startsWith("attack"))
            return {
                x: y * peasantAttackHorizontalScaleMultiplier(action, frame),
                y,
                anchorX: peasantAttackAnchorX(action, frame),
            };
    }
    if (name === "Ogre Mage" && action === "death") return { x: 1, y: 1, foot: ogreMageDeathAnchorY(foot, frame) };
    if (name === "Squire") {
        const y = squireActionCanvasScale(action);
        return { x: y * (action === "death" ? SQUIRE_DEATH_HORIZONTAL_SCALE_MULTIPLIER : 1), y };
    }
    const scale = name === "Wandering Mage" ? ashMothActionScaleMultiplier(action, frame) : 1;
    const y = scale * nomadReactionCanvasScale(name, action) * trentActionCanvasScale(name, action);
    return { x: y, y };
}

function animationFamily(creature: string, action: string): string {
    if (creature === "Wandering Mage") return "Ash Moth";
    if (creature === "Scavenger" && action === "idle") return "Scavenger Homm";
    if (creature === "Scavenger" && action === "walk") return "Thief";
    if (creature === "Scavenger" && /^(attack|hit|death)/.test(action)) return "Scavenger Combat";
    return creature;
}

function webpDimensions(file: string): { width: number; height: number } {
    const header = Buffer.alloc(30);
    const descriptor = openSync(file, "r");
    try {
        readSync(descriptor, header, 0, header.length, 0);
    } finally {
        closeSync(descriptor);
    }
    switch (header.toString("ascii", 12, 16)) {
        case "VP8X":
            return { width: header.readUIntLE(24, 3) + 1, height: header.readUIntLE(27, 3) + 1 };
        case "VP8L": {
            const dimensions = header.readUInt32LE(21);
            return { width: (dimensions & 0x3fff) + 1, height: ((dimensions >>> 14) & 0x3fff) + 1 };
        }
        case "VP8 ":
            return { width: header.readUInt16LE(26) & 0x3fff, height: header.readUInt16LE(28) & 0x3fff };
        default:
            throw new Error(`Unrecognized WebP header in ${file}.`);
    }
}

export function bundleAnimations(output: string, creatures: readonly string[]): void {
    if (!process.env.HOC_ANIMATIONS_LOC && !process.env.HOC_IMAGES_LOC) return;
    const location = resolveAnimationsOutputLocation(process.env);
    const images = process.env.HOC_IMAGES_LOC;
    const atlases = join(output, "Atlases");
    mkdirSync(atlases, { recursive: true });
    const files = new Map<string, { path: string; width: number; height: number }>();
    function locateAtlas(directory: string, name: string) {
        const cached = files.get(name);
        if (cached) return cached;
        const expected = registeredAtlasSize(name);
        const candidates = [images && join(images, name), join(directory, name)];
        for (const path of candidates) {
            if (!path || !existsSync(path)) continue;
            try {
                const size = webpDimensions(path);
                // A shared image can have the right filename while belonging to an older frame layout.
                if (expected && (size.width !== expected.width || size.height !== expected.height)) continue;
                const found = { path, ...size };
                files.set(name, found);
                return found;
            } catch (error) {
                // A file-provider placeholder may exist before its contents are available.
                if ((error as NodeJS.ErrnoException).code !== "EDEADLK") throw error;
            }
        }
        return undefined;
    }
    function copyFrom(directory: string, name: string): boolean {
        const target = join(atlases, name);
        if (existsSync(target)) return true;
        const source = locateAtlas(directory, name);
        if (!source) return false;
        copyFileSync(source.path, target);
        return true;
    }
    const references = boardAnimationReferences(creatures, actions, (key) => {
        const stem = key.replace(/_atlas(?:_half|_quarter)?$/, "");
        return locateAtlas(join(location, stem, "atlas"), `${key}.webp`);
    });
    const clips: Record<string, Record<string, object>> = {};
    const framing = Object.fromEntries(
        creatures.map((name) => {
            const profile = refreshedBoardVisualProfileForUnit(name);
            const editor = BATTLEFIELD_CREATURE_FRAMING[name] ?? DEFAULT_BATTLEFIELD_CREATURE_FRAMING;
            return [
                name,
                {
                    ...editor,
                    heightCells: name === "Scavenger" ? SCAVENGER_BOARD_MODEL_HEIGHT_CELLS : profile.heightCells,
                    widthScale: profile.widthScale,
                    squareScale: battlefieldCreatureScaleMultiplier(name, 2, 2),
                    offsetXCells: editor.offsetXCells + profile.offsetXCells,
                    tallOffsetYCells: profile.offsetYCells ?? 0,
                },
            ];
        }),
    );
    writeFileSync(
        join(output, "creature-framing.json"),
        JSON.stringify({
            creatures: framing,
            topRowScale: BATTLEFIELD_TOP_ROW_CREATURE_SCALE,
            standardFootLine: battlefieldFootLineOffsetCells(1),
            tallFootLine: battlefieldFootLineOffsetCells(2),
            duplicateIdleSpacingMs: duplicateIdleOffsetMs(1),
        }),
    );
    const fps = 60;
    const poses = Math.ceil((FAIRY_LAB_IDLE_CYCLE_MS * fps) / 1000);
    const sampleFairyMotion = (start: number) =>
        Array.from({ length: poses }, (_, i) => fairyIdleMotion(start + (i * 1000) / fps));
    writeFileSync(
        join(output, "fairy-idle.json"),
        JSON.stringify({
            fps,
            cycleMs: FAIRY_LAB_IDLE_CYCLE_MS,
            initial: sampleFairyMotion(0),
            repeating: sampleFairyMotion(FAIRY_LAB_IDLE_CYCLE_MS),
            hair: FAIRY_IDLE_GESTURE_HAIR_GAINS,
        }),
    );
    writeFileSync(
        join(output, "leprechaun-cloth.json"),
        JSON.stringify({
            targetHue: LEPRECHAUN_CLOTH_TARGET.hue,
            idle: { grade: LEPRECHAUN_IDLE_CLOTH_GRADE, tails: LEPRECHAUN_IDLE_HUE_TAILS },
            walk: LEPRECHAUN_CLOTH_GRADES.map((grade, index) => ({
                grade,
                tails: LEPRECHAUN_WALK_HUE_TAILS[index],
            })),
        }),
    );
    for (const creature of creatures) {
        const idlePauseMs = atlasIndex[`${creature} Lab`]?.idle?.cycleEndPauseMs;
        const animations: Record<string, object> = {};
        const reference = references.get(creature);
        const webSheets = approvedAnimationAssetKeysForUnit(creature).flatMap((imageKey) => {
            const stem = imageKey.replace(/_atlas(?:_half|_quarter)?$/, "");
            const entry = atlasMetadata.get(stem);
            return entry ? [{ stem, imageKey, ...entry }] : [];
        });
        for (const action of actions) {
            const board = reference?.[action];
            if (creature === "Goblin Knight" && action === "idle") {
                // Pixi selects the sword gesture in a shader, outside the board's body clip.
                const directory = join(location, "goblin_knight_etch", "atlas");
                const resource = "goblin_knight_etch_atlas.webp";
                const columns = 4;
                const rows = 3;
                const atlas = locateAtlas(directory, resource);
                if (atlas?.width !== columns * 768 || atlas.height !== rows * 768 || !copyFrom(directory, resource)) {
                    throw new Error(`Missing the Goblin Knight idle gesture (${resource}).`);
                }
                const gesture = GOBLIN_ETCH_BLADE_POSES.map((_, index) => ({ resource, columns, rows, index }));
                const frameSources = [gesture[0], ...gesture];
                animations.idle = {
                    frameSources,
                    frameCount: frameSources.length,
                    frameDuration: GOBLIN_ETCH_FRAME_MS / 1000,
                    durations: [
                        GOBLIN_ETCH_START_MS,
                        ...gesture.map(() => GOBLIN_ETCH_FRAME_MS),
                        GOBLIN_ETCH_CYCLE_MS - GOBLIN_ETCH_START_MS - gesture.length * GOBLIN_ETCH_FRAME_MS,
                    ],
                    sequence: [...frameSources.map((_, index) => index), 0],
                    footAnchor: 732 / 768,
                };
                continue;
            }
            const idleWind =
                creature === "Zena" && action === "idle"
                    ? {
                          speed: FLAG_WAVE_SPEED,
                          windFrames: ZENA_IDLE_WIND_FRAMES,
                          gestureIntervalMs: ZENA_IDLE_SHARPEN_INTERVAL_MS,
                          gestureHoldsMs: ZENA_IDLE_SHARPEN_DURATIONS_MS,
                          subframes: ZENA_IDLE_WIND_SUBFRAMES,
                      }
                    : undefined;
            // The renderer can reference a frame beyond the available pixels when its dimensions
            // came from a reduced atlas. Use the asset's registered grid for those clips.
            const usableBoardFrames = board?.frames.every(
                ({ resource, columns, rows, index }) => files.has(resource) && index >= 0 && index < columns * rows,
            );
            const usesSeparateIdle = action === "idle" && separateIdleCels.has(creature);
            // The browser paints several idles with shaders over a single body cel. Keep their native
            // animated atlas until the corresponding shader is available, as it is for Nightmare.
            const usesIdleFallback = action === "idle" && board?.frames.length === 1 && creature !== "Nightmare";
            if (board?.frames.length && usableBoardFrames && !usesSeparateIdle && !usesIdleFallback) {
                for (const name of new Set(board.frames.map(({ resource }) => resource))) {
                    const stem = name.replace(/_atlas(?:_half|_quarter)?\.webp$/, "");
                    copyFrom(join(location, stem, "atlas"), name);
                }
                const timeline =
                    action === "idle" && board.frames.length > 1
                        ? idleTimeline(creature, board.holdsMs, idlePauseMs)
                        : { durations: board.holdsMs };
                const footAnchor = board.footAnchorY;
                const idleFraming = creature === "Wolf" ? undefined : board.idleFraming;
                const canvas = idleFraming ?? board.actionScale;
                const profile = framing[creature];
                const baseHeight = profile.heightCells * (canvas?.square ? profile.squareScale : 1);
                const canvasRegistration = canvas && {
                    x: canvas.xCells / (baseHeight * profile.scaleX * profile.widthScale),
                    y: canvas.yCells / (baseHeight * profile.scaleY),
                };
                const idleRegistration = idleFraming &&
                    canvasRegistration && {
                        ...canvasRegistration,
                        anchorX: idleFraming.anchorX,
                        foot:
                            creature === "Efreet"
                                ? efreetFoot(idleFraming.foot, idleFraming.frameHeight)
                                : idleFraming.foot,
                    };
                const sourceMeta = board.frames
                    .map(
                        ({ resource }) =>
                            atlasMetadata.get(resource.replace(/_atlas(?:_half|_quarter)?\.webp$/, ""))?.meta,
                    )
                    .find((meta) => meta?.frameCount === board.frames.length);
                const authoredRegistration = board.frames.map(
                    (source, frame) =>
                        idleRegistration ??
                        actionRegistration(
                            creature,
                            action,
                            frame,
                            footAnchor,
                            files.get(source.resource)!.height / source.rows / (source.trim?.height ?? 1),
                        ),
                );
                // Existing sole and per-frame registrations take precedence over a clip-wide scale.
                const registration =
                    board.actionScale &&
                    canvasRegistration &&
                    creature !== "Wolf" &&
                    creature !== "Arbalester" &&
                    !authoredRegistration.some(hasRegistration)
                        ? board.frames.map(() => canvasRegistration)
                        : authoredRegistration;
                animations[action] = {
                    frameSources: board.frames,
                    frameCount: board.frames.length,
                    frameDuration: timeline.durations[0] / 1000,
                    ...timeline,
                    idleWind,
                    footAnchor,
                    walk: board.walk,
                    impactFrame: sourceMeta?.impactFrameIndex,
                    releaseFrame: sourceMeta?.releaseFrameIndex,
                    bowRelease: bowRelease(creature, action, sourceMeta),
                    browserIdleFraming: idleRegistration ? true : undefined,
                    registration,
                };
                continue;
            }
            let webState = resolveAnimationAtlasState(creature, action);
            if (creature === "Efreet" && action === "walk") webState = "idle";
            const preferred = webSheets.find(({ state }) => state === webState);
            const fallback = fileStem(animationFamily(creature, webState), webState);
            const base = atlasMetadata.get(fallback);
            const usePagedArbalester = creature === "Arbalester" && action === "idle" && base?.meta.pages;
            const candidate = usePagedArbalester ? undefined : preferred;
            const stem = candidate?.stem ?? fallback;
            const meta = candidate?.meta ?? base?.meta;
            if (!meta || meta.frameCount <= 0) continue;

            const sourceDirectory = join(location, stem, "atlas");
            const retina = creature === "Arbalester";
            const pages = meta.pages;
            let resource: string | undefined;
            if (pages?.length) {
                for (const page of pages) {
                    const name = `${page.imageKey}.webp`;
                    if (!copyFrom(sourceDirectory, name)) {
                        throw new Error(`Missing ${name} in the configured animation and image directories.`);
                    }
                }
            } else {
                if (meta.frameCount > meta.layout.cols * meta.layout.rows) continue;
                const variants = retina ? ["_half", "", "_quarter"] : ["_quarter", "_half", ""];
                const files = variants.map((suffix) => `${stem}_atlas${suffix}.webp`);
                if (candidate) files.unshift(`${candidate.imageKey}.webp`);
                resource = files.find((name) => copyFrom(sourceDirectory, name));
                if (!resource) continue;
            }
            const footAnchor = tallBoardModelFootAnchorY(creature, action, meta);
            const frameHeight = resource ? files.get(resource)!.height / meta.layout.rows : meta.frameHeight;
            // The web's idle shader maps the padded atlas cel onto the original standing sprite.
            // Draw the whole cel at the same scale per authored pixel on Mac.
            const paddedIdleScale =
                stem === "leprechaun_lab_idle"
                    ? meta.frameHeight / approvedAtlases.Leprechaun.idle.frameHeight
                    : undefined;
            const registration = Array.from({ length: meta.frameCount }, (_, frame) =>
                paddedIdleScale === undefined
                    ? actionRegistration(creature, action, frame, footAnchor, frameHeight)
                    : { x: paddedIdleScale, y: paddedIdleScale },
            );
            const durations =
                creature === "Wolf" && action === "idle"
                    ? meta.frameDurationsMs?.map((duration) => duration / 1.3)
                    : meta.frameDurationsMs;
            const timeline = usesSeparateIdle
                ? idleTimeline(
                      creature,
                      durations ?? Array(meta.frameCount).fill(meta.frameDurationSec * 1000),
                      idlePauseMs,
                  )
                : { durations };
            animations[action] = {
                resource,
                columns: meta.layout.cols,
                rows: meta.layout.rows,
                frameCount: meta.frameCount,
                frameDuration: meta.frameDurationSec,
                ...timeline,
                idleWind,
                footAnchor,
                impactFrame: typeof meta.impactFrameIndex === "number" ? meta.impactFrameIndex : undefined,
                releaseFrame: typeof meta.releaseFrameIndex === "number" ? meta.releaseFrameIndex : undefined,
                bowRelease: bowRelease(creature, action, meta),
                registration: registration.some(hasRegistration) ? registration : undefined,
                pages: pages?.map(({ imageKey, firstFrame, frameCount, cols, rows }) => ({
                    resource: `${imageKey}.webp`,
                    firstFrame,
                    frameCount,
                    columns: cols,
                    rows,
                })),
            };
        }
        if (!animations.idle || !animations.walk || (!animations.attack && !animations.melee_attack)) {
            throw new Error(`The idle, walk, and attack atlases for ${creature} are incomplete under ${location}.`);
        }
        clips[creature] = animations;
    }
    writeFileSync(join(output, "animations.json"), JSON.stringify(clips));
}

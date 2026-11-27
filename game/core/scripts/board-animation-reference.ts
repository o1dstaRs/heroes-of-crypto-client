import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";
import { BufferImageSource, Container, Texture } from "pixi.js";
import creatures from "../../heroes-of-crypto-common/src/configuration/creatures.json";
import { RenderableUnit } from "../src/scenes/RenderableUnit";

type AtlasPlayback = NonNullable<ReturnType<RenderableUnit["getAnimationAtlasPlayback"]>>;

export interface BoardAtlasFrame {
    resource: string;
    columns: number;
    rows: number;
    index: number;
    trim?: { x: number; y: number; width: number; height: number };
}

interface BoardAtlasClip {
    frames: BoardAtlasFrame[];
    holdsMs: readonly number[];
    footAnchorY: number;
    walk?: AtlasPlayback["walk"];
    idleFraming?: {
        xCells: number;
        yCells: number;
        square: boolean;
        anchorX: number;
        foot: number;
        frameHeight: number;
    };
}

const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const factions = new Map(
    Object.entries(creatures).flatMap(([faction, entries]) =>
        typeof entries === "object" ? Object.keys(entries).map((name) => [name, faction] as const) : [],
    ),
);

/** Resolve the browser's real sprite selection and timing without creating a renderer or uploading textures. */
export function boardAnimationReferences(
    names: readonly string[],
    actions: readonly string[],
    dimensions: (key: string) => { width: number; height: number } | undefined,
): Map<string, Record<string, BoardAtlasClip>> {
    const host = globalThis as { document?: unknown };
    const previousDocument = host.document;
    host.document ??= {
        cookie: "",
        createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
        querySelector: () => null,
    };
    const textures = new Map<string, Texture>();
    const pixel = new Uint8Array(4);
    const texture = (key: string): Texture => {
        const found = textures.get(key);
        if (found) return found;
        const size = dimensions(key) ?? { width: 8192, height: 8192 };
        const result = new Texture({ source: new BufferImageSource({ resource: pixel, ...size, label: key }) });
        textures.set(key, result);
        return result;
    };
    const captureFrame = ({ frame, source, trim, orig }: Texture): BoardAtlasFrame => {
        const columns = Math.max(1, Math.round(source.pixelWidth / frame.width));
        const rows = Math.max(1, Math.round(source.pixelHeight / frame.height));
        return {
            resource: `${source.label}.webp`,
            columns,
            rows,
            index: Math.round(frame.y / frame.height) * columns + Math.round(frame.x / frame.width),
            trim: trim
                ? {
                      x: trim.x / orig.width,
                      y: trim.y / orig.height,
                      width: trim.width / orig.width,
                      height: trim.height / orig.height,
                  }
                : undefined,
        };
    };
    const capture = (playback: AtlasPlayback): BoardAtlasClip => ({
        frames: playback.frames.map(captureFrame),
        holdsMs: playback.holdsMs,
        footAnchorY: playback.footAnchorY,
        walk: playback.walk,
    });
    const references = new Map<string, Record<string, BoardAtlasClip>>();
    try {
        for (const name of names) {
            const faction = factions.get(name);
            if (!faction) throw new Error(`Unknown battlefield creature ${name}`);
            const effects = new EffectFactory();
            const base = Unit.createUnit(
                HoCConfig.getCreatureConfig(
                    TeamVals.LEFT,
                    faction,
                    name,
                    name.toLowerCase().replaceAll(" ", "_") + "_512",
                    1,
                ),
                grid,
                TeamVals.LEFT,
                UnitVals.CREATURE,
                new AbilityFactory(effects),
                effects,
                false,
            );
            const unit = RenderableUnit.fromBase(base, texture);
            const root = new Container();
            const clips: Record<string, BoardAtlasClip> = {};
            try {
                unit.setPosition(0, 1024);
                unit.ensureVisual(root, grid, 0);
                const idle = unit.getAnimationAtlasPlayback("idle");
                const resting = unit.getBattlefieldPreviewAt(unit.getPosition(), grid);
                if (idle && resting) {
                    // Cannon paints its resting pose through the material renderer, outside the usual clip.
                    const clip =
                        name === "Tsar Cannon"
                            ? { frames: [captureFrame(resting.texture)], holdsMs: [1000], footAnchorY: resting.anchorY }
                            : capture(idle);
                    clips.idle = {
                        ...clip,
                        idleFraming: {
                            xCells: (Math.abs(resting.scaleX) * resting.texture.height) / grid.getCellSize(),
                            yCells: (Math.abs(resting.scaleY) * resting.texture.height) / grid.getCellSize(),
                            square: unit.getFootprintWidth() === 2 && unit.getFootprintHeight() === 2,
                            anchorX: resting.anchorX,
                            foot: resting.anchorY,
                            frameHeight: resting.texture.height,
                        },
                    };
                }

                unit.startBoardWalkAnimation(1);
                const walk = unit.getAnimationAtlasPlayback("walk");
                if (walk) clips.walk = capture(walk);
                unit.stopBoardWalkAnimation();

                for (const action of actions) {
                    if (action === "idle" || action === "walk") continue;
                    if (unit.playOneShotAnimation(action, undefined, true)) {
                        const playback = unit.getAnimationAtlasPlayback("action");
                        if (playback) clips[action] = capture(playback);
                    }
                    unit.returnToIdleAnimation();
                }
                references.set(name, clips);
            } finally {
                root.destroy({ children: true });
            }
        }
    } finally {
        if (previousDocument === undefined) delete host.document;
        else host.document = previousDocument;
    }
    return references;
}

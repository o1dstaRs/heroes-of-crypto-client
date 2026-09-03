import {
    AnimatedSprite,
    Assets,
    ColorMatrixFilter,
    Container,
    Graphics,
    Rectangle,
    Sprite,
    Text,
    TextStyle,
    Texture,
} from "pixi.js";
import { HOC_NUMERIC_ARIAL_FONT_FAMILY } from "../fontFamilies";
import { images } from "../generated/image_imports";
import {
    normalizeLoadingScreenFireTuning,
    readStoredLoadingScreenFireTuning,
    type LoadingScreenFireTuning,
    type LoadingScreenFireType,
    type LoadingScreenFireZoneTuning,
} from "./loadingScreenFireTuning";

const FORGING_BACKGROUND_URL = images.loading_screen_forging_base;
const FORGING_LAVA_URL = images.loading_screen_forging_lava_strip;
// Keep the cache key versioned. A missing hashed asset is served by the SPA fallback in production, and
// browsers may otherwise cache that HTML response under this image URL long after the file is restored.
const DRAGON_MEDALLION_URL = `${images.loading_screen_dragon_medallion}?v=20260825`;
const FORGING_EXACT_OVERLAY_URL = images.loading_screen_forging_exact_overlay;
const LOADING_SCREEN_ONLY_URLS = [
    FORGING_BACKGROUND_URL,
    FORGING_LAVA_URL,
    DRAGON_MEDALLION_URL,
    FORGING_EXACT_OVERLAY_URL,
    images.ambient_fire_left_brazier_atlas,
] as const;

const FIRE_ATLAS_DEFINITIONS: Record<
    LoadingScreenFireType,
    { url: string; frameWidth: number; frameHeight: number; frameCount: number; columns: number }
> = {
    furnace: {
        url: images.ambient_fire_left_furnace_atlas,
        frameWidth: 256,
        frameHeight: 128,
        frameCount: 12,
        columns: 4,
    },
    brazier: {
        url: images.ambient_fire_left_brazier_atlas,
        frameWidth: 128,
        frameHeight: 128,
        frameCount: 12,
        columns: 4,
    },
};

const ART_WIDTH = 1672;
const ART_HEIGHT = 941;
const TRACK_X = 510;
const TRACK_Y = 744;
const TRACK_WIDTH = 652;
const TRACK_HEIGHT = 27;
const TRACK_START_POCKET_RADIUS = 24;
const TRACK_CENTER_Y = TRACK_Y + TRACK_HEIGHT / 2;
const TRACK_MIDDLE_X = TRACK_X + TRACK_WIDTH / 2;
const FINAL_SLIDER_POSITION_PROGRESS = 0.99;
const EXACT_OVERLAY_MEDALLION_PROGRESS = 0.96;
const EXACT_OVERLAY_MEDALLION_CUTOUT_RADIUS = 38;
const EXACT_OVERLAY_LABEL_CUTOUT_X = 530;
const EXACT_OVERLAY_LABEL_CUTOUT_Y = 797;
const EXACT_OVERLAY_LABEL_CUTOUT_WIDTH = 612;
const EXACT_OVERLAY_LABEL_CUTOUT_HEIGHT = 52;
const MIRRORED_BAR_LEFT_X = 408;
const MIRRORED_BAR_TOP = 700;
const MIRRORED_BAR_HALF_WIDTH = TRACK_MIDDLE_X - MIRRORED_BAR_LEFT_X;
const MIRRORED_BAR_HEIGHT = 116;
const MIRRORED_BAR_RIGHT_X = TRACK_MIDDLE_X + MIRRORED_BAR_HALF_WIDTH;
// The approved overlay's original right spear tip extends a few pixels beyond the mirrored runtime bar.
// Cut that baked tail as well so it cannot remain visible as a detached shard after recomposition.
const MIRRORED_BAR_OVERLAY_CUTOUT_RIGHT_PADDING = 24;
export const LOADING_SCREEN_MEDALLION_ASSET_SIZE = 105;
const LABEL_Y = 821;

interface FireZoneRuntime {
    container: Container;
    mask: Graphics;
    sprites: AnimatedSprite[];
}

export class LoadingScreen extends Container {
    private readonly viewportBackground = new Graphics();
    private readonly artwork = new Container();
    private readonly backgroundSprite: Sprite;
    private readonly exactOverlaySprite: Sprite;
    private readonly exactOverlayMask = new Graphics();
    private readonly loadedBarLayer = new Container();
    private readonly loadedBarMask = new Graphics();
    private readonly unloadedBarLayer = new Container();
    private readonly unloadedBarMask = new Graphics();
    private readonly progressGlow = new Graphics();
    private readonly lavaSprite: Sprite;
    private readonly lavaPocketSprite: Sprite;
    private readonly lavaMask = new Graphics();
    private readonly trackSections = new Graphics();
    private readonly fireFrames: Record<LoadingScreenFireType, Texture[]>;
    private readonly fireZone: FireZoneRuntime;
    private readonly mirroredFireZone: FireZoneRuntime;
    private readonly secondaryFireZone: FireZoneRuntime;
    private readonly dragonMedallion: Sprite;
    private readonly loadingLabel: Text;
    private fireTuning: LoadingScreenFireTuning;
    private firePlaybackPaused = false;
    private fireScrubFrame = 0;
    private progress = 0;
    private constructor(
        screenWidth: number,
        screenHeight: number,
        background: Texture,
        lava: Texture,
        medallion: Texture,
        exactOverlay: Texture,
        fireAtlases: Record<LoadingScreenFireType, Texture>,
    ) {
        super();

        this.fireTuning = readStoredLoadingScreenFireTuning();
        this.fireFrames = {
            furnace: this.sliceFireAtlas("furnace", fireAtlases.furnace),
            brazier: this.sliceFireAtlas("brazier", fireAtlases.brazier),
        };
        this.fireZone = this.createFireZone();
        this.mirroredFireZone = this.createFireZone();
        this.secondaryFireZone = this.createFireZone();

        this.backgroundSprite = new Sprite(background);
        this.backgroundSprite.width = ART_WIDTH;
        this.backgroundSprite.height = ART_HEIGHT;

        // The approved loading-screen composition is used as a single top-level plate. Keeping it as
        // one image avoids recreating its proportions, joins, section ornaments and medallion in code.
        this.exactOverlaySprite = new Sprite(exactOverlay);
        this.exactOverlaySprite.width = ART_WIDTH;
        this.exactOverlaySprite.height = ART_HEIGHT;
        this.exactOverlaySprite.eventMode = "none";
        this.exactOverlayMask
            .rect(0, 0, ART_WIDTH, ART_HEIGHT)
            .fill(0xffffff)
            .circle(
                TRACK_X + TRACK_WIDTH * EXACT_OVERLAY_MEDALLION_PROGRESS,
                TRACK_CENTER_Y,
                EXACT_OVERLAY_MEDALLION_CUTOUT_RADIUS,
            )
            // The approved overlay contains a baked 96% label. Remove that small area so the original
            // live label below can continue to show the real loading percentage.
            .rect(
                EXACT_OVERLAY_LABEL_CUTOUT_X,
                EXACT_OVERLAY_LABEL_CUTOUT_Y,
                EXACT_OVERLAY_LABEL_CUTOUT_WIDTH,
                EXACT_OVERLAY_LABEL_CUTOUT_HEIGHT,
            )
            // The bar is recomposed below from mutually exclusive loaded and unloaded copies. Removing
            // the baked bar here is what makes the unloaded copy's 80% opacity physically visible.
            .rect(
                MIRRORED_BAR_LEFT_X,
                MIRRORED_BAR_TOP,
                MIRRORED_BAR_HALF_WIDTH * 2 + MIRRORED_BAR_OVERLAY_CUTOUT_RIGHT_PADDING,
                MIRRORED_BAR_HEIGHT,
            )
            .cut();
        this.exactOverlayMask.eventMode = "none";
        this.exactOverlaySprite.mask = this.exactOverlayMask;

        // Cover the baked 96% caption with the identical clean-background crop. This remains reliable
        // even when several animated bar cutouts share the same graphics mask.
        const bakedLabelCoverTexture = new Texture({
            source: background.source,
            frame: new Rectangle(
                EXACT_OVERLAY_LABEL_CUTOUT_X,
                EXACT_OVERLAY_LABEL_CUTOUT_Y,
                EXACT_OVERLAY_LABEL_CUTOUT_WIDTH,
                EXACT_OVERLAY_LABEL_CUTOUT_HEIGHT,
            ),
        });
        const bakedLabelCoverSprite = new Sprite(bakedLabelCoverTexture);
        bakedLabelCoverSprite.position.set(EXACT_OVERLAY_LABEL_CUTOUT_X, EXACT_OVERLAY_LABEL_CUTOUT_Y);
        bakedLabelCoverSprite.eventMode = "none";

        // The right half of the loading bar is a literal horizontal mirror of the approved left half.
        // This preserves every joint, recess and outline instead of reconstructing the slot from pieces.
        const mirroredRightBarTexture = new Texture({
            source: exactOverlay.source,
            frame: new Rectangle(MIRRORED_BAR_LEFT_X, MIRRORED_BAR_TOP, MIRRORED_BAR_HALF_WIDTH, MIRRORED_BAR_HEIGHT),
        });
        const loadedLeftBarSprite = new Sprite(mirroredRightBarTexture);
        loadedLeftBarSprite.position.set(MIRRORED_BAR_LEFT_X, MIRRORED_BAR_TOP);
        const loadedRightBarSprite = new Sprite(mirroredRightBarTexture);
        loadedRightBarSprite.position.set(MIRRORED_BAR_RIGHT_X, MIRRORED_BAR_TOP);
        loadedRightBarSprite.scale.x = -1;
        this.loadedBarLayer.addChild(loadedLeftBarSprite, loadedRightBarSprite);
        this.loadedBarLayer.mask = this.loadedBarMask;
        this.loadedBarLayer.eventMode = "none";
        this.loadedBarMask.eventMode = "none";

        // A filtered copy of the exact symmetrical bar covers only the not-yet-crossed area. The
        // already loaded area is left untouched, while the area ahead is completely monochrome and
        // fully opaque.
        const unloadedLeftBarSprite = new Sprite(mirroredRightBarTexture);
        unloadedLeftBarSprite.position.set(MIRRORED_BAR_LEFT_X, MIRRORED_BAR_TOP);
        const unloadedRightBarSprite = new Sprite(mirroredRightBarTexture);
        unloadedRightBarSprite.position.set(MIRRORED_BAR_RIGHT_X, MIRRORED_BAR_TOP);
        unloadedRightBarSprite.scale.x = -1;
        const unloadedFilter = new ColorMatrixFilter();
        unloadedFilter.desaturate();
        this.unloadedBarLayer.addChild(unloadedLeftBarSprite, unloadedRightBarSprite);
        this.unloadedBarLayer.filters = [unloadedFilter];
        this.unloadedBarLayer.mask = this.unloadedBarMask;
        this.unloadedBarLayer.eventMode = "none";
        this.unloadedBarMask.eventMode = "none";

        // This plate contains the selected realistic molten texture across the complete trough. A mask
        // reveals only the loaded portion, retaining the exact artwork while keeping the percentage real.
        this.lavaSprite = new Sprite(lava);
        this.lavaSprite.position.set(TRACK_X, TRACK_Y);
        this.lavaSprite.width = TRACK_WIDTH;
        this.lavaSprite.height = TRACK_HEIGHT;
        this.lavaSprite.mask = this.lavaMask;

        // The left end of the trough is a real circular fire pocket rather than a rounded rectangle.
        // A separate copy of the molten texture keeps that wider recess filled without stretching the
        // texture used by the long, narrow part of the loading track.
        this.lavaPocketSprite = new Sprite(lava);
        this.lavaPocketSprite.anchor.set(0.5);
        this.lavaPocketSprite.position.set(TRACK_X, TRACK_CENTER_Y);
        this.lavaPocketSprite.width = TRACK_START_POCKET_RADIUS * 2;
        this.lavaPocketSprite.height = TRACK_START_POCKET_RADIUS * 2;
        this.lavaPocketSprite.mask = this.lavaMask;

        this.dragonMedallion = new Sprite(medallion);
        this.dragonMedallion.anchor.set(0.5);
        // Scaling is always performed around the sprite center, so changing the size in the dev editor
        // never shifts the medallion away from its current progress coordinate.
        this.dragonMedallion.width = LOADING_SCREEN_MEDALLION_ASSET_SIZE;
        this.dragonMedallion.height = LOADING_SCREEN_MEDALLION_ASSET_SIZE;

        this.loadingLabel = new Text({
            text: "FORGING THE BATTLEFIELD   0%",
            style: new TextStyle({
                fontFamily: HOC_NUMERIC_ARIAL_FONT_FAMILY,
                fontSize: 27,
                fontWeight: "500",
                fill: 0xd77d28,
                letterSpacing: 1.2,
                stroke: { color: 0x321005, width: 1.5 },
            }),
        });
        this.loadingLabel.anchor.set(0.5);
        this.loadingLabel.position.set(ART_WIDTH / 2, LABEL_Y);

        // The ornate track and end caps are baked into the exact selected artwork. Only the molten
        // interior, the moving medallion and the real loading percentage are dynamic layers.
        this.artwork.addChild(
            this.backgroundSprite,
            this.exactOverlaySprite,
            this.exactOverlayMask,
            this.loadedBarLayer,
            this.unloadedBarLayer,
            this.progressGlow,
            this.lavaPocketSprite,
            this.lavaSprite,
            this.trackSections,
            this.fireZone.container,
            this.mirroredFireZone.container,
            this.secondaryFireZone.container,
            this.lavaMask,
            this.fireZone.mask,
            this.mirroredFireZone.mask,
            this.secondaryFireZone.mask,
            this.loadedBarMask,
            this.unloadedBarMask,
            this.dragonMedallion,
            bakedLabelCoverSprite,
            this.loadingLabel,
        );
        this.addChild(this.viewportBackground, this.artwork);

        this.setFireTuning(this.fireTuning);
        this.resize(screenWidth, screenHeight);
        this.setProgress(0);
    }
    public static async create(screenWidth: number, screenHeight: number): Promise<LoadingScreen> {
        const [background, lava, medallion, exactOverlay, furnaceFire, brazierFire] = await Promise.all([
            Assets.load<Texture>(FORGING_BACKGROUND_URL),
            Assets.load<Texture>(FORGING_LAVA_URL),
            Assets.load<Texture>(DRAGON_MEDALLION_URL),
            Assets.load<Texture>(FORGING_EXACT_OVERLAY_URL),
            Assets.load<Texture>(FIRE_ATLAS_DEFINITIONS.furnace.url),
            Assets.load<Texture>(FIRE_ATLAS_DEFINITIONS.brazier.url),
        ]);
        return new LoadingScreen(screenWidth, screenHeight, background, lava, medallion, exactOverlay, {
            furnace: furnaceFire,
            brazier: brazierFire,
        });
    }
    /** Release art that no game scene uses once this screen has been removed. */
    public releaseAssets(): void {
        for (const url of LOADING_SCREEN_ONLY_URLS) {
            void Assets.unload(url).catch(() => undefined);
        }
    }
    private sliceFireAtlas(type: LoadingScreenFireType, atlas: Texture): Texture[] {
        const definition = FIRE_ATLAS_DEFINITIONS[type];
        const rows = Math.ceil(definition.frameCount / definition.columns);
        if (
            atlas.source.width < definition.columns * definition.frameWidth ||
            atlas.source.height < rows * definition.frameHeight
        ) {
            return [atlas];
        }
        atlas.source.autoGenerateMipmaps = true;
        atlas.source.scaleMode = "linear";
        return Array.from(
            { length: definition.frameCount },
            (_, index) =>
                new Texture({
                    source: atlas.source,
                    frame: new Rectangle(
                        (index % definition.columns) * definition.frameWidth,
                        Math.floor(index / definition.columns) * definition.frameHeight,
                        definition.frameWidth,
                        definition.frameHeight,
                    ),
                }),
        );
    }
    private createFireZone(): FireZoneRuntime {
        const container = new Container();
        const mask = new Graphics();
        container.eventMode = "none";
        mask.eventMode = "none";
        container.mask = mask;
        return { container, mask, sprites: [] };
    }
    private rebuildFirePair(
        leftRuntime: FireZoneRuntime,
        rightRuntime: FireZoneRuntime,
        tuning: LoadingScreenFireZoneTuning,
    ): void {
        this.rebuildFireRuntime(leftRuntime, tuning, false);
        this.rebuildFireRuntime(rightRuntime, tuning, true);
    }
    private rebuildFireRuntime(runtime: FireZoneRuntime, tuning: LoadingScreenFireZoneTuning, mirrored: boolean): void {
        for (const sprite of runtime.sprites) {
            sprite.removeFromParent();
            sprite.destroy();
        }
        runtime.sprites = [];
        runtime.container.removeChildren();
        runtime.container.visible = tuning.enabled;
        const leftX = TRACK_X + tuning.offsetX - TRACK_START_POCKET_RADIUS;
        runtime.container.scale.set(mirrored ? -1 : 1, 1);
        runtime.container.position.set(mirrored ? 2 * TRACK_MIDDLE_X - leftX : leftX, TRACK_Y + tuning.offsetY);
        if (!tuning.enabled) return;

        const frames = this.fireFrames[tuning.fireType];
        const totalWidth = tuning.width + TRACK_START_POCKET_RADIUS;
        const tileWidth = totalWidth / tuning.tiles;
        const baselineY = TRACK_CENTER_Y - TRACK_Y + TRACK_START_POCKET_RADIUS + tuning.overflowBottom;
        for (let index = 0; index < tuning.tiles; index++) {
            const sprite = new AnimatedSprite(frames);
            sprite.anchor.set(0.5, 1);
            sprite.position.set((index + 0.5) * tileWidth, baselineY);
            sprite.width = tileWidth * tuning.overlap;
            // Height is the real on-screen sprite height. The bottom anchor never changes, therefore
            // reducing it always pulls the top down instead of moving the flame field from the bottom.
            sprite.height = tuning.height;
            if (tuning.alternateMirror && index % 2 === 1) sprite.scale.x *= -1;
            sprite.alpha = tuning.alpha;
            sprite.tint = tuning.tint;
            sprite.blendMode = tuning.blendMode;
            sprite.animationSpeed = tuning.fps / 60;
            sprite.loop = true;
            sprite.eventMode = "none";
            const startFrame = (tuning.frameOffset + index * tuning.phaseStep) % frames.length;
            if (this.firePlaybackPaused) {
                sprite.gotoAndStop((this.fireScrubFrame + startFrame) % frames.length);
            } else {
                sprite.gotoAndPlay(startFrame);
            }
            runtime.container.addChild(sprite);
            runtime.sprites.push(sprite);
        }
    }
    private rebuildContinuousFireRuntime(runtime: FireZoneRuntime, tuning: LoadingScreenFireZoneTuning): void {
        for (const sprite of runtime.sprites) {
            sprite.removeFromParent();
            sprite.destroy();
        }
        runtime.sprites = [];
        runtime.container.removeChildren();
        runtime.container.visible = tuning.enabled;
        runtime.container.scale.set(1, 1);
        runtime.container.position.set(TRACK_X + tuning.offsetX - TRACK_START_POCKET_RADIUS, TRACK_Y + tuning.offsetY);
        if (!tuning.enabled) return;

        const frames = this.fireFrames[tuning.fireType];
        const totalWidth = tuning.width * 2 + TRACK_START_POCKET_RADIUS * 2;
        const tileWidth = totalWidth / tuning.tiles;
        const baselineY = TRACK_CENTER_Y - TRACK_Y + TRACK_START_POCKET_RADIUS + tuning.overflowBottom;
        for (let index = 0; index < tuning.tiles; index++) {
            const sprite = new AnimatedSprite(frames);
            sprite.anchor.set(0.5, 1);
            sprite.position.set((index + 0.5) * tileWidth, baselineY);
            sprite.width = tileWidth * tuning.overlap;
            sprite.height = tuning.height;
            sprite.alpha = tuning.alpha;
            sprite.tint = tuning.tint;
            sprite.blendMode = tuning.blendMode;
            sprite.animationSpeed = tuning.fps / 60;
            sprite.loop = true;
            sprite.eventMode = "none";
            const startFrame = (tuning.frameOffset + index * tuning.phaseStep) % frames.length;
            if (this.firePlaybackPaused) {
                sprite.gotoAndStop((this.fireScrubFrame + startFrame) % frames.length);
            } else {
                sprite.gotoAndPlay(startFrame);
            }
            runtime.container.addChild(sprite);
            runtime.sprites.push(sprite);
        }
    }
    public setFireTuning(value: Partial<LoadingScreenFireTuning>): void {
        this.fireTuning = normalizeLoadingScreenFireTuning(value);
        this.lavaSprite.alpha = this.fireTuning.baseLavaAlpha;
        this.lavaPocketSprite.alpha = this.fireTuning.baseLavaAlpha;
        this.dragonMedallion.visible = this.fireTuning.medallionVisible;
        this.dragonMedallion.width = this.fireTuning.medallionSize;
        this.dragonMedallion.height = this.fireTuning.medallionSize;
        this.rebuildFirePair(this.fireZone, this.mirroredFireZone, this.fireTuning.overall);
        this.rebuildContinuousFireRuntime(this.secondaryFireZone, this.fireTuning.secondary);
        this.redrawTrackSections();
        this.setProgress(this.progress);
    }
    private redrawTrackSections(): void {
        this.trackSections.clear();
        const { sectionCount, sectionAlpha } = this.fireTuning;
        if (sectionCount <= 1 || sectionAlpha <= 0) return;

        const centerY = TRACK_CENTER_Y;
        for (let index = 1; index < sectionCount; index++) {
            const x = TRACK_X + (TRACK_WIDTH * index) / sectionCount;
            this.trackSections
                .moveTo(x, TRACK_Y + 2)
                .lineTo(x, TRACK_Y + TRACK_HEIGHT - 2)
                .stroke({ color: 0x180905, width: 4, alpha: sectionAlpha * 0.72 })
                .moveTo(x, TRACK_Y + 3)
                .lineTo(x, TRACK_Y + TRACK_HEIGHT - 3)
                .stroke({ color: 0xe6a943, width: 1, alpha: sectionAlpha })
                .poly([x - 4, centerY, x, centerY - 5, x + 4, centerY, x, centerY + 5])
                .fill({ color: 0x2a1008, alpha: sectionAlpha * 0.86 })
                .stroke({ color: 0xf2bd58, width: 1, alpha: sectionAlpha });
        }
    }
    public setFirePlayback(paused: boolean, scrubFrame = this.fireScrubFrame): void {
        this.firePlaybackPaused = paused;
        this.fireScrubFrame = Math.max(0, Math.round(scrubFrame));
        const pairs: ReadonlyArray<readonly [LoadingScreenFireZoneTuning, FireZoneRuntime[]]> = [
            [this.fireTuning.overall, [this.fireZone, this.mirroredFireZone]],
            [this.fireTuning.secondary, [this.secondaryFireZone]],
        ];
        for (const [tuning, runtimes] of pairs) {
            const frames = this.fireFrames[tuning.fireType];
            for (const runtime of runtimes) {
                runtime.sprites.forEach((sprite, index) => {
                    const startFrame = (tuning.frameOffset + index * tuning.phaseStep) % frames.length;
                    if (paused) {
                        sprite.gotoAndStop((this.fireScrubFrame + startFrame) % frames.length);
                    } else {
                        sprite.gotoAndPlay(startFrame);
                    }
                });
            }
        }
    }
    private redrawUnifiedFireMask(
        mask: Graphics,
        tuning: LoadingScreenFireZoneTuning,
        revealX: number,
        mirrored: boolean,
    ): void {
        mask.clear();
        if (!tuning.enabled) return;

        const leftPocketCenterX = TRACK_X + tuning.offsetX;
        const leftZoneEnd = leftPocketCenterX + tuning.width;
        const pocketCenterX = mirrored ? 2 * TRACK_MIDDLE_X - leftPocketCenterX : leftPocketCenterX;
        const straightEdgeX = mirrored ? 2 * TRACK_MIDDLE_X - leftZoneEnd : leftZoneEnd;
        const pocketCenterY = TRACK_CENTER_Y + tuning.offsetY + tuning.overflowBottom;
        const spriteBottomY = pocketCenterY + TRACK_START_POCKET_RADIUS;
        const topY = spriteBottomY - tuning.height;
        const straightBottomY = TRACK_Y + TRACK_HEIGHT + tuning.offsetY + tuning.overflowBottom;
        const clippedStemRightX = Math.min(revealX, pocketCenterX + TRACK_START_POCKET_RADIUS);
        const stemLeftX = pocketCenterX - TRACK_START_POCKET_RADIUS;

        if (topY < pocketCenterY && clippedStemRightX > stemLeftX) {
            mask.rect(stemLeftX, topY, clippedStemRightX - stemLeftX, pocketCenterY - topY).fill(0xffffff);
        }
        this.drawCircleClippedAtX(mask, pocketCenterX, pocketCenterY, TRACK_START_POCKET_RADIUS, revealX);
        if (straightBottomY > topY) {
            const rectX = mirrored ? straightEdgeX : pocketCenterX;
            const rectRightX = Math.min(revealX, mirrored ? pocketCenterX : straightEdgeX);
            const rectWidth = rectRightX - rectX;
            if (rectWidth > 0) {
                mask.rect(rectX, topY, rectWidth, straightBottomY - topY).fill(0xffffff);
            }
        }
    }
    private drawCircleClippedAtX(
        mask: Graphics,
        centerX: number,
        centerY: number,
        radius: number,
        revealX: number,
    ): void {
        if (revealX <= centerX - radius) return;
        if (revealX >= centerX + radius) {
            mask.circle(centerX, centerY, radius).fill(0xffffff);
            return;
        }

        const clippedX = Math.min(revealX, centerX + radius);
        const arcHalfAngle = Math.acos((clippedX - centerX) / radius);
        const startAngle = -arcHalfAngle;
        const endAngle = arcHalfAngle - Math.PI * 2;
        const points: number[] = [clippedX, centerY + Math.sin(startAngle) * radius];
        const segmentCount = 24;
        for (let index = 1; index <= segmentCount; index++) {
            const angle = startAngle + ((endAngle - startAngle) * index) / segmentCount;
            points.push(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
        }
        mask.poly(points).fill(0xffffff);
    }
    private updateFirePair(
        leftRuntime: FireZoneRuntime,
        rightRuntime: FireZoneRuntime,
        tuning: LoadingScreenFireZoneTuning,
        revealX: number,
    ): void {
        const leftX = TRACK_X + tuning.offsetX - TRACK_START_POCKET_RADIUS;
        leftRuntime.container.position.set(leftX, TRACK_Y + tuning.offsetY);
        rightRuntime.container.position.set(2 * TRACK_MIDDLE_X - leftX, TRACK_Y + tuning.offsetY);
        this.redrawUnifiedFireMask(leftRuntime.mask, tuning, revealX, false);
        this.redrawUnifiedFireMask(rightRuntime.mask, tuning, revealX, true);
    }
    private updateContinuousFire(runtime: FireZoneRuntime, tuning: LoadingScreenFireZoneTuning, revealX: number): void {
        runtime.container.position.set(TRACK_X + tuning.offsetX - TRACK_START_POCKET_RADIUS, TRACK_Y + tuning.offsetY);
        const mask = runtime.mask;
        mask.clear();
        if (!tuning.enabled) return;

        const leftPocketCenterX = TRACK_X + tuning.offsetX;
        const rightPocketCenterX = leftPocketCenterX + tuning.width * 2;
        const pocketCenterY = TRACK_CENTER_Y + tuning.offsetY + tuning.overflowBottom;
        const spriteBottomY = pocketCenterY + TRACK_START_POCKET_RADIUS;
        const topY = spriteBottomY - tuning.height;
        const straightBottomY = TRACK_Y + TRACK_HEIGHT + tuning.offsetY + tuning.overflowBottom;
        const clippedRightX = Math.min(revealX, rightPocketCenterX + TRACK_START_POCKET_RADIUS);

        if (topY < pocketCenterY && clippedRightX > leftPocketCenterX - TRACK_START_POCKET_RADIUS) {
            mask.rect(
                leftPocketCenterX - TRACK_START_POCKET_RADIUS,
                topY,
                clippedRightX - (leftPocketCenterX - TRACK_START_POCKET_RADIUS),
                pocketCenterY - topY,
            ).fill(0xffffff);
        }
        this.drawCircleClippedAtX(mask, leftPocketCenterX, pocketCenterY, TRACK_START_POCKET_RADIUS, revealX);
        if (straightBottomY > topY) {
            const straightRightX = Math.min(revealX, rightPocketCenterX);
            if (straightRightX > leftPocketCenterX) {
                mask.rect(leftPocketCenterX, topY, straightRightX - leftPocketCenterX, straightBottomY - topY).fill(
                    0xffffff,
                );
            }
        }
        this.drawCircleClippedAtX(mask, rightPocketCenterX, pocketCenterY, TRACK_START_POCKET_RADIUS, revealX);
    }
    public setProgress(value: number): void {
        this.progress = Math.max(0, Math.min(1, value));
        const travelProgress = Math.min(1, this.progress / FINAL_SLIDER_POSITION_PROGRESS);
        const fillWidth = TRACK_WIDTH * travelProgress;
        const medallionStartX = TRACK_X + this.fireTuning.medallionStartOffsetX;
        const medallionStartY = TRACK_CENTER_Y + this.fireTuning.medallionStartOffsetY;
        const medallionEndX = TRACK_X + TRACK_WIDTH + this.fireTuning.medallionEndOffsetX;
        const medallionEndY = TRACK_CENTER_Y + this.fireTuning.medallionEndOffsetY;
        const medallionX = medallionStartX + (medallionEndX - medallionStartX) * travelProgress;
        const medallionY = medallionStartY + (medallionEndY - medallionStartY) * travelProgress;

        this.progressGlow.clear();
        this.lavaMask.clear();

        if (fillWidth > 0) {
            this.progressGlow
                .circle(TRACK_X, TRACK_CENTER_Y, TRACK_START_POCKET_RADIUS + 3)
                .fill({ color: 0xff4d00, alpha: this.fireTuning.progressGlowAlpha })
                .rect(TRACK_X, TRACK_Y - 5, fillWidth + 4, TRACK_HEIGHT + 10)
                .fill({ color: 0xff4d00, alpha: this.fireTuning.progressGlowAlpha });
            this.lavaMask
                .circle(TRACK_X, TRACK_CENTER_Y, TRACK_START_POCKET_RADIUS)
                .fill(0xffffff)
                .rect(TRACK_X, TRACK_Y, fillWidth, TRACK_HEIGHT)
                .fill(0xffffff);
        }

        // Both halves use the same global reveal edge. The right mirrored fire therefore remains hidden
        // until the slider actually reaches it instead of igniting simultaneously from the far end.
        this.updateFirePair(this.fireZone, this.mirroredFireZone, this.fireTuning.overall, medallionX);
        // The second layer is one continuous, non-mirrored flame sheet rendered above the first layer.
        this.updateContinuousFire(this.secondaryFireZone, this.fireTuning.secondary, medallionX);

        const barSplitX = travelProgress >= 1 ? MIRRORED_BAR_RIGHT_X : Math.max(MIRRORED_BAR_LEFT_X, medallionX);
        this.loadedBarMask.clear();
        this.unloadedBarMask.clear();
        if (barSplitX > MIRRORED_BAR_LEFT_X) {
            this.loadedBarMask
                .rect(MIRRORED_BAR_LEFT_X, MIRRORED_BAR_TOP, barSplitX - MIRRORED_BAR_LEFT_X, MIRRORED_BAR_HEIGHT)
                .fill(0xffffff);
        }
        if (barSplitX < MIRRORED_BAR_RIGHT_X) {
            this.unloadedBarMask
                .rect(barSplitX, MIRRORED_BAR_TOP, MIRRORED_BAR_RIGHT_X - barSplitX, MIRRORED_BAR_HEIGHT)
                .fill(0xffffff);
        }

        this.dragonMedallion.position.set(medallionX, medallionY);
        // Restore the original two full rotations over the complete loading path. Rotation changes only
        // the sprite angle; its configured width and height remain untouched.
        this.dragonMedallion.rotation = travelProgress * Math.PI * 4;
        this.loadingLabel.text = `FORGING THE BATTLEFIELD   ${Math.round(this.progress * 100)}%`;
    }
    public resize(screenWidth: number, screenHeight: number): void {
        this.viewportBackground.clear();
        this.viewportBackground.rect(0, 0, screenWidth, screenHeight).fill(0x050505);

        const coverScale = Math.max(screenWidth / ART_WIDTH, screenHeight / ART_HEIGHT);
        this.artwork.scale.set(coverScale);
        this.artwork.pivot.set(ART_WIDTH / 2, ART_HEIGHT / 2);
        this.artwork.position.set(screenWidth / 2, screenHeight / 2);
    }
}

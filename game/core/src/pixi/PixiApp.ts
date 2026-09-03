// game/core/src/pixi/PixiApp.ts
// Side-effect import: patches PIXI's renderer to use eval-free polyfills for shader/UBO
// codegen, so it works under a CSP without 'unsafe-eval'. MUST run before Application.init().
import "pixi.js/unsafe-eval";
import { Application, Container, TexturePool, Ticker } from "pixi.js";

import { boardFitVerticalShift } from "./boardFit";
import { renderResolutionForViewport, renderTexturePoolBucket, shouldUseRenderAntialias } from "./renderResolution";
import { ensureCanvasContextUsable, recordContextAboutToBeLost } from "./webglContextGuard";
import { MAX_FPS } from "../statics";

export class PixiApp {
    private app!: Application;
    private stage!: Container;
    private ticker!: Ticker;
    private camera!: Container; // pans/zooms
    private worldRoot!: Container; // Y-up (scaleY = -1)
    private cursorOverlayRoot!: Container; // Y-up, always rendered after the battlefield
    private backgroundContainer!: Container;
    private terrainContainer!: Container;
    private unitsContainer!: Container;
    private effectsContainer!: Container;
    private uiContainer!: Container;
    private renderTexturePoolBucket?: readonly [number, number];
    // Guards against a second destroy() on the same instance. pixi.js's Application.destroy() runs its
    // teardown plugins (ResizePlugin, TickerPlugin, ...) in a bare forEach with no per-plugin try/catch —
    // a plugin that already tore itself down (e.g. ResizePlugin nulling its own _cancelResize) throws on
    // the second call and ABORTS the loop before the renderer/stage destroy calls below it ever run,
    // leaking the WebGL context. Short-circuiting a repeat call here keeps double-teardown (e.g. a racy
    // unmount/re-init) from leaking contexts even if some caller mistakenly destroys twice.
    private destroyed = false;
    public constructor() {}
    public async init(canvas: HTMLCanvasElement, width = 2048, height = 2048): Promise<void> {
        // Never hand pixi a canvas whose WebGL context a previous PixiApp.destroy() force-lost:
        // pixi would adopt the same, permanently-lost context and spin forever inside
        // checkMaxIfStatementsInShader — a total main-thread freeze (nightly QA #3's P0), not an
        // error. Restores the context when possible; throws (recoverable) when it can't.
        await ensureCanvasContextUsable(canvas);

        // Preserve 2x on ordinary Retina layouts, but cap the complete backing store at 1440p pixels.
        // Full-screen filters allocate buffers at this size too, so pixel area—not DPR alone—is the
        // reliable bound for GPU memory on large/high-DPI displays.
        const DPR = renderResolutionForViewport(width, height, window.devicePixelRatio);

        this.app = new Application();
        await this.app.init({
            canvas,
            width,
            height,
            resolution: DPR,
            antialias: shouldUseRenderAntialias(DPR, width, height),
            background: 0x000000,
        });
        this.renderTexturePoolBucket = renderTexturePoolBucket(width, height, DPR);

        // --- World containers ---
        this.camera = new Container(); // we pan/zoom this one
        this.worldRoot = new Container(); // we flip Y here ONCE to get y-up
        this.worldRoot.scale.set(1, -1); // flip once so world coords are y-up
        this.cursorOverlayRoot = new Container();
        this.cursorOverlayRoot.scale.set(1, -1);

        // Layers go under worldRoot (so they inherit y-up + camera transforms)
        this.backgroundContainer = new Container();
        this.terrainContainer = new Container();
        this.unitsContainer = new Container();
        this.effectsContainer = new Container();
        this.worldRoot.addChild(
            this.backgroundContainer,
            this.terrainContainer,
            this.unitsContainer,
            this.effectsContainer,
        );

        // Screen-space UI (no camera / no y-flip)
        this.uiContainer = new Container();

        // Stage wiring
        this.stage = this.app.stage;
        // Keep pointer-like battlefield markers in a sibling rendered after the entire world. A very
        // large zIndex inside worldRoot is still part of the world's depth sort and can be obscured by
        // later composite layers; sibling order makes the foreground guarantee structural.
        this.camera.addChild(this.worldRoot, this.cursorOverlayRoot);
        this.stage.addChild(this.camera, this.uiContainer);

        this.ticker = this.app.ticker;
        // The simulation advances at MAX_FPS too. ProMotion/high-refresh displays otherwise make Pixi
        // draw the same state two or more times and run every filter again for no visible game update.
        this.ticker.maxFPS = MAX_FPS;

        // Default camera: center world and fit bounds once caller sets zoom
        this.setupRendering(width, height);
    }
    private setupRendering(width: number, height: number): void {
        const c = this.app.canvas as HTMLCanvasElement;
        c.style.position = "absolute";
        c.style.display = "block";
        c.style.width = `${width}px`;
        c.style.height = `${height}px`;
    }
    public getApplication(): Application {
        return this.app;
    }
    public getStage(): Container {
        return this.stage;
    }
    public getTicker(): Ticker {
        return this.ticker;
    }
    public getUIContainer(): Container {
        return this.uiContainer;
    }
    public getCamera(): Container {
        return this.camera;
    }
    public getWorldRoot(): Container {
        return this.worldRoot;
    }
    public getCursorOverlayRoot(): Container {
        return this.cursorOverlayRoot;
    }
    public getBackgroundContainer(): Container {
        return this.backgroundContainer;
    }
    public getTerrainContainer(): Container {
        return this.terrainContainer;
    }
    public getUnitsContainer(): Container {
        return this.unitsContainer;
    }
    public getEffectsContainer(): Container {
        return this.effectsContainer;
    }
    public resize(width = 2048, height = 2048): void {
        const DPR = renderResolutionForViewport(width, height, window.devicePixelRatio);
        const nextPoolBucket = renderTexturePoolBucket(width, height, DPR);
        const previousPoolBucket = this.renderTexturePoolBucket;
        if (
            previousPoolBucket &&
            (previousPoolBucket[0] !== nextPoolBucket[0] || previousPoolBucket[1] !== nextPoolBucket[1])
        ) {
            // Pixi's global filter pool otherwise retains the previous full-screen buffers forever. This
            // runs between animation frames and only at a physical power-of-two boundary, avoiding churn
            // during the many small resize events emitted while a window is dragged.
            TexturePool.clear();
        }
        this.renderTexturePoolBucket = nextPoolBucket;
        // Sandbox installs its camera-wide cinematic pass at the renderer resolution that existed when
        // the scene was created. If a player later enters fullscreen, the canvas cap may lower DPR while
        // that numeric filter resolution stays at (typically) 2x, silently recreating a multi-4K temporary
        // target around the 1440p canvas. Treat display-matched camera filters as inherited from now on so
        // they follow every capped resize; deliberately lower-resolution filters remain untouched.
        const previousResolution = this.app.renderer.resolution;
        for (const filter of this.camera?.filters ?? []) {
            if (filter.resolution === previousResolution) filter.resolution = "inherit";
        }
        this.app.renderer.resolution = DPR;
        this.app.renderer.resize(width, height);
        const c = this.app.canvas as HTMLCanvasElement;
        c.style.width = `${width}px`;
        c.style.height = `${height}px`;
    }
    public destroy(): void {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.ticker?.stop();
        // Filter render targets live in Pixi's process-wide pool, outside Application ownership. Clear
        // the idle pool before losing this renderer so a later game mount cannot retain buffers from the
        // previous WebGL context (including a former fullscreen bucket).
        TexturePool.clear();
        // pixi's GlContextSystem.destroy() (run inside app.destroy below) unconditionally calls
        // WEBGL_lose_context.loseContext(), permanently disabling this canvas's WebGL context.
        // Record the context + restore handle FIRST, so a later PixiApp.init() against the same
        // canvas can restore it (or fail loudly) instead of freezing the tab in pixi's context
        // re-init loop. Recorded before the destroy because pixi nulls its renderer refs during it.
        try {
            const renderer = this.app?.renderer as
                | {
                      gl?: WebGLRenderingContext & {
                          getExtension(name: "WEBGL_lose_context"): WEBGL_lose_context | null;
                      };
                  }
                | undefined;
            const canvas = this.app?.canvas;
            if (renderer?.gl && canvas) {
                recordContextAboutToBeLost(canvas, renderer.gl, renderer.gl.getExtension("WEBGL_lose_context"));
            }
        } catch {
            // Never let diagnostics-keeping block the teardown itself.
        }
        try {
            this.app?.destroy(true, {
                children: true,
                // Textures are owned by Pixi's global Assets cache. Destroying them here leaves the
                // resolver/cache believing bundles are loaded while their texture sources are gone,
                // which can strand later scene mounts on the loading screen.
                texture: false,
                textureSource: false,
                context: true,
            });
        } catch (err) {
            console.warn("Pixi app destroy skipped after partial teardown", err);
        }
    }
    public setCameraPosition(cx: number, cy: number): void {
        if (!this.app?.renderer || !this.camera) {
            return;
        }
        const zoomX = this.camera.scale.x || 1;
        const zoomY = this.camera.scale.y || 1;
        const { width: W, height: H } = this.app.renderer;
        // X and Y deliberately use different scales: columns consume the space freed by narrower sidebars,
        // while rows are 13% shorter. The backdrop applies the same dimensions and vertical offset.
        this.camera.position.set(W / 2 - zoomX * cx, H / 2 + zoomY * cy - boardFitVerticalShift(W, H));
    }
    public setCameraZoom(zoom: number): void {
        this.setCameraScale(zoom, zoom);
    }
    public setCameraScale(zoomX: number, zoomY: number): void {
        if (!this.app?.renderer || !this.camera) {
            return;
        }
        const { x, y } = this.getCameraPosition(); // current world center
        this.camera.scale.set(zoomX, zoomY);
        this.setCameraPosition(x, y); // keep same center after zoom
    }
    public getCameraPosition(): { x: number; y: number } {
        if (!this.app?.renderer || !this.camera) {
            return { x: 0, y: 0 };
        }
        const zoomX = this.camera.scale.x || 1;
        const zoomY = this.camera.scale.y || 1;
        const { width: W, height: H } = this.app.renderer;
        // invert formulas:
        // cx = (W/2 - pos.x) / zoomX
        // cy = (pos.y - H/2 + verticalShift) / zoomY
        return {
            x: (W / 2 - this.camera.position.x) / zoomX,
            y: (this.camera.position.y - H / 2 + boardFitVerticalShift(W, H)) / zoomY,
        };
    }
    public getCameraZoom(): number {
        // Camera may be absent before init completes or after teardown (e.g. a stale mouse-move
        // listener firing across an HMR reload); the sibling camera methods guard the same way.
        return this.camera?.scale.x || 1;
    }
    public screenToWorld(sx: number, sy: number) {
        if (!this.camera) {
            return { x: sx, y: sy };
        }
        const zoomX = this.camera.scale.x || 1;
        const zoomY = this.camera.scale.y || 1;
        return {
            x: (sx - this.camera.position.x) / zoomX,
            y: (this.camera.position.y - sy) / zoomY, // note the minus
        };
    }
    public worldToScreen(wx: number, wy: number) {
        if (!this.camera) {
            return { x: wx, y: wy };
        }
        const zoomX = this.camera.scale.x || 1;
        const zoomY = this.camera.scale.y || 1;
        return {
            x: this.camera.position.x + wx * zoomX,
            y: this.camera.position.y - wy * zoomY, // note the minus
        };
    }
    public render(): void {
        /* no-op hook */
    }
}

// game/core/src/pixi/PixiApp.ts
// Side-effect import: patches PIXI's renderer to use eval-free polyfills for shader/UBO
// codegen, so it works under a CSP without 'unsafe-eval'. MUST run before Application.init().
import "pixi.js/unsafe-eval";
import { Application, Container, Ticker } from "pixi.js";

export class PixiApp {
    private app!: Application;
    private stage!: Container;
    private ticker!: Ticker;
    private camera!: Container; // pans/zooms
    private worldRoot!: Container; // Y-up (scaleY = -1)
    private backgroundContainer!: Container;
    private terrainContainer!: Container;
    private unitsContainer!: Container;
    private effectsContainer!: Container;
    private uiContainer!: Container;
    public constructor() {}
    public async init(canvas: HTMLCanvasElement, width = 2048, height = 2048): Promise<void> {
        // Cap render resolution at 2x: 3x (dense phone/tablet screens) costs ~2.25x the fragment
        // work for no perceptible gain over retina-sharp 2x — a big, safe fps win on weak GPUs.
        const DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

        this.app = new Application();
        await this.app.init({
            canvas,
            width,
            height,
            resolution: DPR,
            antialias: true,
            background: 0x000000,
        });

        // --- World containers ---
        this.camera = new Container(); // we pan/zoom this one
        this.worldRoot = new Container(); // we flip Y here ONCE to get y-up
        this.worldRoot.scale.set(1, -1); // y-up like Box2D

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
        this.camera.addChild(this.worldRoot);
        this.stage.addChild(this.camera, this.uiContainer);

        this.ticker = this.app.ticker;

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
        // Cap render resolution at 2x: 3x (dense phone/tablet screens) costs ~2.25x the fragment
        // work for no perceptible gain over retina-sharp 2x — a big, safe fps win on weak GPUs.
        const DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
        this.app.renderer.resolution = DPR;
        this.app.renderer.resize(width, height);
        const c = this.app.canvas as HTMLCanvasElement;
        c.style.width = `${width}px`;
        c.style.height = `${height}px`;
    }
    public destroy(): void {
        this.ticker?.stop();
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
        const z = this.camera.scale.x || 1;
        const { width: W, height: H } = this.app.renderer;
        this.camera.position.set(W / 2 - z * cx, H / 2 + z * cy);
    }
    public setCameraZoom(zoom: number): void {
        if (!this.app?.renderer || !this.camera) {
            return;
        }
        const { x, y } = this.getCameraPosition(); // current world center
        this.camera.scale.set(zoom, zoom);
        this.setCameraPosition(x, y); // keep same center after zoom
    }
    public getCameraPosition(): { x: number; y: number } {
        if (!this.app?.renderer || !this.camera) {
            return { x: 0, y: 0 };
        }
        const z = this.camera.scale.x || 1;
        const { width: W, height: H } = this.app.renderer;
        // invert formulas:
        // cx = (W/2 - pos.x) / z
        // cy = (pos.y - H/2) / z
        return {
            x: (W / 2 - this.camera.position.x) / z,
            y: (this.camera.position.y - H / 2) / z,
        };
    }
    public getCameraZoom(): number {
        return this.camera.scale.x || 1;
    }
    public screenToWorld(sx: number, sy: number) {
        const z = this.getCameraZoom();
        return {
            x: (sx - this.camera.position.x) / z,
            y: (this.camera.position.y - sy) / z, // note the minus
        };
    }
    public worldToScreen(wx: number, wy: number) {
        const z = this.getCameraZoom();
        return {
            x: this.camera.position.x + wx * z,
            y: this.camera.position.y - wy * z, // note the minus
        };
    }
    public render(): void {
        /* no-op hook */
    }
}

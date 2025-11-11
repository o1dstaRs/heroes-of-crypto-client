// game/core/src/pixi/PixiApp.ts
import { Application, Container, Ticker } from "pixi.js";

export class PixiApp {
    private app!: Application;
    private stage!: Container;
    private ticker!: Ticker;
    private backgroundContainer!: Container;
    private terrainContainer!: Container;
    private unitsContainer!: Container;
    private effectsContainer!: Container;
    private uiContainer!: Container;
    private camera!: Container;
    public constructor() {}
    public async init(canvas: HTMLCanvasElement, width = 2048, height = 2048): Promise<void> {
        const DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));

        this.app = new Application();
        await this.app.init({
            canvas,
            width,
            height,
            resolution: DPR, // device pixels per CSS pixel
            antialias: true,
            background: 0x000000, // v8: use `background`
        });

        // Build scene graph AFTER init()
        this.backgroundContainer = new Container();
        this.terrainContainer = new Container();
        this.unitsContainer = new Container();
        this.effectsContainer = new Container();
        this.uiContainer = new Container();

        this.camera = new Container();
        this.camera.addChild(
            this.backgroundContainer,
            this.terrainContainer,
            this.unitsContainer,
            this.effectsContainer,
        );

        this.stage = this.app.stage;
        this.stage.addChild(this.camera, this.uiContainer);

        this.ticker = this.app.ticker;

        this.setupRendering(width, height);
    }
    private setupRendering(width: number, height: number): void {
        const c = this.app.canvas as HTMLCanvasElement;
        c.style.position = "absolute";
        c.style.display = "block";
        // Lock CSS size to 2048×2048 (or the provided width/height)
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
    public getUIContainer(): Container {
        return this.uiContainer;
    }
    public getCamera(): Container {
        return this.camera;
    }
    public resize(width = 2048, height = 2048): void {
        const DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
        this.app.renderer.resolution = DPR;
        this.app.renderer.resize(width, height);
        const c = this.app.canvas as HTMLCanvasElement;
        c.style.width = `${width}px`;
        c.style.height = `${height}px`;
    }
    public destroy(): void {
        this.ticker?.stop();
        this.app?.destroy(true, {
            children: true,
            texture: true,
            textureSource: true,
            context: true,
        });
    }
    public setCameraPosition(wx: number, wy: number): void {
        const z = this.camera.scale.x || 1;
        const { width, height } = this.app.renderer;
        this.camera.position.set(width / 2 - wx * z, height / 2 - wy * z);
    }
    public setCameraZoom(zoom: number): void {
        const prevCenter = this.getCameraPosition(); // keep the same world center
        this.camera.scale.set(zoom, zoom);
        this.setCameraPosition(prevCenter.x, prevCenter.y);
    }
    public getCameraPosition(): { x: number; y: number } {
        const z = this.camera.scale.x || 1;
        const { width, height } = this.app.renderer;
        return {
            x: (width / 2 - this.camera.position.x) / z,
            y: (height / 2 - this.camera.position.y) / z,
        };
    }
    public getCameraZoom(): number {
        return this.camera.scale.x || 1;
    }
    public screenToWorld(sx: number, sy: number) {
        const z = this.getCameraZoom();
        return { x: (sx - this.camera.position.x) / z, y: (sy - this.camera.position.y) / z };
    }
    public worldToScreen(wx: number, wy: number) {
        const z = this.getCameraZoom();
        return { x: wx * z + this.camera.position.x, y: wy * z + this.camera.position.y };
    }
    public render(): void {
        // per-frame hooks if needed
    }
}

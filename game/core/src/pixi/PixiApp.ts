import { Application, Container, Ticker } from "pixi.js";

export class PixiApp {
    private app: Application;
    private stage: Container;
    private ticker: Ticker;

    // Layers
    private backgroundContainer: Container;
    private terrainContainer: Container;
    private unitsContainer: Container;
    private effectsContainer: Container;
    private uiContainer: Container;

    // Camera root
    private camera: Container;

    public constructor() {
        this.app = new Application();

        this.backgroundContainer = new Container();
        this.terrainContainer = new Container();
        this.unitsContainer = new Container();
        this.effectsContainer = new Container();
        this.uiContainer = new Container();

        this.camera = new Container();
        this.camera.addChild(this.backgroundContainer);
        this.camera.addChild(this.terrainContainer);
        this.camera.addChild(this.unitsContainer);
        this.camera.addChild(this.effectsContainer);

        this.stage = this.app.stage;
        this.stage.addChild(this.camera);
        this.stage.addChild(this.uiContainer);

        this.ticker = this.app.ticker;
    }

    public async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
        const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
        await this.app.init({
            canvas,
            width,
            height,
            backgroundColor: 0x000000,
            backgroundAlpha: 0,
            antialias: true,
            resolution: dpr,
            autoDensity: true,
        });
        this.setupRendering();
    }

    private setupRendering(): void {
        const c = this.app.canvas as HTMLCanvasElement;
        c.style.position = "absolute";
        c.style.display = "block";
        // Make sure CSS size follows the wrapper size:
        c.style.width = "100%";
        c.style.height = "100%";
    }

    public getApplication(): Application {
        return this.app;
    }
    public getStage(): Container {
        return this.stage;
    }
    public getTicker(): Ticker {
        return this.app.ticker;
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

    /** Keep world center stable when the canvas size changes */
    public resize(width: number, height: number): void {
        const center = this.getCameraPosition(); // world center under screen center
        const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
        this.app.renderer.resolution = dpr;
        this.app.renderer.resize(width, height);
        this.setCameraPosition(center.x, center.y); // re-center after resize
    }

    public destroy(): void {
        this.ticker.stop();
        this.app.destroy(true, {
            children: true,
            texture: true,
            textureSource: true,
            context: true,
        });
    }

    // -------------------------
    // Camera as WORLD CENTER
    // -------------------------

    /** Position the world center (wx,wy) at the middle of the screen */
    public setCameraPosition(wx: number, wy: number): void {
        const z = this.camera.scale.x || 1;
        const { width, height } = this.app.renderer;
        // screen center = (width/2, height/2)
        // screen = world * z + pos  => pos = center - world*z
        this.camera.position.set(width / 2 - wx * z, height / 2 - wy * z);
    }

    /** Zoom while keeping the current world center fixed on screen */
    public setCameraZoom(zoom: number): void {
        const prevCenter = this.getCameraPosition();
        this.camera.scale.set(zoom, zoom);
        this.setCameraPosition(prevCenter.x, prevCenter.y);
    }

    /** Current world point under the screen center */
    public getCameraPosition(): { x: number; y: number } {
        const z = this.camera.scale.x || 1;
        const { width, height } = this.app.renderer;
        // invert: world = (screen - pos) / z
        return {
            x: (width / 2 - this.camera.position.x) / z,
            y: (height / 2 - this.camera.position.y) / z,
        };
    }

    public getCameraZoom(): number {
        return this.camera.scale.x || 1;
    }

    // -------------------------
    // Coordinate helpers
    // -------------------------
    public screenToWorld(sx: number, sy: number) {
        const z = this.getCameraZoom();
        return {
            x: (sx - this.camera.position.x) / z,
            y: (sy - this.camera.position.y) / z,
        };
    }

    public worldToScreen(wx: number, wy: number) {
        const z = this.getCameraZoom();
        return {
            x: wx * z + this.camera.position.x,
            y: wy * z + this.camera.position.y,
        };
    }

    public render(): void {
        // per-frame hooks if you need them
    }
}

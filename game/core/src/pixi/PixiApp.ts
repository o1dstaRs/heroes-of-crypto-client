import { Application, Container, Ticker } from "pixi.js";

export class PixiApp {
    private app: Application;
    private stage: Container;
    private ticker: Ticker;

    // Game containers
    private backgroundContainer: Container;
    private terrainContainer: Container;
    private unitsContainer: Container;
    private effectsContainer: Container;
    private uiContainer: Container;

    // Camera/viewport
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
        await this.app.init({
            canvas,
            width,
            height,
            backgroundColor: 0x000000,
            backgroundAlpha: 0,
            antialias: true,
            resolution: window.devicePixelRatio,
            autoDensity: true,
        });

        this.setupRendering();
    }

    private setupRendering(): void {
        this.app.canvas.style.position = "absolute";
        this.app.canvas.style.display = "block";
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

    public resize(width: number, height: number): void {
        this.app.renderer.resize(width, height);
    }

    public destroy(): void {
        this.ticker.stop();
        // Pixi v8: use textureSource instead of baseTexture; context is optional but handy
        this.app.destroy(true, {
            children: true,
            texture: true,
            textureSource: true,
            context: true,
        });
    }

    // Camera/viewport
    public setCameraPosition(x: number, y: number): void {
        this.camera.x = -x;
        this.camera.y = -y;
    }

    public setCameraZoom(zoom: number): void {
        this.camera.scale.set(zoom, zoom);
    }

    public getCameraPosition(): { x: number; y: number } {
        return { x: -this.camera.x, y: -this.camera.y };
    }

    public getCameraZoom(): number {
        return this.camera.scale.x;
    }

    public render(): void {
        // Ticker-driven; add custom per-frame logic here if needed.
    }
}

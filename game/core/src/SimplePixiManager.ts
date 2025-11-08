import * as PIXI from "pixi.js";
import { SimplePixiScene } from "./SimplePixiScene";

export class SimplePixiManager {
    private app: PIXI.Application | null = null;
    private scene: SimplePixiScene | null = null;
    public async init(canvas: HTMLCanvasElement): Promise<void> {
        // Initialize PixiJS application
        this.app = new PIXI.Application();
        await this.app.init({
            canvas: canvas,
            width: canvas.width,
            height: canvas.height,
            backgroundColor: 0x1099bb,
            antialias: true,
        });

        // Create scene
        this.scene = new SimplePixiScene(this.app);

        // Add some test sprites
        this.addTestContent();
    }
    private addTestContent(): void {
        if (!this.app || !this.scene) return;

        // Add a simple graphics object
        const graphics = this.scene.addGraphics();
        graphics.beginFill(0xff0000);
        graphics.drawCircle(0, 0, 50);
        graphics.endFill();
        graphics.x = this.app.screen.width / 2;
        graphics.y = this.app.screen.height / 2;
    }
    public update(): void {
        if (this.scene) {
            this.scene.update();
        }
    }
    public destroy(): void {
        if (this.app) {
            this.app.destroy(true);
        }
    }
}

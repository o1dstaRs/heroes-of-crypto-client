import * as PIXI from "pixi.js";

// Simple PixiJS scene that just renders sprites
export class SimplePixiScene {
    private app: PIXI.Application;
    private container: PIXI.Container;
    public constructor(app: PIXI.Application) {
        this.app = app;
        this.container = new PIXI.Container();
        this.app.stage.addChild(this.container);
    }
    // Add a sprite to the scene
    public addSprite(texture: PIXI.Texture, x: number, y: number, width: number, height: number): PIXI.Sprite {
        const sprite = PIXI.Sprite.from(texture);
        sprite.x = x;
        sprite.y = y;
        sprite.width = width;
        sprite.height = height;
        sprite.anchor.set(0.5); // Center anchor
        this.container.addChild(sprite);
        return sprite;
    }
    // Add a graphics object to draw shapes
    public addGraphics(): PIXI.Graphics {
        const graphics = new PIXI.Graphics();
        this.container.addChild(graphics);
        return graphics;
    }
    // Clear all objects from the scene
    public clear(): void {
        this.container.removeChildren();
    }
    // Update the scene (called each frame)
    public update(): void {
        // Simple rotation animation for all sprites
        this.container.children.forEach((child) => {
            if (child instanceof PIXI.Sprite) {
                child.rotation += 0.01;
            }
        });
    }
}

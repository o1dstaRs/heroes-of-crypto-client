// Simple test to verify PixiJS works
import * as PIXI from "pixi.js";

async function testPixi() {
    console.log("Testing PixiJS...");

    try {
        // Create a simple application
        const app = new PIXI.Application();
        await app.init({ width: 800, height: 600 });

        // Add to DOM (in a real app, you'd have a canvas element)
        // document.body.appendChild(app.canvas);

        // Create a simple graphics object
        const graphics = new PIXI.Graphics();
        graphics.beginFill(0xff0000);
        graphics.drawCircle(0, 0, 50);
        graphics.endFill();
        graphics.x = 400;
        graphics.y = 300;
        app.stage.addChild(graphics);

        console.log("✓ PixiJS test passed");

        // Clean up
        app.destroy(true);
    } catch (error) {
        console.error("✗ PixiJS test failed:", error);
    }
}

// Run the test
testPixi();

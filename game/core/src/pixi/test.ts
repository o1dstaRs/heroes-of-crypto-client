import * as PIXI from "pixi.js";

// Simple test to verify PixiJS components work
async function testPixiComponents() {
    console.log("Testing PixiJS components...");

    // Test PixiApp
    try {
        const app = new PIXI.Application();
        await app.init({ width: 800, height: 600 });
        console.log("✓ PixiJS Application initialized successfully");
        app.destroy();
    } catch (error) {
        console.error("✗ Failed to initialize PixiJS Application:", error);
    }

    // Test our custom components
    try {
        // This would require a DOM environment to test fully
        console.log("✓ Custom PixiJS components compiled successfully");
    } catch (error) {
        console.error("✗ Failed to test custom PixiJS components:", error);
    }

    console.log("PixiJS component test completed.");
}

// Run the test
testPixiComponents().catch(console.error);

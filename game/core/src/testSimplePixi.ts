// Simple test to verify PixiJS can be imported
import * as PIXI from "pixi.js";

console.log("PixiJS version:", PIXI.VERSION);

// Test basic functionality
const app = new PIXI.Application();
app.destroy(); // Clean up the application
console.log("PixiJS Application created and destroyed successfully");

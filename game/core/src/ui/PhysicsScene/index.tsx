// import React, { useEffect, useRef } from "react";
// import * as PIXI from "pixi.js";

// const PixiScene: React.FC = () => {
//     const sceneRef = useRef<HTMLDivElement>(null);

//     useEffect(() => {
//         if (!sceneRef.current) {
//             console.error("Scene ref is not available");
//             return;
//         }

//         // Create a Pixi Application with updated options
//         const app = new PIXI.Application<HTMLCanvasElement>();

//         // Add the Pixi canvas to the DOM
//         sceneRef.current.appendChild(app.canvas);

//         // Create a container for our circles
//         const circlesContainer = new PIXI.Container();
//         app.stage.addChild(circlesContainer);

//         // Create multiple circles
//         const circles: PIXI.Graphics[] = [];
//         for (let i = 0; i < 50; i++) {
//             const circle = new PIXI.Graphics();
//             circle.beginFill(0x4285f4);
//             circle.drawCircle(0, 0, 10 + Math.random() * 20);
//             circle.endFill();
//             circle.x = Math.random() * app.screen.width;
//             circle.y = Math.random() * app.screen.height;
//             circlesContainer.addChild(circle);
//             circles.push(circle);
//         }

//         // Create a light source at the center
//         const lightSource = {
//             x: app.screen.width / 2,
//             y: app.screen.height / 2,
//         };

//         // Create a lighting effect
//         const lightingEffect = new PIXI.Graphics();
//         app.stage.addChild(lightingEffect);

//         // Update function
//         const update = () => {
//             lightingEffect.clear();
//             lightingEffect.beginFill(0xffffff, 0.1);
//             lightingEffect.drawCircle(lightSource.x, lightSource.y, 300);
//             lightingEffect.endFill();

//             circles.forEach((circle) => {
//                 const dx = circle.x - lightSource.x;
//                 const dy = circle.y - lightSource.y;
//                 const distance = Math.sqrt(dx * dx + dy * dy);
//                 const brightness = Math.max(0, 1 - distance / 300);
//                 circle.tint = PIXI.utils.rgb2hex([brightness, brightness, brightness]);
//             });
//         };

//         // Add the update function to the ticker
//         app.ticker.add(update);

//         // Cleanup function
//         return () => {
//             app.destroy(true, { children: true, texture: true, baseTexture: true });
//         };
//     }, []);

//     return <div ref={sceneRef} style={{ width: "800px", height: "600px" }} />;
// };

// export default PixiScene;

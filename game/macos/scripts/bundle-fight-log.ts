import { copyFileSync } from "node:fs";
import { join } from "node:path";

import { resolveImagesLocation } from "../../core/src/assetLocations";

const destination = process.argv[2];
if (!destination) throw new Error("Pass the app's Resources directory.");
const assets = ["ui_container_frame_2_9slice", "fight_log_scrollbar_thumb_gothic_v1"];

if (process.env.HOC_IMAGES_LOC) {
    const source = resolveImagesLocation(process.env);
    for (const key of assets) copyFileSync(join(source, `${key}.webp`), join(destination, `${key}.webp`));
}

const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "../../core/src/ui/RightSideBar/NativeFightLog.tsx")],
    target: "browser",
    format: "iife",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
    plugins: [
        {
            name: "local-battle-log-art",
            setup(build) {
                build.onResolve({ filter: /(?:^|\/)generated\/image_imports$/ }, ({ path }) => ({
                    path,
                    namespace: "log-images",
                }));
                build.onLoad({ filter: /.*/, namespace: "log-images" }, () => ({
                    contents: `export const images = ${JSON.stringify(Object.fromEntries(assets.map((key) => [key, `${key}.webp`])))};`,
                    loader: "js",
                }));
            },
        },
    ],
});
if (!result.success) throw new AggregateError(result.logs, "Could not bundle the web fight log");
// The WebKit page loads a classic script from disk. Check that the bundle has no module-only syntax.
new Function(await result.outputs[0].text());
await Bun.write(join(destination, "native-fight-log.js"), result.outputs[0]);
await Bun.write(
    join(destination, "native-fight-log.html"),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' file:; style-src 'unsafe-inline'; img-src 'self' file:; font-src 'self' file:">
<title>Battle log</title>
<style>
@font-face { font-family: "HoC Forge"; src: url("HoCForge-Regular.ttf") format("truetype"); font-display: swap; }
html, body, #fight-log { margin: 0; width: 100%; height: 100%; overflow: hidden; }
body {
    background: #080706;
    font: 14px "HoC Forge", Georgia, "Times New Roman", serif;
    --joy-fontFamily-body: "HoC Forge", Georgia, "Times New Roman", serif;
    --joy-fontFamily-display: var(--joy-fontFamily-body);
    color-scheme: dark;
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .001ms !important; } }
</style>
<script src="native-fight-log.js" defer></script>
</head>
<body><main id="fight-log" aria-label="Battle log"></main></body>
</html>`,
);

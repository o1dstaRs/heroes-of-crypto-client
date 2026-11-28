import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CONTACT_FIELD_SIZE } from "../../core/src/scenes/ArachnaWebContacts";
import { createArachnaDewShader } from "../../core/src/scenes/ArachnaWebDew";
import { ARACHNA_WEB_PULSE_FINISH, createArachnaWebSilkShader } from "../../core/src/scenes/ArachnaWebSilkShader";
import { createArachnaWebSpiderShader } from "../../core/src/scenes/ArachnaWebSpiderShader";
import { WEB_NODES } from "../../core/src/scenes/ArachnaWebStructure";
import { arachnaTensionFootprint } from "../../core/src/scenes/ArachnaWebTension";

const resources = process.argv[2];
if (!resources) throw new Error("Pass the app's Resources directory.");

const core = fileURLToPath(new URL("../../core/", import.meta.url));
const { BufferImageSource, DOMAdapter } = await import(Bun.resolveSync("pixi.js", core));
const adapter = DOMAdapter.get();
DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement });

function source(shader: ReturnType<typeof createArachnaWebSilkShader>) {
    const { vertex, fragment } = shader.glProgram ?? {};
    if (!vertex || !fragment) throw new Error("An Arachna aura shader is missing its GLSL source.");
    // Desktop GL uses the same material with a different version and default precision.
    const desktop = (text: string) =>
        text.replace(/^#version 300 es/m, "#version 150").replace(/^\s*precision[^;]+;/gm, "");
    return { vertex: desktop(vertex), fragment: desktop(fragment) };
}

const contact = new BufferImageSource({
    resource: new Uint8Array(CONTACT_FIELD_SIZE ** 2 * 4),
    width: CONTACT_FIELD_SIZE,
    height: CONTACT_FIELD_SIZE,
    format: "rgba8unorm",
});
const finish = ARACHNA_WEB_PULSE_FINISH;
await Bun.write(
    join(resources, "arachna-aura.json"),
    JSON.stringify({
        silk: source(createArachnaWebSilkShader(false, contact)),
        spiders: source(createArachnaWebSpiderShader()),
        dew: source(createArachnaDewShader()),
        contactSize: CONTACT_FIELD_SIZE,
        pulseFinish: [finish.opacity, finish.nodeGlint, finish.afterglow],
    }),
);

const bundle = await Bun.build({
    entrypoints: [join(import.meta.dir, "arachna-aura-frames.ts")],
    outdir: resources,
    format: "iife",
    target: "browser",
    minify: true,
    define: { "process.env": "{}" },
});
if (!bundle.success) throw new Error("Could not bundle Arachna Queen's web geometry.");

// The branch and reflection paths are static. Bake them with the same graph solver used by the browser.
let entries = 0;
const offsets = [0];
const footprints = WEB_NODES.map((_, index) => {
    const footprint = arachnaTensionFootprint(index);
    entries += footprint.length;
    offsets.push(entries);
    return new Float64Array(
        footprint.flatMap(({ cell, distance, reflection, weight }) => [cell, distance, reflection, weight]),
    );
});
const header = new Float64Array([WEB_NODES.length, ...offsets, ...WEB_NODES.flatMap(({ x, y }) => [x, y])]);
await Bun.write(join(resources, "arachna-aura-tension.bin"), new Blob([header, ...footprints]));

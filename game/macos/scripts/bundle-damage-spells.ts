import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveAnimationsOutputLocation } from "../../core/src/assetLocations";
import { animationAtlases } from "../../core/src/generated/animation_atlases";
import { FIRE_WALL_AFTERBURN_SEC } from "../../core/src/scenes/sandbox/FireWallCrossingEffect";
import { FIRE_RING_LIFE_MS, METEOR_FALL_MS, METEOR_IMPACT_MS } from "../../core/src/scenes/sandbox/SpellFireSprites";
import { FIRE_STRIKE_BURN_MS, FIRE_STRIKE_EXPLOSION_SPEED } from "../../core/src/scenes/sandbox/SpellFireParticles";
import { LIGHTNING_LEAD_MS, LIGHTNING_LIFE_MS } from "../../core/src/scenes/sandbox/ThunderbirdLightningTiming";
import {
    FIREBALL_FLIGHT,
    FIRE_SPELL_PLAYBACK_SPEED,
    FIRE_STRIKE_FLIGHT,
    FIRE_STRIKE_RELEASE_MS,
    SPELL_PROJECTILE_CAST_RELEASE_FRACTION,
} from "../../core/src/settings/fireSpellTiming";

const output = process.argv[2];
const artwork = [
    { id: -1, key: "vfx_ring_fire_hollow_burst_atlas", name: "Vfx Ring Fire Hollow", clip: "burst" },
    { id: -2, key: "vfx_ring_fire_burst_atlas", name: "Vfx Ring Fire", clip: "burst" },
    { id: -3, key: "vfx_meteor_shower_impact_atlas", name: "Vfx Meteor Shower", clip: "impact" },
] as const;
const atlases = [
    animationAtlases["Vfx Ring Fire Hollow"].burst,
    animationAtlases["Vfx Ring Fire"].burst,
    animationAtlases["Vfx Meteor Shower"].impact,
];
const assets = Object.fromEntries(artwork.map(({ key }) => [key, key]));
const metadata = Object.fromEntries(artwork.map(({ name, clip }, index) => [name, { [clip]: atlases[index] }]));
if (process.env.HOC_ANIMATIONS_LOC) {
    const releases = join(resolveAnimationsOutputLocation(process.env), "q93_atlases_v1");
    const directory = join(output, "Atlases");
    mkdirSync(directory, { recursive: true });
    for (const { key } of artwork) {
        copyFileSync(join(releases, key, "atlas", `${key}.webp`), join(directory, `${key}.webp`));
    }
}
writeFileSync(
    join(output, "damage-spells.json"),
    JSON.stringify({
        atlases: artwork.map(({ id, key }, index) => ({ id, resource: `${key}.webp`, ...atlases[index].layout })),
        speed: FIRE_SPELL_PLAYBACK_SPEED,
        releaseFraction: SPELL_PROJECTILE_CAST_RELEASE_FRACTION,
        strikeWindup: FIRE_STRIKE_RELEASE_MS,
        strikeFlight: FIRE_STRIKE_FLIGHT,
        ballFlight: FIREBALL_FLIGHT,
        strikeBurn: FIRE_STRIKE_BURN_MS / FIRE_STRIKE_EXPLOSION_SPEED,
        ringLife: FIRE_RING_LIFE_MS,
        meteorLife: METEOR_FALL_MS + METEOR_IMPACT_MS,
        lightningLead: LIGHTNING_LEAD_MS,
        lightningLife: LIGHTNING_LIFE_MS,
        fireWallAfterburn: FIRE_WALL_AFTERBURN_SEC,
    }),
);

const bundle = await Bun.build({
    entrypoints: [join(import.meta.dir, "native-spell-effects.ts")],
    target: "browser",
    format: "iife",
    minify: true,
    define: { "process.env": "{}" },
    plugins: [
        {
            name: "native-spell-display-list",
            setup(build) {
                build.onResolve({ filter: /^pixi\.js$/ }, () => ({ path: join(import.meta.dir, "spell-drawing.ts") }));
                build.onResolve(
                    { filter: /^(\.\.\/){2}(core\/src\/)?generated\/(image_imports|animation_atlases)$/ },
                    ({ path }) => ({ path, namespace: "mac-spell-assets" }),
                );
                build.onLoad({ filter: /.*/, namespace: "mac-spell-assets" }, () => ({
                    contents: `export const images = ${JSON.stringify(assets)}; export const animationAtlases = ${JSON.stringify(metadata)};`,
                    loader: "js",
                }));
            },
        },
    ],
});
if (!bundle.success) throw new AggregateError(bundle.logs, "Could not bundle the web damage spell renderer");
await Bun.write(join(output, "damage-spells.js"), bundle.outputs[0]);

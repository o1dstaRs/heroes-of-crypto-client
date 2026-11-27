import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { animationAtlases } from "../../core/src/generated/animation_atlases";
import {
    GARGANTUAN_IMPACT_AREA_CELLS,
    GARGANTUAN_IMPACT_DURATIONS,
    GARGANTUAN_IMPACT_FRAME_SIZE,
    GARGANTUAN_IMPACT_PAINTED_EXTENT,
} from "../../core/src/scenes/GargantuanStoneImpact";
import { MONK_ORB_RELEASE_FRAME } from "../../core/src/scenes/MonkRangedAnimationFrames";
import {
    BEHOLDER_SHOT_RELEASE_FRAME,
    CENTAUR_SPEAR_RELEASE_FRAME,
    ORC_AXE_RELEASE_FRAME,
    RANGED_PROJECTILE_TEXTURE_KEYS as ART,
} from "../../core/src/scenes/sandbox/rangedProjectileAssets";
import {
    CANNON_FLIGHT_BALL_ANCHOR,
    CANNON_FLIGHT_BALL_DIAMETER,
    CANNON_FLIGHT_FRAME_SIZE,
} from "../../core/src/scenes/TsarCannonImpact";
import { CANNON_SHOT_RELEASE_FRAME } from "../../core/src/scenes/TsarCannonReactions";

interface Projectile {
    resource: string;
    widthCells: number;
    directional?: boolean;
    spin?: number;
    arcCells?: number;
    releaseFrame?: number;
    atlas?: { columns: number; rows: number; frames: number; secondsPerFrame: number };
    anchor?: { x: number; y: number };
    animationSource?: string;
    impact?: {
        resource: string;
        columns: number;
        rows: number;
        durations: number[];
        paintedFraction: number;
        footprint: number;
    };
}

const dart = (key: string, widthCells: number, releaseFrame?: number): Projectile => ({
    resource: `${key}.webp`,
    widthCells,
    directional: true,
    releaseFrame,
});

const medusa = animationAtlases["Medusa Lab"].projectile;
const rockImpact = {
    resource: "vfx_gargantuan_stone_impact_v1_atlas.webp",
    columns: 4,
    rows: 6,
    durations: GARGANTUAN_IMPACT_DURATIONS.map((milliseconds) => milliseconds / 1000),
    paintedFraction: GARGANTUAN_IMPACT_PAINTED_EXTENT / GARGANTUAN_IMPACT_FRAME_SIZE,
    footprint: GARGANTUAN_IMPACT_AREA_CELLS,
};
const fallback = dart(ART.bolt, 0.82);
const shooters: Record<string, Projectile> = {
    Arbalester: dart(ART.arbalester, 0.84),
    Beholder: dart(ART.beholder, 0.944, BEHOLDER_SHOT_RELEASE_FRAME),
    Centaur: dart(ART.centaur, 1.13, CENTAUR_SPEAR_RELEASE_FRAME),
    Cyclops: { resource: `${ART.cyclops}.webp`, widthCells: 0.72, spin: 4, arcCells: 0.4 },
    Dryad: dart(ART.dryadArrow, 0.75),
    Elf: dart(ART.dryadArrow, 0.75),
    Gargantuan: { resource: `${ART.gargantuan}.webp`, widthCells: 1, spin: 3, arcCells: 0.4, impact: rockImpact },
    Medusa: {
        ...dart(`${ART.medusa}_quarter`, 1.08),
        atlas: {
            columns: medusa.layout.cols,
            rows: medusa.layout.rows,
            frames: medusa.frameCount,
            secondsPerFrame: medusa.frameDurationSec,
        },
        animationSource: "medusa_lab_projectile",
    },
    Monk: { resource: `${ART.monk}.webp`, widthCells: 0.496, releaseFrame: MONK_ORB_RELEASE_FRAME },
    Orc: { ...dart(ART.orc, 1.1, ORC_AXE_RELEASE_FRAME), spin: 12 },
    "Tsar Cannon": {
        ...dart(ART.tsarCannon, CANNON_FLIGHT_FRAME_SIZE / CANNON_FLIGHT_BALL_DIAMETER, CANNON_SHOT_RELEASE_FRAME),
        atlas: { columns: 4, rows: 4, frames: 16, secondsPerFrame: 0.04 },
        anchor: CANNON_FLIGHT_BALL_ANCHOR,
        animationSource: "vfx_tsar_cannon_flight_v21",
    },
    Zena: {
        resource: `${ART.zena}.webp`,
        widthCells: 0.68,
        spin: 22.5,
        atlas: { columns: 4, rows: 2, frames: 8, secondsPerFrame: 0.05 },
    },
};

export function bundleProjectiles(output: string): void {
    const images = process.env.HOC_IMAGES_LOC;
    const animations = process.env.HOC_ANIMATIONS_LOC;
    if (images && animations) {
        const atlases = join(output, "Atlases");
        mkdirSync(atlases, { recursive: true });
        const assets = new Map(
            [fallback, ...Object.values(shooters)].map((projectile) => [projectile.resource, projectile]),
        );
        for (const { resource, animationSource } of assets.values()) {
            const source = animationSource
                ? join(animations, "output", animationSource, "atlas", resource)
                : join(images, resource);
            copyFileSync(source, join(atlases, resource));
        }
        copyFileSync(join(images, rockImpact.resource), join(atlases, rockImpact.resource));
    }
    writeFileSync(join(output, "projectiles.json"), JSON.stringify({ fallback, shooters }));
}

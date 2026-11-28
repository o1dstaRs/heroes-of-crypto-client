import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { CreatureVals } from "@heroesofcrypto/common";

import { resolveAnimationsOutputLocation } from "../../core/src/assetLocations";
import { buildAtlasPingPongTiming } from "../../core/src/scenes/atlasAnimationTiming";
import { CREATURE_PORTRAIT_ASPECT } from "../../core/src/ui/creaturePortraitVisual";
import { resolveIntegratedArbalesterPortrait } from "../../core/src/ui/integratedArbalesterPortrait";
import {
    leftSidebarPortraitPlayback,
    resolveLeftSidebarPortraitAnimation,
} from "../../core/src/ui/leftSidebarPortraitAnimation";
import { LEFT_SIDEBAR_ART_SCALE, LEFT_SIDEBAR_ART_SCALE_X } from "../../core/src/ui/leftSidebarPortraitArt";
import { committedLeftSidebarPortraitTuning } from "../../core/src/ui/leftSidebarPortraitTuning";
import { UNIT_ID_TO_NAME } from "../../core/src/ui/unit_ui_constants";

export function bundleSidebarPortraits(output: string): void {
    if (!process.env.HOC_ANIMATIONS_LOC && !process.env.HOC_IMAGES_LOC) return;
    const location = resolveAnimationsOutputLocation(process.env);
    const images = process.env.HOC_IMAGES_LOC;
    const directory = join(output, "SidebarPortraits");
    mkdirSync(directory, { recursive: true });
    const ids = Object.keys(UNIT_ID_TO_NAME)
        .map(Number)
        .filter((id) => id !== CreatureVals.NO_CREATURE);
    const creatures = Object.fromEntries(
        ids.map((id) => {
            const name = UNIT_ID_TO_NAME[id];
            const tuning = committedLeftSidebarPortraitTuning(id);
            const animation = resolveIntegratedArbalesterPortrait(id, resolveLeftSidebarPortraitAnimation(id));
            const artwork = {
                scale: tuning.artScale * LEFT_SIDEBAR_ART_SCALE,
                scaleX: LEFT_SIDEBAR_ART_SCALE_X,
                offsetX: tuning.artOffsetX,
                offsetY: tuning.artOffsetY,
            };
            if (!animation) return [name, artwork];
            const { pages, meta } = animation;
            const master = basename(new URL(animation.src).pathname);
            if (!pages?.length) throw new Error(`The sidebar portrait ${master} has no registered atlas pages.`);
            const folder = join(location, "sidebar_portraits_paged_v1", master.replace(/_atlas\.webp$/, ""), "atlas");
            const reverse = leftSidebarPortraitPlayback(name) === "ping-pong";
            const { forwardMs, holdMs } = buildAtlasPingPongTiming(meta);
            const frameSeconds = reverse ? forwardMs / meta.frameCount / 1000 : 1 / Math.max(0.01, meta.fps || 4);
            return [
                name,
                {
                    ...artwork,
                    animation: {
                        frameSeconds,
                        pauseSeconds: reverse ? holdMs / 1000 : 0,
                        reverse,
                        pages: pages.map(({ src, cols, rows, frameCount }) => {
                            const resource = basename(new URL(src).pathname);
                            const exported = join(folder, resource);
                            const source = existsSync(exported) ? exported : images && join(images, resource);
                            if (!source || !existsSync(source)) {
                                throw new Error(`Missing sidebar portrait page ${resource} under ${folder}.`);
                            }
                            copyFileSync(source, join(directory, resource));
                            return { resource, columns: cols, rows, frameCount };
                        }),
                    },
                },
            ];
        }),
    );
    writeFileSync(
        join(output, "sidebar-portraits.json"),
        JSON.stringify({ aspect: CREATURE_PORTRAIT_ASPECT, creatures }),
    );
}

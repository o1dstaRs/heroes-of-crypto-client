import { BEHEMOTH_IDLE_FRAME_MS } from "../../core/src/scenes/BehemothLabIdle";
import { BLACK_DRAGON_LAB_IDLE_CYCLE_MS } from "../../core/src/scenes/BlackDragonLabIdle";
import { CENTAUR_LAB_IDLE_DURATIONS_MS, CENTAUR_LAB_IDLE_SEQUENCE } from "../../core/src/scenes/CentaurLabIdle";
import { CHAMPION_IDLE_CYCLE_MS, championIdleFrame } from "../../core/src/scenes/ChampionLabIdleMotion";
import {
    CYCLOPS_IDLE_FULL_BODY_PERIOD_MS,
    cyclopsIdleFullBodyFrame,
} from "../../core/src/scenes/CyclopsLabIdleVisuals";
import { EFREET_LAB_IDLE_FRAME_DURATIONS_MS } from "../../core/src/scenes/EfreetLabIdleTiming";
import { FAIRY_LAB_IDLE_DURATIONS_MS, FAIRY_LAB_IDLE_SEQUENCE } from "../../core/src/scenes/FairyLabIdle";
import {
    GRIFFIN_PREEN_PERIOD_MS,
    GRIFFIN_PREEN_START_MS,
    griffinLabIdleFrame,
} from "../../core/src/scenes/GriffinLabIdle";
import { HYDRA_IDLE_FRAME_MS } from "../../core/src/scenes/HydraLabIdle";
import { LEPRECHAUN_IDLE_DURATIONS, LEPRECHAUN_IDLE_POSES } from "../../core/src/scenes/LeprechaunLabIdle";
import { MAGIC_DRAGON_LAB_IDLE_SPEED } from "../../core/src/scenes/MagicDragonLabFlight";
import { pikemanIdleFrame, PIKEMAN_IDLE_PERIOD_MS } from "../../core/src/scenes/PikemanLabIdleMotion";
import { UNICORN_IDLE_DURATIONS_MS } from "../../core/src/scenes/UnicornLabIdleMotion";

type Timeline = { durations: readonly number[]; sequence?: readonly number[]; repeatFrom?: number };

// Record the boundaries from the browser's frame selector. Each of these cels holds for
// several milliseconds, so a unit millisecond probe brackets every change before refinement.
function timelineOf(frameAt: (ms: number) => number, loopStart: number, cycle: number): Timeline {
    const durations: number[] = [];
    const sequence: number[] = [];
    const append = (start: number, end: number) => {
        let first = start;
        let frame = frameAt(start + 0.001);
        for (let ms = start + 1; ms < end; ms += 1) {
            const next = frameAt(ms);
            if (next === frame) continue;
            let low = ms - 1;
            let high = ms;
            for (let i = 0; i < 16; i++) {
                const mid = (low + high) / 2;
                if (frameAt(mid) === frame) low = mid;
                else high = mid;
            }
            durations.push(high - first);
            sequence.push(frame);
            first = high;
            frame = next;
        }
        durations.push(end - first);
        sequence.push(frame);
    };
    if (loopStart > 0) append(0, loopStart);
    const repeatFrom = sequence.length;
    append(loopStart, loopStart + cycle);
    return { durations, sequence, repeatFrom };
}

export function idleTimeline(name: string, holds: readonly number[], pauseMs = 0): Timeline {
    switch (name) {
        case "Fairy":
            return { durations: FAIRY_LAB_IDLE_DURATIONS_MS, sequence: FAIRY_LAB_IDLE_SEQUENCE };
        case "Leprechaun":
            return { durations: LEPRECHAUN_IDLE_DURATIONS, sequence: LEPRECHAUN_IDLE_POSES };
        case "Centaur":
            return { durations: CENTAUR_LAB_IDLE_DURATIONS_MS, sequence: CENTAUR_LAB_IDLE_SEQUENCE };
        case "Pikeman":
            return timelineOf(pikemanIdleFrame, 0, PIKEMAN_IDLE_PERIOD_MS);
        case "Cyclops":
            return timelineOf(cyclopsIdleFullBodyFrame, 0, CYCLOPS_IDLE_FULL_BODY_PERIOD_MS);
        case "Champion":
            return timelineOf(championIdleFrame, CHAMPION_IDLE_CYCLE_MS, CHAMPION_IDLE_CYCLE_MS);
        case "Griffin":
            return timelineOf(griffinLabIdleFrame, GRIFFIN_PREEN_START_MS, GRIFFIN_PREEN_PERIOD_MS);
        case "Unicorn":
            return { durations: UNICORN_IDLE_DURATIONS_MS };
        case "Efreet":
            return { durations: EFREET_LAB_IDLE_FRAME_DURATIONS_MS };
        case "Hydra":
            return { durations: holds.map(() => HYDRA_IDLE_FRAME_MS) };
        case "Behemoth":
            return { durations: holds.map(() => BEHEMOTH_IDLE_FRAME_MS) };
        case "Black Dragon":
            return { durations: holds.map(() => BLACK_DRAGON_LAB_IDLE_CYCLE_MS / holds.length) };
        case "Magic Dragon":
            return { durations: holds.map((ms) => ms / MAGIC_DRAGON_LAB_IDLE_SPEED) };
        case "Elf":
        case "Troll":
            if (pauseMs > 0) {
                return { durations: [...holds, pauseMs], sequence: [...holds.map((_, i) => i), 0] };
            }
            return { durations: holds };
        default:
            return { durations: holds };
    }
}

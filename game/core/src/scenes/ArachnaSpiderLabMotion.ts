import { type QueenBite } from "./ArachnaQueenLabBile";
export const SPIDER_ATTACK_DURATIONS_MS = [60, 110, 80, 100, 160, 90] as const;
export const SPIDER_IMPACT_MS = 250;
export const SPIDER_LAB_GROUND_OFFSET_CELLS = -0.1;
export const SPIDER_LANDMARKS = {
    attack: [
        { eye: [429, 509], far: [456, 502], mouth: [450, 558] },
        { eye: [408, 555], far: [434, 549], mouth: [418, 595] },
        { eye: [476, 532], far: [502, 522], mouth: [495, 583] },
        { eye: [457, 560], far: [482, 552], mouth: [477, 595] },
        { eye: [431, 542], far: [455, 536], mouth: [445, 576] },
        { eye: [429, 509], far: [456, 502], mouth: [450, 558] },
    ],
    attack_up: [
        { eye: [429, 509], far: [456, 502], mouth: [450, 558] },
        { eye: [436, 551], far: [463, 543], mouth: [457, 585] },
        { eye: [432, 403], far: [454, 390], mouth: [455, 452] },
        { eye: [467, 414], far: [493, 404], mouth: [493, 449] },
        { eye: [430, 539], far: [456, 531], mouth: [450, 575] },
        { eye: [429, 509], far: [456, 502], mouth: [450, 558] },
    ],
    attack_down: [
        { eye: [429, 509], far: [456, 502], mouth: [450, 558] },
        { eye: [417, 483], far: [444, 477], mouth: [437, 523] },
        { eye: [432, 552], far: [459, 542], mouth: [450, 585] },
        { eye: [419, 562], far: [445, 553], mouth: [437, 596] },
        { eye: [430, 537], far: [456, 522], mouth: [453, 564] },
        { eye: [429, 509], far: [456, 502], mouth: [450, 558] },
    ],
    walk: [
        { eye: [435, 489], far: [464, 479], mouth: [453, 536] },
        { eye: [434, 505], far: [461, 494], mouth: [456, 553] },
        { eye: [429, 492], far: [463, 480], mouth: [453, 540] },
        { eye: [431, 500], far: [458, 491], mouth: [452, 546] },
        { eye: [432, 516], far: [459, 503], mouth: [456, 556] },
        { eye: [429, 496], far: [457, 480], mouth: [449, 536] },
        { eye: [422, 493], far: [446, 482], mouth: [446, 543] },
        { eye: [421, 487], far: [446, 477], mouth: [444, 528] },
    ],
} as const;
export function spiderBitePose(state: QueenBite, frame: number, elapsedMs: number) {
    const poses = SPIDER_LANDMARKS[state.replace("melee_", "") as "attack" | "attack_up" | "attack_down"];
    const cel = Math.max(0, Math.min(poses.length - 1, Math.floor(frame)));
    const angle = state === "melee_attack_up" ? -0.58 : state === "melee_attack_down" ? 0.58 : 0;
    const age = elapsedMs - SPIDER_IMPACT_MS;
    return {
        ...poses[cel],
        origin: poses[3].mouth,
        direction: [Math.cos(angle), Math.sin(angle)],
        burstSeconds: age >= 0 && age < 320 ? age / 1000 : -1,
    };
}

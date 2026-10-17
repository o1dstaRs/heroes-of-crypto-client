export type CannonReaction = "hit" | "death";
export type CannonAttack = "attack" | "attack_up" | "attack_down";
export type CannonMeleeAttack = "melee_attack" | "melee_attack_up" | "melee_attack_down";
export type CannonAuthoredAction = CannonReaction | CannonAttack | CannonMeleeAttack;
export const isCannonAttack = (state?: string): state is CannonAttack =>
    state === "attack" || state === "attack_up" || state === "attack_down";
export const isCannonMeleeAttack = (state?: string): state is CannonMeleeAttack =>
    state === "melee_attack" || state === "melee_attack_up" || state === "melee_attack_down";
export const isCannonMechanicalAttack = (state?: string): state is CannonAttack | CannonMeleeAttack =>
    isCannonAttack(state) || isCannonMeleeAttack(state);
export const isCannonAuthoredAction = (state?: string): state is CannonAuthoredAction =>
    isCannonReaction(state) || isCannonMechanicalAttack(state);
export const CANNON_SHOT_RELEASE_FRAME = 4;
export const CANNON_ATTACK_DURATIONS = [50, 50, 50, 50, 24, 24, 30, 30, ...Array<number>(16).fill(40)].map(
    (ms) => ms / 2,
);
export const cannonAttackAngle = (state: CannonAttack): number =>
    ((state === "attack_up" ? -14 : state === "attack_down" ? 12 : 0) * Math.PI) / 180;
export function cannonShotOrigin(state: CannonAttack): { x: number; y: number } {
    const a = cannonAttackAngle(state),
        c = Math.cos(a),
        s = Math.sin(a);
    return {
        x: 128 + 420 + c * (725 - 420 - 8) - s * (333 - 374),
        y: 128 + 374 + s * (725 - 420 - 8) + c * (333 - 374),
    };
}

export const isCannonReaction = (state?: string): state is CannonReaction => state === "hit" || state === "death";

export const CANNON_REACTION_SPEED = 2.25;
export const CANNON_HIT_SPEED_MULTIPLIER = 1.4;
export const CANNON_DEATH_SPEED_MULTIPLIER = 1.3 * 1.2;
export const CANNON_REACTION_CANVAS_SCALE = 1024 / 768;
export const cannonReactionAnchorY = (idleAnchorY: number): number => (128 + idleAnchorY * 768) / 1024;

export const CANNON_REACTION_DURATIONS = {
    hit: [35, 35, 55, 50, 55, 55, 60, 55].map((ms) => ms / (CANNON_REACTION_SPEED * CANNON_HIT_SPEED_MULTIPLIER)),
    death: [55, 65, 65, 75, 80, 90, 100, 120, 140, 160, 200].map(
        (ms) => ms / (CANNON_REACTION_SPEED * CANNON_DEATH_SPEED_MULTIPLIER),
    ),
} satisfies Record<CannonReaction, number[]>;

export const cannonReactionAtlasKey = (state: CannonAuthoredAction) =>
    isCannonReaction(state)
        ? (`tsar_cannon_lab_v21_${state}_atlas` as const)
        : isCannonMeleeAttack(state)
          ? (`tsar_cannon_lab_v25_${state}_atlas` as const)
          : (`tsar_cannon_lab_v26_${state}_atlas` as const);

/** Exact trunnion transform used to author all 24 ranged and melee cels. */
export function cannonAttackPose(state: CannonAttack | CannonMeleeAttack, frame: number): Float32Array {
    const i = Math.max(0, Math.min(23, Math.floor(frame)));
    const aim = i < 3 ? [0, 0.4, 0.8][i] : i < 16 ? 1 : Math.max(0, (23 - i) / 7);
    const recoil = i < 4 ? 0 : ([8, 34, 46, 40, 32, 24, 17, 11, 6, 3, 0][i - 4] ?? 0);
    const angle = (((state.endsWith("_up") ? -14 : state.endsWith("_down") ? 12 : 0) * Math.PI) / 180) * aim;
    return new Float32Array([1024, 128, angle, recoil && isCannonMeleeAttack(state) ? -recoil : recoil]);
}

/** Painted full frames own their motion and effects; the idle barrel filter must not replace them. */
export function cannonReactionMeta(state: CannonAuthoredAction, footAnchorY: number) {
    const durations = isCannonMechanicalAttack(state) ? CANNON_ATTACK_DURATIONS : CANNON_REACTION_DURATIONS[state];
    const totalMs = durations.reduce((sum, duration) => sum + duration, 0);
    return {
        frameWidth: 1024,
        frameHeight: 1024,
        atlasWidth: 4096,
        atlasHeight: Math.ceil(durations.length / 4) * 1024,
        frameCount: durations.length,
        fps: (durations.length * 1000) / totalMs,
        frameDurationSec: totalMs / durations.length / 1000,
        totalDurationSec: totalMs / 1000,
        loopDurationMs: totalMs,
        pauseMs: 0,
        frameDurationsMs: [...durations],
        layout: { cols: 4, rows: Math.ceil(durations.length / 4) },
        footAnchorY: cannonReactionAnchorY(footAnchorY),
    };
}
